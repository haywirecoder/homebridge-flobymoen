
const EventEmitter = require('events');
const axios = require('axios');
const storage = require('node-persist');

// URL constant for retrieving data
const FLO_V1_API_BASE = 'https://api.meetflo.com/api/v1';
const FLO_V2_API_BASE = 'https://api-gw.meetflo.com/api/v2';
const HEADER_ORIGIN = "https://user.meetflo.com";
const HEADER_REFERER = "https://user.meetflo.com/home";
const FLO_AUTH_URL       = FLO_V1_API_BASE + '/users/auth';
const FLO_USERTOKENS_URL = FLO_V1_API_BASE + '/usertokens/me';
const FLO_PRESENCE_HEARTBEAT = FLO_V2_API_BASE + '/presence/me';
// Generic header for Safari macOS to interact with Flo api
const FLO_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36';
const TIMEOUT = 120000;
const FLO_WATERSENSOR ='puck_oem';
const FLO_SMARTWATER = 'flo_device_v2';

class FlobyMoen extends EventEmitter {
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
    maxErrorCount;
    

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
        this.offlineTimeLimit = config.offlineTimeLimit || 4 ;
        this.excludedDevices = config.excludedDevices || [];
        this.auth_token.username = config.auth.username;
        this.auth_token.password = config.auth.password;
        this.maxErrorCount = config.retryErrorDisplay || 3;
        this.isBusy = false;
        
    };

    async init() {

        // Retrieve login storage login information
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
            this.log.info(`Flo Info: Token will refresh in ${Math.floor((refreshTimeoutmillis / (1000 * 60 * 60)) % 24)} hour(s) and ${Math.floor((refreshTimeoutmillis / (1000 * 60 )) % 60)} min(s).`);
            return true;
        
        }
        catch(err) {
            // Something went wrong, display message and return negative return code
            this.log.error("Flo login error: " + err.message);
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

        var getHeader = { 
            'Origin': HEADER_ORIGIN,
            'Referer': HEADER_REFERER,
            'timeout': TIMEOUT
        }

        var discoverHeader = {
            ...this.auth_token.header,
            ...getHeader
        }
        this.log.debug("discoverDevices:  " + url + " Discover Object: " + JSON.stringify(discoverHeader));
        try {
            // Get devices at location 
            const loc_response = await axios.get(url, discoverHeader);
            var locations_info = loc_response; 
            // Get each device at each location
            for (var i = 0; i < locations_info.data.locations.length; i++) {
                    // Store location for future use
                    this.flo_locations[i] = locations_info.data.locations[i].id;
                    // for each location get devices
                    for (var z = 0; z < locations_info.data.locations[i].devices.length; z++) {
                        url = FLO_V2_API_BASE + "/devices/" + locations_info.data.locations[i].devices[z].id;
                        try {
                            const device_response = await axios.get(url, discoverHeader);
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
                                    device.warningCount = device_info.data.notifications.warningCount || 0;
                                    device.criticalCount = device_info.data.notifications.criticalCount || 0;
                                    device.version = device_info.data.fwVersion;
                                    device.isConnected = device_info.data.isConnected;
                                    device.offline = 0;
                                    device.errorCount = 0;
                                    device.lastUpdate = new Date(device_info.data.lastHeardFromTime);
                                    // determine type of device and set proper data elements
                                    switch (device_info.data.deviceType) {
                                        case FLO_WATERSENSOR:
                                            // homekit expect temperatures in celsius and allow homekit to perform conversion if needed.
                                            device.temperature = (device_info.data.telemetry.current.tempF - 32) * 5 / 9;;
                                            device.humidity = device_info.data.telemetry.current.humidity;
                                            // Return whether water is detected, for leak detectors.
                                            device.waterdetect = device_info.data.fwProperties.telemetry_water;
                                            // Return the battery level for battery-powered device, e.g. leak detectors
                                            device.batterylevel = device_info.data.battery.level;
                                            break;
                                        case FLO_SMARTWATER:
                                            device.psi = device_info.data.telemetry.current.psi || 0;;
                                            device.gpm = device_info.data.telemetry.current.gpm || 0;;
                                            device.temperature = (device_info.data.telemetry.current.tempF - 32) * 5 / 9;
                                             // New installation may not has lastknown state, set to target state.
                                            device.systemCurrentState = device_info.data.systemMode.lastKnown || device_info.data.systemMode.target;
                                            device.systemTargetState = device_info.data.systemMode.target;
                                            // New installation may not has lastknown state, set to target state.
                                            device.valveCurrentState = device_info.data.valve.lastKnown || device_info.data.valve.target;
                                            device.valveTargetState = device_info.data.valve.target;
                                            device.valveGlobalState = device.valveCurrentState;
                                            device.isInstalled = device_info.data.installStatus.isInstalled;
                                            device.isConnected =  device_info.data.installStatus.isConnected;
                                            this.getConsumption(device);
                                            break;
                                        default:
                                            this.log("Unsupported Device Found.");
                                            this.log(device_info.data);

                                    } 
                                    // Store device in array, the array will store all of users device in all location.
                                    this.log.debug("Adding Device: ", device);
                                    this.flo_devices.push(device);
                                }
                                else
                                    this.log.error("Flo error devices: " + device_info.data);
                            }
                        } 
                        catch(err) {
                            this.log.error("Flo error devices: " + err.message);
                        };
                    }
                }
                return true;
        } catch(err) {
            this.log.error("FLo error device discovery unsuccessful:  " + err.message + ". Please check configuration and restart the plug-in");
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
        this.log.debug("setSystemMode:  " + url + " Request Object: " + JSON.stringify(modeRequestbody));
        try {
            response = await axios.post(url, modeRequestbody, this.auth_token.header);
            this.log.info("Flo System Mode: System Monitoring mode change to : " , mode);
            this.log.debug(response);
        } catch(err)
        {
            this.log.error("Flo error in setting system mode: " + err.message);
        }
        this.isBusy = false;
       
    };

    async setValve(deviceid, mode, deviceIndex) {
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
        this.log.debug("SetValue:  " + url + " Request Object: " + JSON.stringify(modeRequestbody));
        try {
            response = await axios.post(url, modeRequestbody, this.auth_token.header);
            // No error response. Change modes to desire stated and emit changes for smartvalve objects
            this.flo_devices[deviceIndex].valveGlobalState = mode;
            this.emit(this.flo_devices[deviceIndex].deviceid, {
                device: this.flo_devices[deviceIndex]
            });
            this.log.info("Flo Valve Now: " , mode);
            this.log.debug(response);

        } catch(err) {
            this.log.error("Flo error in setting valve state: " + err.message);
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
        this.log.debug("runHealthCheck:  " + url);
        try {
            this.log.info("Flo Health: Running Health Check. This will take up to 4 mins.");
            response = await axios.post(url,"", this.auth_token.header);
            this.log.debug(response);
        } catch(err)
        {
           this.log.error("Flo error in running health check: " + err.message);
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
        //     this.log.error("Flo error getting alerts:  " + err.message);
        // }
    };

    async getAlarms() {

        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        // Get device
        var url = FLO_V2_API_BASE + "/alarms";     
        this.log.debug("getAlarm:  " + url);
        try {

            var alarm_status = await axios.get(url, this.auth_token.header);
            this.log.info("Device Updated Data: ", alarm_status.data);
            
        }
        catch(err) {
            // Something went wrong, display error and return.
            this.log.error("Flo error getting alarms status:  " + err.message);
        };
    };

    async refreshDevice(deviceIndex) {

        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
        // Get device
        var url = FLO_V2_API_BASE + "/devices/" + this.flo_devices[deviceIndex].deviceid; 
        var getHeader = { 
            'Origin': HEADER_ORIGIN,
            'Referer': HEADER_REFERER,
            'timeout': TIMEOUT
        }

        var refreshHeader = {
            ...this.auth_token.header,
            ...getHeader
        }
               
        this.log.debug("refreshDevice:  " + url + " Refreash Object: " + JSON.stringify(refreshHeader));
        try {

            var device_info = await axios.get(url, refreshHeader);            
            // Has the object been updated? If the device has not been heard from, no change is needed
            this.log.debug("Getting Update time ", this.flo_devices[deviceIndex].name);
            
            let deviceUpdateTime = new Date(device_info.data.lastHeardFromTime);

            this.log.debug("Comparing update time for ", this.flo_devices[deviceIndex].name);
            
            if (deviceUpdateTime.getTime() == this.flo_devices[deviceIndex].lastUpdate.getTime()) {
                this.log.debug(this.flo_devices[deviceIndex].name, " has no updates.");
                // polling was successful.
                this.flo_devices[deviceIndex].errorCount = 0;
                // Check if device could be offline
                var nowDate = new Date();
                // calculate number of hours since last check-in
                var delta = Math.floor(Math.floor((nowDate - deviceUpdateTime) / 1000)/3600);
                if ((delta >= this.offlineTimeLimit) && (this.flo_devices[deviceIndex].offline == 0)) {
                    // limit reach set provide warning 
                    this.flo_devices[deviceIndex].offline = 1;
                     // send event to homekit accessory
                    this.emit(this.flo_devices[deviceIndex].deviceid, {
                        device: this.flo_devices[deviceIndex]
                    });
                    this.log.warn(`Device is marked offline: ${this.flo_devices[deviceIndex].name} has received no updates for ${delta} hours`);
                }
                this.log.debug("Hour(s) since last report: " + delta);
                return true;
            }
            // Update key information about device
            this.log.debug("Device Updated Data: ", device_info.data);
            this.flo_devices[deviceIndex].lastUpdate = new Date(device_info.data.lastHeardFromTime);
            this.flo_devices[deviceIndex].notifications = device_info.data.notifications.pending;
            if(this.flo_devices[deviceIndex].offline == 1) this.log.info(`Device is back online: ${this.flo_devices[deviceIndex].name}`);
            this.flo_devices[deviceIndex].offline = 0;
            this.flo_devices[deviceIndex].errorCount = 0;
    
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
                    this.flo_devices[deviceIndex].psi = device_info.data.telemetry.current.psi || 0;
                    this.flo_devices[deviceIndex].gpm = device_info.data.telemetry.current.gpm || 0;
                    this.flo_devices[deviceIndex].temperature = (device_info.data.telemetry.current.tempF - 32) / 1.8;

                    // New installation may not has lastknown state, set to target state.
                    if (device_info.data.systemMode.lastKnown) 
                        this.flo_devices[deviceIndex].systemCurrentState = device_info.data.systemMode.lastKnown;
                    else
                        this.flo_devices[deviceIndex].systemCurrentState = device_info.data.systemMode.target;

                    this.flo_devices[deviceIndex].systemTargetState = device_info.data.systemMode.target;

                    // New installation may not has lastknown state, set to target state.
                    if (device_info.data.valve.lastKnown) 
                        this.flo_devices[deviceIndex].valveCurrentState = device_info.data.valve.lastKnown;
                    else
                        this.flo_devices[deviceIndex].valveCurrentState = device_info.data.valve.target;

                    this.flo_devices[deviceIndex].valveGlobalState =  this.flo_devices[deviceIndex].valveCurrentState;
                    this.flo_devices[deviceIndex].valveTargetState = device_info.data.valve.target;
                    this.flo_devices[deviceIndex].isInstalled =  device_info.data.installStatus.isInstalled;
                    this.flo_devices[deviceIndex].isConnected =  device_info.data.installStatus.isConnected;
                break;
            } 
           
            // change were detected update device data elements and trigger update.
            this.log.debug("Updating homekit for  ", this.flo_devices[deviceIndex].name);
            this.emit(this.flo_devices[deviceIndex].deviceid, {
                device: this.flo_devices[deviceIndex]
            });
            return true;
                            
        } 
        catch(err) {
                // At times the plug-in reports a 502 error. This is a communication error with the Flo server,
                // an occasional error will not effect operations, suppress unless it is occurring frequently.
                if(err.response.status == 502)
                {
                    this.flo_devices[deviceIndex].errorCount += 1;
                    if (this.flo_devices[deviceIndex].errorCount > this.maxErrorCount)
                    {
                        this.log.warn(`Flo Device ${this.flo_devices[deviceIndex].name} failed to update ${this.flo_devices[deviceIndex].errorCount} times.`);
                    }
                    this.log.debug("Max failed attempt not reach: ", this.flo_devices[deviceIndex].name, "number of errors: ", this.flo_devices[deviceIndex].errorCount );
                }
                else
                    this.log.error("Flo error for device refresh:  " + err.message + " " + this.flo_devices[deviceIndex].name);
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
            // Token is expired or not login, start session with meetflo portal.
            await this.refreshToken();
        }
        // Update all data elements
        for (var i = 0; i < this.flo_devices.length; i++) {
            await this.refreshDevice(i);
        }
       
        // Set timer to refresh devices
       this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime); 
       

    };
   
    async getConsumption(device) {
        var location_id = device.location;
        var startDate = new Date();
        var endDate = new Date();
        endDate.setHours(startDate.getHours() + 24);

        var startDateFormat = startDate.getFullYear() + "-" + String(startDate.getMonth() + 1).padStart(2, '0') + "-" + String(startDate.getDate()).padStart(2, '0');
        var endDateFormat = endDate.getFullYear() + "-" + String(endDate.getMonth() + 1).padStart(2, '0') + "-" + String(endDate.getDate()).padStart(2, '0');
        var url = "https://api-gw.meetflo.com/api/v2/water/consumption?startDate=" + startDateFormat + "&endDate=" + endDateFormat + "&locationId=" + location_id + "&interval=1h";
    
        this.log.debug("getConsumption:  " + url);
   
        try
        {
            var response = await axios.get(url, this.auth_token.header);
            var data = response.data
            device.sumTotalGallonsConsumed = data.aggregations.sumTotalGallonsConsumed;
                            
        } 
        catch(err) {

            this.log.error("Flo error in getting consumption: " + err.message);       
        }
    }
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
            this.log.error("Flo error in generating ping: " + err.message);
            
        }
        this.pingHandle = setTimeout(() => this.generatePing(), this.pingRefreshTime); 
    }
}
module.exports = FlobyMoen;