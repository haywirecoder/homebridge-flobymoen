
const EventEmitter = require('events');
const axios = require('axios');
const https = require('https');
const storage = require('node-persist');
const crypto = require('crypto');

// Dedicated axios instance with keep-alive disabled. The global agent reuses a single TLS socket
// for every poll, which triggers MaxListenersExceededWarning (error listeners pile up on the socket).
const floHttp = axios.create({
    httpsAgent: new https.Agent({ keepAlive: false })
});

// URL constant for retrieving data
const FLO_V1_API_BASE = 'https://api.meetflo.com/api/v1';
const FLO_V2_API_BASE = 'https://api-gw.meetflo.com/api/v2';
const HEADER_ORIGIN = "https://user.meetflo.com";
const HEADER_REFERER = "https://user.meetflo.com/home";
const FLO_AUTH_URL       = FLO_V1_API_BASE + '/users/auth';
const FLO_USERTOKENS_URL = FLO_V1_API_BASE + '/usertokens/me';
// Moen SSO (Cognito) auth -- the flow the current Moen app uses. Enable via the
// "useSSO" config option; the legacy users/auth flow remains the default.
// NOTE: the two tokens are not interchangeable in the header. Measured 2026-08-20 on
// GET api-gw /api/v2/users/{id}: SSO must be sent as "Bearer <tok>" (200), the legacy
// token must be sent raw (200) and returns 401 if sent as a Bearer.
const FLO_SSO_TOKEN_URL  = 'https://4j1gkf0vji.execute-api.us-east-2.amazonaws.com/prod/v1/oauth2/token';
const FLO_SSO_CLIENT_ID  = '6qn9pep31dglq6ed4fvlq6rp5t';
const FLO_V2_USERS_ME    = FLO_V2_API_BASE + '/users/me';
const FLO_PRESENCE_HEARTBEAT = FLO_V2_API_BASE + '/presence/me';
// Generic header for Safari macOS to interact with Flo api
const FLO_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36';
const TIMEOUT = 120000;
const FLO_WATERSENSOR ='puck_oem';
const FLO_SMARTWATER = 'flo_device_v2';
const TOKEN_REFRESH_FRACTION = 0.8;

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
    refreshPromise = null;
    // Used to keep routine token renewals out of the info log (see logTokenRefreshed)
    loginHasSucceeded = false;
    loginFailing = false;
    pingHandle = null;
    

    constructor(log, config, persistPath) {
        super();
        this.log = log || console;
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
        // Use the Moen SSO (Cognito) auth flow instead of the legacy one. Opt-in.
        this.useSSO = config.auth.useSSO || false;
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
            const storedToken = await storage.getItem('token');
            // A cached token is only usable by the auth mode that created it (a legacy
            // token sent as a Bearer, or vice versa, is rejected). Discard on mismatch.
            // Caches written before 'authMode' existed always held legacy tokens.
            const cachedAuthMode = (await storage.getItem('authMode')) || 'legacy';
            if (typeof storedToken === 'string' && storedToken.includes(':')) {
                // Reverse the obfuscation applied when the token was persisted. Returns
                // undefined (forcing a fresh login) if it cannot be decoded.
                this.auth_token.token = this.decryptToken(storedToken);
            } else {
                this.auth_token.token = (typeof storedToken === 'string') ? storedToken : undefined;
            }
            const currentAuthMode = this.useSSO ? 'sso' : 'legacy';
            if (this.auth_token.token != undefined && cachedAuthMode != currentAuthMode) {
                this.log.info(`Flo Info: Cached token was issued for '${cachedAuthMode}' auth but '${currentAuthMode}' is configured; discarding it.`);
                this.auth_token.token = undefined;
                this.auth_token.expiry = undefined;
                this.auth_token.user_id = undefined;
            }
            else if (this.auth_token.token != undefined) {
                this.log.info(`Flo Info: Using ${cachedAuthMode} cached Flo token.`);
            }
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
            this.log.info(`Flo Info: Token will refresh in ${this.formatRefreshIn()}.`);
            // A valid cached token is an established session; later renewals are routine.
            this.loginHasSucceeded = true;
            // Display temporary access 
            this.log.debug("Flo Token: " + this.maskToken(this.auth_token.token));
            // Build query header for future transactions
            this.auth_token.header = {
            headers: {
                    'User-Agent': FLO_USER_AGENT,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Accept': 'application/json',
                    'authorization': (this.useSSO ? 'Bearer ' + this.auth_token.token : this.auth_token.token)
                    }
            };

        }
        return true;
    };

    startPollingProcess()
    {
        // Clear any existing timers so calling this twice can't create duplicate polling loops
        if (this.deviceRefreshHandle) clearTimeout(this.deviceRefreshHandle);
        if (this.pingHandle) clearTimeout(this.pingHandle);
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

    // Build an axios config with the auth headers plus Origin/Referer (these must live under
    // `headers`, otherwise axios ignores them) and the request timeout.
    buildRequestConfig() {
        const base = this.auth_token.header || {};
        return {
            ...base,
            headers: {
                ...(base.headers || {}),
                'Origin': HEADER_ORIGIN,
                'Referer': HEADER_REFERER
            },
            timeout: TIMEOUT
        };
    };

    // Light obfuscation of the cached token so the raw value is not readable in the cache files.
    // This is NOT strong protection: since the account password is stored in config.json on the same machine. 
    // Changing the key derivation would invalidate existing caches (users would simply log in again). 
    // In future if Homebridge support for secure storage of credentials is added, would level of protection 
    // provided by a proper encryption mechanism.

    tokenKey() {
        return crypto.createHash('sha256').update(String(this.auth_token.password)).digest();
    };

    encryptToken(token) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.tokenKey(), iv);
        return iv.toString('hex') + ':' + cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
    };

    // Returns the token, or undefined if the cached value cannot be decoded (storage path changed,
    // corrupted file, etc.) so the caller falls back to a fresh login instead of crashing.
    decryptToken(stored) {
        try {
            const [ivHex, encHex] = stored.split(':');
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.tokenKey(), Buffer.from(ivHex, 'hex'));
            return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
        } catch (err) {
            this.log.warn('Flo Info: Cached token could not be decoded; a new login will be performed.');
            return undefined;
        }
    };

    // Never log a full token.
    maskToken(token) {
        return token ? '****' + String(token).slice(-4) : '(none)';
    };

    // If Flo rejects the token before our local expiry, drop it so the next call logs in again.
    checkAuthFailure(err) {
        if (err && err.response && err.response.status == 401) {
            this.log.warn('Flo Info: Token was rejected (401); a new login will be performed on the next request.');
            this.auth_token.token = undefined;
            this.auth_token.expiry = undefined;
        }
    };

    async persistToken() {
        if (this.persistPath == undefined) return;
        try {
            await Promise.all([
                storage.setItem('user_id', this.auth_token.user_id),
                storage.setItem('token', this.encryptToken(this.auth_token.token)),
                storage.setItem('expiry', this.auth_token.expiry),
                // Record which auth mode issued this token so a stale one isn't reused
                // after the useSSO option is toggled.
                storage.setItem('authMode', this.useSSO ? 'sso' : 'legacy')
            ]);
        } catch (err) {
            // A caching problem must not make a successful login look like a failure.
            this.log.warn('Flo Info: Could not cache Flo token: ' + err.message);
        }
    };

    // Time until the next token refresh, e.g. "0 hr 24 min".
    formatRefreshIn() {
        const mins = Math.max(0, Math.round((this.auth_token.expiry - Date.now()) / 60000));
        return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
    };

    // Routine renewals happen every few minutes/hours and would flood the info log, so only events
    // someone needs to see are logged at info: the first login after startup and recovery after a
    // failure. Every other renewal is logged at debug. Failures are logged as errors in doRefreshToken.
    logTokenRefreshed() {
        const msg = `Flo Info: Token refreshed; next refresh in ${this.formatRefreshIn()}.`;
        if (!this.loginHasSucceeded) {
            this.log.info(msg);
        } else if (this.loginFailing) {
            this.log.info('Flo Info: Login recovered. ' + msg);
        } else {
            this.log.debug(msg);
        }
        this.loginHasSucceeded = true;
        this.loginFailing = false;
    };

    isLoggedIn() {
        // determine time the elapse between now and token usage.
        let tokenExpiration = Math.floor(this.auth_token.expiry - Date.now());
        return ((this.auth_token.token != undefined) && (tokenExpiration > 0));
    };

    // After login Flo system returns a token that used for all transaction. This topic must be periodically refresh
    // This method login, gets the token and store for later transaction.
    // Concurrent callers share one in-flight login instead of each logging in separately.
    async refreshToken() {
        if (!this.refreshPromise) {
            this.refreshPromise = this.doRefreshToken().finally(() => { this.refreshPromise = null; });
        }
        return this.refreshPromise;
    };

    async doRefreshToken() {

        this.log.debug("Flo Status: Refreshing Token...");
        try {
            // Collect results in locals and commit to this.auth_token only after every step succeeds,
            // so a failure part-way through can't leave a token without a user id / header.
            let token, userId, expiry;

            if (this.useSSO) {
                // Moen SSO (Cognito): exchange username/password for a bearer access token.
                const response = await floHttp.post(FLO_SSO_TOKEN_URL, {
                'username': this.auth_token.username,
                'password': this.auth_token.password,
                'client_id': FLO_SSO_CLIENT_ID });
                token = response.data.token.access_token;
                // Calculated expiration based refresh rate provided by the server. The server provides a token expiration time in seconds, 
                // convert to milliseconds and apply refresh fraction.
                expiry = Date.now() + ((response.data.token.expires_in || 3600) * 1000 * TOKEN_REFRESH_FRACTION);

                // The SSO token does not embed the user id; resolve it from /users/me.
                const meResponse = await floHttp.get(FLO_V2_USERS_ME, { headers: {
                    'User-Agent': FLO_USER_AGENT,
                    'Accept': 'application/json',
                    'authorization': 'Bearer ' + token } });
                userId = meResponse.data.id;
            } else {
                const response = await floHttp.post(FLO_AUTH_URL, {
                'username': this.auth_token.username,
                'password': this.auth_token.password });
                token = response.data.token;
                userId = response.data.tokenPayload.user.user_id;
                // Calculated expiration based refresh rate provided by the server. The server provides a token expiration time in seconds, 
                // convert to milliseconds and apply refresh fraction.
                expiry = Date.now() + (response.data.tokenExpiration * 1000 * TOKEN_REFRESH_FRACTION);
            }

            if (!token || !userId || !(expiry > 0)) {
                throw new Error('Login response did not contain a token, user id and expiration.');
            }

            // Successful login, store token and built transaction header data for future transactions
            this.auth_token.token = token;
            this.auth_token.user_id = userId;
            this.auth_token.expiry = expiry;
            this.auth_token.header = {
            headers: {
                    'User-Agent': FLO_USER_AGENT,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Accept': 'application/json',
                    'authorization': (this.useSSO ? 'Bearer ' + this.auth_token.token : this.auth_token.token)
                    }
            };

            // store for later use user ID, token and expiration date, if system is restarted for any reason.
            await this.persistToken();

            this.log.debug("Flo Token: " + this.maskToken(this.auth_token.token));

            this.logTokenRefreshed();
            return true;
        
        }
        catch(err) {
            // Something went wrong, display message and return negative return code
            this.loginFailing = true;
            if (err.response) {
                this.log.error('Flo login error: Server responded with status code:', err.response.status);
                this.log.error('Response data:', err.response.data);
              } else if (err.request) {
                this.log.error('Flo login error: No response received:', err.code || err.message);
              } else {
                this.log.error('Flo login error: Error creating request:', err.message);
            }
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

        var discoverHeader = this.buildRequestConfig();
        this.log.debug("discoverDevices:  " + url);
        try {
            // Get devices at location 
            const loc_response = await floHttp.get(url, discoverHeader);
            var locations_info = loc_response; 
            // Get each device at each location
            for (var i = 0; i < locations_info.data.locations.length; i++) {
                    // Store location for future use
                    this.flo_locations[i] = locations_info.data.locations[i].id;
                    // for each location get devices
                    for (var z = 0; z < locations_info.data.locations[i].devices.length; z++) {
                        url = FLO_V2_API_BASE + "/devices/" + locations_info.data.locations[i].devices[z].id;
                        try {
                            const device_response = await floHttp.get(url, discoverHeader);
                            var device_info = device_response;
                            this.log.debug("Device Raw Data: ", device_info.data);
                            if (this.excludedDevices.includes(device_info.data.serialNumber) || this.excludedDevices.includes(device_info.data.deviceid)) {
                                this.log.info(`Flo Info: Excluding sensor with serial number '${device_info.data.serialNumber}' with device ID of '${device_info.data.deviceid}'`);
                               
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
                                            device.psi = device_info.data.telemetry.current.psi || 0;
                                            device.gpm = device_info.data.telemetry.current.gpm || 0;
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
                                            this.log.info("Unsupported Device Found. Skipping Device: ");
                                            this.log.info(device_info.data);

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
            this.log.error("Flo error device discovery unsuccessful:  " + err.message + ". Please check your configuration and restart the plug-in");
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
            response = await floHttp.post(url, modeRequestbody, this.auth_token.header);
            this.log.info("Flo System Mode: System Monitoring mode change to : " , mode);
            this.log.debug(response);
        } catch(err)
        {
            this.checkAuthFailure(err);
            if (err.response) {
                this.log.error('Flo system Mode: Server responded with status code:', err.response.status);
                this.log.error('Response data:', err.response.data);
              } else if (err.request) {
                this.log.error('Flo system Mode: No response received:', err.code || err.message);
              } else {
                this.log.error('Flo system Mode: Error creating request:', err.message);
            }
            
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
            response = await floHttp.post(url, modeRequestbody, this.auth_token.header);
            // No error response. Change modes to desire stated and emit changes for smartvalve objects
            this.flo_devices[deviceIndex].valveGlobalState = mode;
            this.emit(this.flo_devices[deviceIndex].deviceid, {
                device: this.flo_devices[deviceIndex]
            });
            this.log.info("Flo Valve Now: " , mode);
            this.log.debug(response);

        } catch(err) {

            this.checkAuthFailure(err);

            if (err.response) {
                this.log.error('Flo Valve: Server responded with status code:', err.response.status);
                this.log.error('Response data:', err.response.data);
              } else if (err.request) {
                this.log.error('Flo Valve: No response received:', err.code || err.message);
              } else {
                this.log.error('Flo Valve: Error creating request:', err.message);
            }
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
        var runHealthRequestbody = {
        };

        this.log.debug("runHealthCheck URL:  " + url);
        try {
            this.log.info("Flo Health: Running Health Check. This will take 4 minutes to complete.");
            response = await floHttp.post(url, runHealthRequestbody, this.auth_token.header);
            this.log.debug(response);
        } catch(err)
        {
            this.checkAuthFailure(err);
            if (err.response) {
                this.log.error('Flo health: Server responded with status code:', err.response.status);
                this.log.error('Response data:', err.response.data);
              } else if (err.request) {
                this.log.error('Flo health: No response received:', err.code || err.message);
              } else {
                this.log.error('Flo health: Error creating request:', err.message);
            }
        }
    };

    // *******************************************************
    // Not currently used
    // *******************************************************
    async getSystemAlerts() {
        
        // Do we have valid sessions? 
        if (!this.isLoggedIn()) {
            await this.refreshToken();
        }
       
        var statusheader = { 'isInternalAlarm': 'false',
                   'locationId': this.flo_locations[0],
                   'status': 'triggered',
                   'severity': 'critical',
                   'page': 1,
                   'size': 100
        }

        var systemstatusheader = {
                ...this.auth_token.header,
                ...statusheader
        }
        this.log.debug("getSystemAlerts: " + JSON.stringify(statusheader));

        
        // var url = FLO_V2_API_BASE + "/alerts";
        // try {
        //     const alarm_response = await floHttp.get(url, systemstatusheader);
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

            var alarm_status = await floHttp.get(url, this.auth_token.header);
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
        var refreshHeader = this.buildRequestConfig();
               
        this.log.debug("refreshDevice:  " + url);
        try {

            var device_info = await floHttp.get(url, refreshHeader);            
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
                this.checkAuthFailure(err);
                // Transient = a 502, or a network-level failure (timeout, ECONNRESET, DNS: axios sets
                // err.request but no err.response). Anything else, e.g. a TypeError from an unexpected
                // response shape, is a real error and is always logged.
                const transient = err.response ? err.response.status == 502 : !!err.request;
                if(transient)
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
        try {
            // Do we have valid sessions? 
            if (!this.isLoggedIn()) {
                // Token is expired or not login, start session with meetflo portal.
                await this.refreshToken();
            }
            // Update all data elements
            for (var i = 0; i < this.flo_devices.length; i++) {
                await this.refreshDevice(i);
            }
        } catch (err) {
            this.log.error("Flo error in background refresh: " + err.message);
        } finally {
            // Always reschedule so one unexpected error can't stop polling permanently.
            this.deviceRefreshHandle = setTimeout(() => this.backgroundRefresh(), this.deviceRefreshTime);
        }
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
            var response = await floHttp.get(url, this.auth_token.header);
            var data = response.data
            device.sumTotalGallonsConsumed = data.aggregations.sumTotalGallonsConsumed;
                            
        } 
        catch(err) {

            this.log.error("Flo error in getting consumption: " + err.message);       
        }
    }

    // *******************************************************
    // Optional: only runs when "pingRefresh" is configured
    // *******************************************************
    // Send a presence ping to Flo, to force device updates.
    async generatePing()
    {
        try {
            if (!this.isLoggedIn()) {
                await this.refreshToken();
            }
            // Browser-style headers belong in the request config (they were previously passed as the POST body).
            const config = this.buildRequestConfig();
            config.headers = {
                ...config.headers,
                'Accept': 'application/json, text/plain, */*',
                'Sec-Fetch-Site': 'same-site',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
            };
            // Generate presence ping
            await floHttp.post(FLO_PRESENCE_HEARTBEAT, {}, config);
            this.log.info("Presence ping successful.");
        } catch(err)
        {
            this.checkAuthFailure(err);
            if (err.response) {
                this.log.error('Flo ping error: Server responded with status code:', err.response.status);
                this.log.error('Response data:', err.response.data);
              } else if (err.request) {
                this.log.error('Flo ping error: No response received:', err.code || err.message);
              } else {
                this.log.error('Flo ping error: Error creating request:', err.message);
            }
        } finally {
            this.pingHandle = setTimeout(() => this.generatePing(), this.pingRefreshTime);
        }
    }
}
module.exports = FlobyMoen;