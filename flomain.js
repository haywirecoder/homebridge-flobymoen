
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
    excludedDevices = []
    tokenRefreshHandle;
    deviceRefreshHandle;
    alertRefreshHandle;
    deviceRefreshTime;
    sleepRevertMinutes;
    log;
    persistPath;

    constructor(log, config, persistPath) {
        super();
        this.log = log || console.log;
        this.persistPath = persistPath;
        this.tokenRefreshHandle = null;
        this.deviceRefreshHandle = null;
        this.alertRefreshHandle = null;
        this.deviceRefreshTime = config.deviceRefresh * 1000 || 90000;
        this.pingRefreshTime = config.pingRefresh * 3600000 || 0;
        this.sleepRevertMinutes = config.sleepRevertMinutes || 120;
        this.excludedDevices = config.excludedDevices || [];
        this.auth_token.username = config.auth.username;
        this.auth_token.password = config.auth.password;
        this.isBusy = false;
        
    };

    async init() {

        // Retrieve login storage login inoformation
        if(this.persistPath != undefined)
        {
            // Initializes the storage
            await storage.init({dir:this.persistPath, forgiveParseErrors: true});
            // Get persist items, if exist...
            this.auth_token.user_id  = await storage.getItem('user_id'); 
            this.auth_token.expiry = await storage.getItem('expiry'); 
            this.auth_token.token = await storage.getItem('token'); 
            // Set timer to obtain new token
            this.log.info("Flo Info: Using local cache Flo token.");
           
        }
        else  
            this.log.info("Flo Info: Local caching of Flo token is disabled.");

        // If token not present or expired obtain new token
        if (!this.isLoggedIn()) {
                // obtain new token
                await this.refreshToken();
        }
        else
        {
            var refreshTimeoutmillis = Math.floor(this.auth_token.expiry - Date.now());
            this.log.info(`Flo Info: Token will refresh in ${Math.floor((refreshTimeoutmillis / (1000 * 60 * 60)) % 24)} hour(s) and ${Math.floor((refreshTimeoutmillis / (1000 * 60 )) % 60)} min(s).`);
            // Display temporary access 
            this.log.debug("Temporary Access Flo Token: " + this.auth_token.token);
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

    startPollingProcess()
    {
        // Set time to refresh devices
       this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
       if (this.pingRefreshTime > 0) {
           this.startPingProcess();
           this.log.info(`Force Flo Cloud synch each ${this.pingRefreshTime/3600000} hour.`);   
        }  
    };

    startPingProcess()
    {
        // Set time to send ping for cloud service to obtain/update data 
        this.pingHandle = setTimeout(() => this.generatePing(), this.pingRefreshTime); 
     
    };

    isLoggedIn() {
        // determine time the elapse between now and token usage.
        let tokenExpiration = Math.floor(this.auth_token.expiry - Date.now());
        return ((this.auth_token.token != undefined) && (tokenExpiration > 0));
    };

    // After login Flo system returns a token that used for all transaction. This topic must be periodically refresh
    // This method login, gets the token and store for later transaction.
    async refreshToken() {

        this.log.info("Flo Status: Refreshing Token...");
        
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
            if(this.persistPath != undefined)
            {
                storage.setItem('user_id',this.auth_token.user_id);
                storage.setItem('token',this.auth_token.token);
                storage.setItem('expiry',this.auth_token.expiry);
            }

            // Display temporary access 
            this.log.debug("Temporary Access Flo Token: " + this.auth_token.token);
             // Build query header for future transactions
            this.auth_token.header = {
            headers: {
                    'User-Agent': FLO_USER_AGENT,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Accept': 'application/json',
                    'authorization': this.auth_token.token
                    }
            };

            // Set timer to obtain new token
            var refreshTimeoutmillis = Math.floor(this.auth_token.expiry - Date.now());
            // Display refreshing token information 
            this.log.info(`Flo Info: Token will refresh in ${Math.floor((refreshTimeoutmillis / (1000 * 60 * 60)) % 24)} hour(s) and ${Math.floor((refreshTimeoutmillis / (1000 * 60 )) % 60)} mins(s).`);
            return true;
        
        }
        catch(err) {
            // Something went wrong, display message and return negative return code
            this.log.error("Flo Login Error: " + err.message);
            return false;
        } 
        
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
                            this.log.debug("Device Raw Data: ", device_info.data);
                            if (this.excludedDevices.includes(device_info.data.serialNumber)) {
                                this.log.info(`Flo Info: Excluding sensor with serial '${device_info.data.serialNumber}'`);
                               
                            } else {
                                if (device_info.data.id != undefined) {
                                    // create flo device object
                                    var device = {};
                                    // Store key information about device
                                    device.name = device_info.data.nickname;
                                    device.deviceModel = device_info.data.deviceModel || "NA";
                                    device.type = device_info.data.deviceType;
                                    device.serialNumber = device_info.data.serialNumber || "NA";
                                    device.location = device_info.data.location.id;
                                    device.deviceid = device_info.data.id;
                                    device.notifications = device_info.data.notifications.pending;
                                    device.lastUpdate = new Date(device_info.data.lastHeardFromTime);
                                    // determine type of device and set proper data elements
                                    switch (device_info.data.deviceType) {
                                        case FLO_WATERSENSOR:
                                            // homekit expect temperatures in celuis and allow homekit to perform conversion if needed.
                                            device.temperature = (device_info.data.telemetry.current.tempF - 32) / 1.8;
                                            device.humidity = device_info.data.telemetry.current.humidity;
                                            // Return whether water is detected, for leak detectors.
                                            device.waterdetect = device_info.data.fwProperties.telemetry_water;
                                            // Return the battery level for battery-powered device, e.g. leak detectors
                                            device.batterylevel = device_info.data.battery.level;
                                            break;
                                        case FLO_SMARTWATER:
                                            device.psi = device_info.data.telemetry.current.psi;
                                            device.gpm = device_info.data.telemetry.current.gpm;
                                            device.systemCurrentState = device_info.data.systemMode.lastKnown;
                                            device.systemTargetState = device_info.data.systemMode.target;
                                            device.valveCurrentState = device_info.data.valve.lastKnown;
                                            device.valveTargetState = device_info.data.valve.target || device.valveCurrentState;
                                            break;
                                    } 
                                    // Store device in array, the array will store all of users device in all location.
                                    this.log.debug("Adding Device: ", device.deviceid);
                                    this.flo_devices.push(device);
                                }
                                else
                                    this.log.error("Flo Device Error: " + device_info.data);
                            }
                        } 
                        catch(err) {
                            this.log.error("Flo Device Error: " + err.message);
                        };
                    }
                }
                return true;
        } catch(err) {
            this.log.error("Flo Location Load Error: " + err.message);
            return false;
        }

    };

    // Change/set Flo system in three mode home, away and sleep. Refer to link below for each mode.
    // https://support.meetflo.com/hc/en-us/articles/115003927993-What-s-the-difference-between-Home-Away-and-Sleep-modes-
    async setSystemMode(location, mode, revertMode) {
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        if (this.isBusy) {
            this.log.warn("Flo System Mode: Another process is already updating the Flo system.")
            return;
        }
        this.isBusy = true;
        var url = FLO_V2_API_BASE + "/locations/" + location + "/systemMode";
        var modeRequestbody = {
            'target': mode,
        };
        if (mode == "sleep")
        {
           // revertMinutes -- The number of minutes to sleep (120, 1440, or 4320)
           modeRequestbody.revertMinutes = this.sleepRevertMinutes;
           // revertMode -- Time to remain in sleep and mode to set after sleep concludes ("away" or "home")
           // preset to always home.
           modeRequestbody.revertMode = revertMode;
        }

        // Change monitor mode based on request
        var response;
        try {
            response = await axios.post(url, modeRequestbody, this.auth_token.header);
            this.log.info("Flo System Mode: System Monitoring mode change to : " , mode);
            this.log.debug(response);
        } catch(err)
        {
            this.log.error("Error: " + err.message);
        }
        this.isBusy = false;
       
    };

    async setValve(deviceid, mode) {
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        if (this.isBusy) {
            this.log.warn("Flo System Mode: Another plug-in process is already updating the Flo system.")
            return;
        }
        this.isBusy = true;
        var url = FLO_V2_API_BASE + "/devices/" + deviceid;

        var modeRequestbody = {
            valve: {
                'target': mode
            }
        };
        // Change value state
        var response;
        try {
            response = await axios.post(url, modeRequestbody, this.auth_token.header);
            this.log.info("Flo Valve Now: " , mode);
            this.log.debug(response);

        } catch(err) {
            this.log.error("Error: " + err.message);
        }
        this.isBusy = false;
       
    };

    async runHealthCheck(deviceid) {
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        var url = FLO_V2_API_BASE + "/devices/" + deviceid + "/healthTest/run";

        // Run health check based on user request 
        var response;
        try {
            this.log.info("Flo Health: Running Health Check. This will take up to 4 mins.");
            response = await axios.post(url,"", this.auth_token.header);
            this.log.debug(response);
        } catch(err)
        {
           this.log.error("Error: " + err.message);
        }
       
    };

    // *******************************************************
    // Not currently used
    // *******************************************************
    async getSystemAlerts() {
        
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await refreshToken();
        }
       
        var statusheader = { 'isInternalAlarm': 'false',
                   'locationId': this.flo_locations[0],
                   'status': 'triggered',
                   'severity': 'warning', 
                   'severity': 'critical',
                   'page': 1,
                   'size': 100
        }

        var systemstatusheader = {
                ...this.auth_token.header,
                ...statusheader
        }
        this.log.info(systemstatusheader);

        
        // var url = FLO_V2_API_BASE + "/alerts";
        // try {
        //     const alarm_response = await axios.get(url, systemstatusheader);
        //     this.log.info(alarm_response.data);
        // }
        // catch (err)
        // {
        //     this.log.error("Getting Alerts Error:  " + err.message);
        // }
    };

    async getAlarms() {

        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        // Get device
        var url = FLO_V2_API_BASE + "/alarms";     
               
        try {

            var alarm_status = await axios.get(url, this.auth_token.header);
            this.log.info("Device Updated Data: ", alarm_status.data);
            
        }
        catch(err) {
            // Something went wrong, display error and return.
            this.log.error("Flo Getting Alarms Status Error:  " + err.message);
            return false;
        };
    };

    async refreshDevice(deviceIndex) {

        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        // Get device
        var url = FLO_V2_API_BASE + "/devices/" + this.flo_devices[deviceIndex].deviceid;     
               
        try {

            var device_info = await axios.get(url, this.auth_token.header);
            
            // Has the object been updated? If the device has not been heard from, no change is needed
            let deviceUpdateTime = new Date(device_info.data.lastHeardFromTime);
            if (deviceUpdateTime.getTime() == this.flo_devices[deviceIndex].lastUpdate.getTime()) {
                this.log.debug(this.flo_devices[deviceIndex].name + " has no updates.");
                return true;
            }
            // Update key information about device
           this.log.debug("Device Updated Data: ", device_info.data);

            this.flo_devices[deviceIndex].lastUpdate = new Date(device_info.data.lastHeardFromTime);
            this.flo_devices[deviceIndex].notifications = device_info.data.notifications.pending;
        
            // determine type of device and update the proper data elements
            switch (this.flo_devices[deviceIndex].type) {
                case FLO_WATERSENSOR:
                    // homekit expect temperatures in celuis and allow homekit to perform conversion if needed.
                    this.flo_devices[deviceIndex].temperature = (device_info.data.telemetry.current.tempF - 32) / 1.8;
                    this.flo_devices[deviceIndex].humidity = device_info.data.telemetry.current.humidity;
                    // Return whether water is detected, for leak detectors.
                    this.flo_devices[deviceIndex].waterdetect = device_info.data.fwProperties.telemetry_water;
                    // Return the battery level for battery-powered device, e.g. leak detectors
                    this.flo_devices[deviceIndex].batterylevel = device_info.data.battery.level;
                break;
                case FLO_SMARTWATER:
                    this.flo_devices[deviceIndex].psi = device_info.data.telemetry.current.psi;
                    this.flo_devices[deviceIndex].gpm = device_info.data.telemetry.current.gpm;
                    // New installation may not has lastknown state, set to target state.
                    if (device_info.data.systemMode.lastKnown) 
                        this.flo_devices[deviceIndex].systemCurrentState = device_info.data.systemMode.lastKnown;
                    else
                        this.flo_devices[deviceIndex].systemCurrentState = device_info.data.systemMode.target;

                    this.flo_devices[deviceIndex].systemTargetState = device_info.data.systemMode.target;

                    // New installation may not has lastknown state, set to target state.
                    if (device_info.data.systemMode.lastKnown) 
                        this.flo_devices[deviceIndex].valveCurrentState = device_info.data.valve.lastKnown;
                    else
                        this.flo_devices[deviceIndex].valveCurrentState = device_info.data.valve.target;

                    this.flo_devices[deviceIndex].valveTargetState = device_info.data.valve.target;
                break;
            } 
           
            // change were detected updata device data elements and trigger updata.
            this.emit(this.flo_devices[deviceIndex].deviceid, {
                device: this.flo_devices[deviceIndex]
            });
            return true;
                            
        } 
        catch(err) {
                // Something went wrong, display error and return.
                this.log.error("Flo Device Refresh Error:  " + err.message);
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
         if (this.isBusy) {
            this.log.warn("Flo Device Update: Another process is already updating the Flo system.\n Skipping Interval Update.")
            this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
            return;
        }
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            // Token is expired or not login, start sessior with meetflo portal.
            await this.refreshToken();
        }
        // Updata all data elements
        for (var i = 0; i < this.flo_devices.length; i++) {
            await this.refreshDevice(i);
        }
       
        // Set timer to refresh devices
       this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
       

    };
   

    // Send a presence ping to Flo, to force device updates.
    async generatePing()
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
        var pingrequest = {
            ...this.auth_token.header,
            ...header
        }
        // Generate presence ping
        try {
            const response = await axios.post(FLO_PRESENCE_HEARTBEAT,"", pingrequest);
            this.log("Presence ping successful.")
        } catch(err)
        {
            this.log.error("Flo Error: " + err.message);
            
        }
        this.pingHandle = setTimeout(() => this.generatePing(), this.pingRefreshTime); 
    }
}
module.exports = FlobyMoem;