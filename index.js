const packageJson = require('./package.json');
const smartwater = require('./accessories/smartWater');
const watersensor = require('./accessories/waterSensor');
const optionswitch = require('./accessories/optionSwitch');
const floengine = require('./flomain');

// Flo constants
const FLO_WATERSENSOR ='puck_oem';
const FLO_SMARTWATER = 'flo_device_v2';

// Flo by Moen HomeBridge Plugin
const PLUGIN_NAME = 'homebridge-flobymoen';
const PLATFORM_NAME = 'Flo-by-Moen';


var Accessory, Service, Characteristic, UUIDGen;

class FloByMoenPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.name = config.name;
    this.devices = [];
    this.accessories = [];
    this.floDeviceAccessory = [];
    this.api = api;  
    this.refreshInterval = config.deviceRefresh || 90;
    this.securityControlOption = config.securityControlOption || 0;
    this.disableCache = config.disableCache ? config.disableCache : false;
    this.persistPath = undefined;
    this.config = config;
    
    // Check if authentication information has been provided.
    try{
        if ((this.config.auth.username == "") || (this.config.auth.password == "") || (!this.config.auth.password) || (!this.config.auth.username))
        {
          this.log.error('Plug-in configuration error: Flo authentication information not provided.');
          // terminate plug-in initialization
          return;
        }
      }
    catch(err) {
      this.log.error('Plug-in configuration error: Flo authentication information not provided.');
       // terminate plug-in initialization
      return;
    }

    // Returns the path to the Homebridge storage folder, if local storage is enable.
    if (!this.disableCache) this.persistPath = api.user.persistPath();

    // Create FLo engine object to interact with Flo APIs.
    this.flo = new floengine (log, config, this.persistPath);
    // Login in meetflo portal
    this.log.info("Starting communication with Flo portal");
    this.initialLoad = this.flo.init().then ( () => {
      this.log.debug('Initialization Successful.');
    }).catch(err => {
              this.log.error('Flo API initialization Failure:', err);
               // terminate plug-in initialization
              return;
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    api.on('didFinishLaunching', () => {

      // When login completes discover devices with flo account
      this.initialLoad.then(() => {
          // Discover devices
          if (this.flo.isLoggedIn()){
            this.log.info("Initializing Flo devices...")
            this.flo.discoverDevices().then (() => {
            // Once devices are discovered update Homekit accessories
            this.refreshAccessories();
            })
          }
          else
            // User login wasn't success graceful end initialization. 
            this.log.error("Plug-in configuration error: Flo authentication error, please review your authentication information.'")
        })
    });
  }

  // Create associates in Homekit based on devices in flo account
  async refreshAccessories() {
  
  // Process each flo devices and create accessories within the platform. smart water value and water sensor classes 
  // will handle the creation and setting callback for each device types.
  var IsHealthSwitchEnabled = this.config.showHealthTestSwitch ? this.config.showHealthTestSwitch : false;
  var IsAuxFloSwitchEnabled = this.config.showAuxSwitch ? this.config.showAuxSwitch : false;
  var IsGpmlux =  this.config.showGPMPSIasLight ? this.config.showGPMPSIasLight : false;
  var IsPSIlux =  this.config.showGPMPSIasLight ? this.config.showGPMPSIasLight : false;
  var lwatersensor = 0;

  if (this.flo.flo_devices.length <=0 ) return;
  for (var i = 0; i < this.flo.flo_devices.length; i++) {
    let currentDevice = this.flo.flo_devices[i];
    switch (currentDevice.type) {
        case FLO_SMARTWATER:
          if (this.securityControlOption <=1) {
            var smartWaterAccessory = new smartwater(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen, i);
            // check the accessory was not restored from cache
            var foundAccessory = this.accessories.find(accessory => accessory.UUID === smartWaterAccessory.uuid)
            if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(smartWaterAccessory.name, smartWaterAccessory.uuid);
              // add services and Characteristic
              smartWaterAccessory.setAccessory(newAccessory);
              // register the accessory
              this.addAccessory(smartWaterAccessory);
            }
            else // accessory already exist just set characteristic
              smartWaterAccessory.setAccessory(foundAccessory);
            this.floDeviceAccessory.push(smartWaterAccessory);
          } else {
            IsAuxFloSwitchEnabled = true; // if alarm option is set to not display, we need to create an aux switch for the flo device.
            this.log.info("Flo Alarm control disabled. Auxiliary switch control will be shown.");
          }

          if(IsHealthSwitchEnabled) {
              this.config.switchType = "healthswitch";
              var healthswitch = new optionswitch(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen, i);
              // check the accessory was not restored from cache
              var foundAccessory = this.accessories.find(accessory => accessory.UUID === healthswitch.uuid)
              if (!foundAccessory) {
                // create a new accessory
                let newAccessory = new this.api.platformAccessory(currentDevice.name + " Health Test", healthswitch.uuid);
                // add services and Characteristic
                healthswitch.setAccessory(newAccessory);
                // register the accessory
                this.addAccessory(healthswitch);
              }
              else // accessory already exist just set characteristic
                healthswitch.setAccessory(foundAccessory);
              // This a accessories not base on flo device list, track it in another list for future use.
              this.floDeviceAccessory.push(healthswitch);
              this.log.info(`Heath Switch Enabled for ${currentDevice.name}`);
          }
          if(IsAuxFloSwitchEnabled) {
            this.config.switchType = "auxswitch";
            var auxfloswitch = new optionswitch(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen, i);
            // check the accessory was not restored from cache
            var foundAccessory = this.accessories.find(accessory => accessory.UUID === auxfloswitch.uuid)
            if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(currentDevice.name + " Water Control", auxfloswitch.uuid);
              // add services and Characteristic
              auxfloswitch.setAccessory(newAccessory);
              // register the accessory
              this.addAccessory(auxfloswitch);
            }
            else // accessory already exist just set characteristic
              auxfloswitch.setAccessory(foundAccessory);
            // This a accessories not base on flo device list, track it in another list for future use.
            this.floDeviceAccessory.push(auxfloswitch);
            this.log.info(`Water Shutoff Auxiliary Switch Enabled for ${currentDevice.name}`);
          }

          if(IsPSIlux) {
            this.config.switchType = "pSIlux";
            var pSIluxsensor = new optionswitch(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen, i);
            // check the accessory was not restored from cache
            var foundAccessory = this.accessories.find(accessory => accessory.UUID === pSIluxsensor.uuid)
            if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(currentDevice.name + " PSI Sensors", pSIluxsensor.uuid);
              // add services and Characteristic
              pSIluxsensor.setAccessory(newAccessory);
              // register the accessory
              this.addAccessory(pSIluxsensor);
            }
            else // accessory already exist just set characteristic
              pSIluxsensor.setAccessory(foundAccessory);
            // This a accessories not base on flo device list, track it in another list for future use.
            this.floDeviceAccessory.push(pSIluxsensor);
          }
          if(IsGpmlux) {
            this.config.switchType = "gpmlux";
            var gpmluxsensor = new optionswitch(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen, i);
            // check the accessory was not restored from cache
            var foundAccessory = this.accessories.find(accessory => accessory.UUID === gpmluxsensor.uuid)
            if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(currentDevice.name + " GPM Sensors", gpmluxsensor.uuid);
              // add services and Characteristic
              gpmluxsensor.setAccessory(newAccessory);
              // register the accessory
              this.addAccessory(gpmluxsensor);
            }
            else // accessory already exist just set characteristic
              gpmluxsensor.setAccessory(foundAccessory);
            // This a accessories not base on flo device list, track it in another list for future use.
            this.floDeviceAccessory.push(gpmluxsensor);
          }
          if(IsPSIlux || IsGpmlux) 
            this.log.info(`${currentDevice.name} water valve configured. Monitoring Lux senssors are Eneabled and Homebridge control is ${this.config.enableValveControl ? 'Enabled' : 'Disabled'}`);
          else
            this.log.info(`${currentDevice.name} water valve configured. Homebridge control is ${this.config.enableValveControl ? 'Enabled' : 'Disabled'}`);
         break; 
        
        case FLO_WATERSENSOR: 
          var waterAccessory = new watersensor(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen);
          // check the accessory was not restored from cache
          var foundAccessory = this.accessories.find(accessory => accessory.UUID === waterAccessory.uuid)
          if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(waterAccessory.name, waterAccessory.uuid);
              // add services and Characteristic
              waterAccessory.setAccessory(newAccessory);
              // register the accessory
              this.addAccessory(waterAccessory);
          }
          else // accessory already exist just set characteristic
            waterAccessory.setAccessory(foundAccessory);
          lwatersensor = lwatersensor + 1;
          this.floDeviceAccessory.push(waterAccessory);
        break;
       }
    }
    if(lwatersensor > 0) this.log.info(`${lwatersensor} Water sensor(s) discovered and configured.`);
    // Clean accessories with no association with Flo devices.
    this.orphanAccessory();
  
    this.log.info(`Flo device updates complete, background polling process started.\nDevice will be polled each ${Math.floor((this.refreshInterval / 60))} min(s) ${Math.floor((this.refreshInterval % 60))} second(s).`);     
   
    // Start background process to poll devices.
    this.flo.startPollingProcess();
  }

  //Add accessory to homekit dashboard
  addAccessory(device) {

    this.log.debug('Add accessory');
        try {
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [device.accessory]);
          this.accessories.push(device.accessory);
        } catch (err) {
            this.log.error(`Flo load Error: An error occurred while adding accessory: ${err}`);
        }
  }

  //Remove accessory to homekit dashboard
  removeAccessory(accessory, updateIndex) {
      this.log.warn('Removing Flo accessory:',accessory.displayName );
      if (accessory) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      if (updateIndex) {
        if (this.accessories.indexOf(accessory) > -1) {
            this.accessories.splice(this.accessories.indexOf(accessory), 1);
      }}
  }

  // Find accessory with no association with Flo device and remove
  async orphanAccessory() {
    var cachedAccessory = this.accessories;
    var foundAccessory;

    for (var i = 0; i < cachedAccessory.length; i++) 
    {   
      let accessory = cachedAccessory[i];
      // determine if accessory is currently a device in flo system, thus should remain
      //foundAccessory = this.flo.flo_devices.find(device => UUIDGen.generate(device.deviceid.toString()) === accessory.UUID)

      foundAccessory = this.floDeviceAccessory.find(floDeviceAccessory => floDeviceAccessory.uuid === accessory.UUID);
      if (!foundAccessory) {
        if (!foundAccessory) {
            this.removeAccessory(accessory,false);
        }
      }
    }
  }

  // This function is invoked when homebridge restores cached accessories from disk at startup.
  // It should be used to setup event handlers for characteristics and update respective values.
  configureAccessory(accessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }
}

const homebridge = homebridge => {
  Accessory = homebridge.hap.Accessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, FloByMoenPlatform);
};

module.exports = homebridge;