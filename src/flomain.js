
const EventEmitter = require('events');
const axios = require('axios');
const storage = require('node-persist');

// URL constant for retrieving data
const FLO_V1_API_BASE = 'https://api.meetflo.com/api/v1';
const FLO_V2_API_BASE = 'https://api-gw.meetflo.com/api/v2';
const FLO_AUTH_URL       = FLO_V1_API_BASE + '/users/auth';
const FLO_USERTOKENS_URL = FLO_V1_API_BASE + '/usertokens/me';
const FLO_PRESENCE_HEARTBEAT = FLO_V2_API_BASE + '/presence/me';
// Generic header for Safari macOS to interact with Flo api
const FLO_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15';

const FLO_WATERSENSOR ='puck_oem';
const FLO_SMARTWATER = 'flo_device_v2';

class FlobyMoem extends EventEmitter {
    
       
    auth_token = {};
    flo_devices = [];
    flo_locations = [];
    tokenRefreshHandle;
    deviceRefreshHandle;
    alertRefreshHandle;
    deviceRefreshTime;
    log;
    debug;

    constructor(log, config,debug) {
        super();
        this.log = log || console.log;
        this.debug = debug || console.debug;
        this.tokenRefreshHandle = null;
        this.deviceRefreshHandle = null;
        this.alertRefreshHandle = null;
        this.deviceRefreshTime = config.deviceRefresh * 1000 || 30000;
        this.auth_token.username = config.auth.username;
        this.auth_token.password = config.auth.password;
        
    };

    async init() {

        // retrieve login storage login inoformation
        // Initializes the storage
        await storage.init();
        // Get persist items, if exist...
        this.auth_token.user_id  = await storage.getItem('user_id'); 
        this.auth_token.expiry = await storage.getItem('expiry'); 
        this.auth_token.token = await storage.getItem('token'); 

        // If token not present or expired obtain new token
        if (!this.isLoggedIn()) {
                // obtain new token
                await this.refreshToken();
        }
        else
        {
             // Set timer to obtain new token
             this.log.info("Using cache Flo token.");
             var refreshTimeoutmillis = Math.floor(this.auth_token.expiry - Date.now());
             this.log.info(`Token will refresh in ${Math.floor((refreshTimeoutmillis / (1000 * 60 * 60)) % 24)} hour(s) and ${Math.floor((refreshTimeoutmillis / (1000 * 60 )) % 60)} mins(s).`);
            // this.tokenRefreshHandle = setTimeout(() => this.refreshToken(), refreshTimeoutmillis); 
            // Display temporary access 
            if (this.debug) this.log.debug("Temporary Access Flo Token: " + this.auth_token.token);
            // Build query header for future transactions
            this.auth_token.header = {
            headers: {
                    'User-Agent': FLO_USER_AGENT,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Accept': 'application/json',
                    'authorization': this.auth_token.token
                    }
            };
        

        }
        return true;
      
    };

    isLoggedIn() {
        // determine time the elapse between now and token usage.
        let tokenExpiration = Math.floor(this.auth_token.expiry - Date.now());
        return ((this.auth_token.token != undefined) && (tokenExpiration > 0));
    };

    async refreshToken() {

         // Do we have an outstanding timer for another refresh? 
         // Clear any existing timer
        // if (this.tokenRefreshHandle) 
        // {
        //     clearTimeout(this.tokenRefreshHandle);
        //     this.tokenRefreshHandle = null;
        // }
        // Try to login using username and password to obtain a new token
        this.log.info("Refreshing Token...");
        
        try {
           
            const response = await axios.post(FLO_AUTH_URL, {
            'username': this.auth_token.username,
            'password': this.auth_token.password });
            // Successful login, store token and built transaction header data for future transactions
            this.auth_token.token = response.data.token;
            this.auth_token.user_id = response.data.tokenPayload.user.user_id;

            // Calculated expiration time assume half life of token provided
            this.auth_token.expiry = Date.now() + ((response.data.tokenExpiration * 1000)/2); 

            // store for later use user ID, token and expiration date, if system is restarted for any reason.
            storage.setItem('user_id',this.auth_token.user_id);
            storage.setItem('token',this.auth_token.token);
            storage.setItem('expiry',this.auth_token.expiry);

            // Display temporary access 
            if (this.debug) this.log.debug("Temporary Access Flo Token: " + this.auth_token.token);
             // Build query header for future transactions
            this.auth_token.header = {
            headers: {
                    'User-Agent': FLO_USER_AGENT,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Accept': 'application/json',
                    'authorization': this.auth_token.token
                    }
            };
        
        }
        catch(err) {
            // Something went wrong, display message and return negative return code
            this.log.error("Login Error: " + err.message);
            return false;
        } 

        // Set timer to obtain new token
        var refreshTimeoutmillis = Math.floor(this.auth_token.expiry - Date.now());
        // Display refreshing token information 
        this.log.info(`Token will refresh in ${Math.floor((refreshTimeoutmillis / (1000 * 60 * 60)) % 24)} hour(s) and ${Math.floor((refreshTimeoutmillis / (1000 * 60 )) % 60)} mins(s).`);
        ///this.tokenRefreshHandle = setTimeout(() => this.refreshToken(), refreshTimeoutmillis); 
        return true;
        
    };

    // Discover and configure  that have been registered for this account. 
      async discoverDevices() {

         // Do we have a valid sessions? 
         if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        // Create path for locations listing
        var url = FLO_V2_API_BASE + "/users/" + this.auth_token.user_id + "?expand=locations";
        
        try {
            // Get devices at location 
            const loc_response = await axios.get(url, this.auth_token.header);
            var locations_info = loc_response; 
            // Get each device at each location
            for (var i = 0; i < locations_info.data.locations.length; i++) {
                    // Store location for future use
                    this.flo_locations[i] = locations_info.data.locations[i].id;
                    // for each location get devices
                    for (var z = 0; z < locations_info.data.locations[i].devices.length; z++) {
                        url = FLO_V2_API_BASE + "/devices/" + locations_info.data.locations[i].devices[z].id;
                        
                        try {
                            const device_response = await axios.get(url, this.auth_token.header);
                            var device_info = device_response;
                            // create flo device object
                            var device = {};
                            // Store key information about device
                            device.name = device_info.data.nickname;
                            device.deviceModel = device_info.data.deviceModel;
                            device.type = device_info.data.deviceType;
                            device.serialNumber = device_info.data.serialNumber;
                            device.location = device_info.data.location.id;
                            device.deviceid = device_info.data.id;
                            device.temperature = device_info.data.telemetry.current.tempF;
                            device.notifications = device_info.data.notifications.pending;
                            device.lastUpdate = new Date(device_info.data.lastHeardFromTime);
                            // determine type of device and set proper data elements
                            switch (device_info.data.deviceType) {
                                case FLO_WATERSENSOR:
                                    device.humidity = device_info.data.telemetry.current.humidity;
                                    // Return whether water is detected, for leak detectors.
                                    device.waterdetect = device_info.data.fwProperties.telemetry_water;
                                    // Return the battery level for battery-powered device, e.g. leak detectors
                                    device.batterylevel = device_info.data.battery.level;
                                    break;
                                case FLO_SMARTWATER:
                                    device.psi = device_info.data.telemetry.current.psi;
                                    device.systemCurrentState = device_info.data.systemMode.lastKnown;
                                    device.systemTargetState = device_info.data.systemMode.target;
                                    device.valveCurrentState = device_info.data.valve.lastKnown;
                                    device.valveTargetState = device_info.data.valve.target;
                                    break;
                            } 
                            // Store device in array, the array will store all of users device in all location.
                            this.flo_devices.push(device);

                        } 
                        catch(err) {
                            this.log.error("Device Error: " + err.message);
                        };
                    }
                }
                return true;
        } catch(err) {
            this.log.error("Location Load Error: " + err.message);
            return false;
        }

    };

    async setSystemMode(newState) {
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }

    };

    async getSystemAlerts() {
        
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await refreshToken();
        }
       
        var statusheader = { 'isInternalAlarm': 'false',
                   'locationId': this.flo_locations[0],
                   'status': 'triggered',
                   'severity': 'warning', 
                   //'severity': 'critical',
                   'page': 1,
                   'size': 100
        }

        var systemstatusheader = {
                ...this.auth_token.header,
                ...statusheader
        }
        this.log.info(systemstatusheader);

        
        var url = FLO_V2_API_BASE + "/alerts";
        try {
            const alarm_response = await axios.get(url, systemstatusheader);
            this.log.info(alarm_response.data);
        }
        catch (err)
        {
            this.log.error("Getting Alerts Error:  " + err.message);
        }
    };

    async refreshDevice(device) {

        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        // Get device
        var url = FLO_V2_API_BASE + "/devices/" + device.deviceid;     
               
        try {
            var device_info = await axios.get(url, this.auth_token.header);
            
            // Has the object been updated? If the device has not been heard from, no change is needed
            let deviceUpdateTime = new Date(device_info.data.lastHeardFromTime);
            if (deviceUpdateTime.getTime() == device.lastUpdate.getTime()) {
                if (this.debug) this.log.debug(device.name + " has no updates.");
                return true;
            }

            // Update key information about device
            if (this.debug) this.log.debug("Device Updated Data: ", device_info);

            device.lastUpdate = new Date(device_info.data.lastHeardFromTime);
            device.temperature = device_info.data.telemetry.current.tempF;
            device.notifications = device_info.data.notifications.pending;

            // determine type of device and update the proper data elements
            switch (device.type) {
                case FLO_WATERSENSOR:
                    device.humidity = device_info.data.telemetry.current.humidity;
                    // Return whether water is detected, for leak detectors.
                    device.waterdetect = device_info.data.fwProperties.telemetry_water;
                    // Return the battery level for battery-powered device, e.g. leak detectors
                    device.batterylevel = device_info.data.battery.level;
                break;
                case FLO_SMARTWATER:
                    device.psi = device_info.data.telemetry.current.psi;
                    device.systemCurrentState = device_info.data.systemMode.lastKnown;
                    device.systemTargetState = device_info.data.systemMode.target;
                    device.valveCurrentState = device_info.data.valve.lastKnown;
                    device.valveTargetState = device_info.data.valve.target;
                break;
            } 
            // change were detected updata device data elements and trigger updata.
            this.emit(device.serialNumber, {
                device: device
            });
            return true;
                            
        } 
        catch(err) {
                // Something went wrong, display error and return.
                this.log.error("Device Refresh Error:  " + err.message);
                return false;
        };
    };

    async backgroundRefresh() {

         // clear device timer and begin refreshing device data
         if (this.deviceRefreshHandle) 
         {
             clearTimeout(this.deviceRefreshHandle);
             this.deviceRefreshHandle = null;
         }
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            // Token is expired or not login, start sessior with meetflo portal.
            await this.refreshToken();
        }
        // Updata all data elements
        for (var i = 0; i < this.flo_devices.length; i++) {
            let loc_device = this.flo_devices[i];
            this.refreshDevice(loc_device).then ( dev_result => {                
            })
        }
       
        // Set timer to refresh devices
       this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
       

    };

    async generateHeartBeat()
    {
        // Create browser header information to ping Flo cloud service to refreshing data from flo
        var header = { 
            'Connection': 'keep-alive',
            'Content-Length': 0,
            'sec-ch-ua': '(Not;Browser"; v="12", "Chromium"; v="73',
            'Accept': 'application/json, text/plain, */*',
            'DNT': 1,
            'sec-ch-ua-mobile': '?0',
            'Origin': 'https://user.meetflo.com',
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Referer': 'https://user.meetflo.com/',
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
        }
        var heatbeatrequest = {
            ...this.auth_token.header,
            ...header
        }
        // Generate presence heatbeat
        try {
            const response = await axios.post(FLO_PRESENCE_HEARTBEAT,"", heatbeatrequest);
            this.log("Heatbeat posted successful.")
        } catch(err)
        {
            this.log.error("Error: " + err.message);
            
        }

    }
   InAlertsStatus(device)
    {
        if ((device.notifications.pending.warningCount > 0) ||  (device.notifications.pending.criticalCount > 0)) 
            return true;
        else    
            return false;

    };
}
          
module.exports = FlobyMoem;