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
    this.debug = config.debug || false;
    this.devices = [];
    this.accessories = [];
    this.optionalAccessories = [];
    this.api = api;  
    this.refreshInterval = config.deviceRefresh * 1000 || 30000;
    this.config = config;

    // Check if authentication has been provided.
    if ((!this.config.auth.username) || (!this.config.auth.password))
    {
      this.log.error('Flo authentication information not provided.');
       // terminate plug-in initization
      return;
    }

    // Returns the path to the Homebridge storage folder.
    this.storagePath = api.user.storagePath();

    // Create FLo engine object to interact with Flo APIs.
    this.flo = new floengine (log, config, this.storagePath, this.debug);
    // Login in meetflo portal
    this.log.info("Starting communication with Flo portal");
    this.initialLoad = this.flo.init().then ( () => {
      if (this.debug) this.log.debug('Initialization Successful.');
    }).catch(err => {
              this.log.error('Flo API Initization Failure:', err);
               // terminate plug-in initization
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
          this.log.info("Initiaizing Flo devices...")
          this.flo.discoverDevices().then (() => {
          // Once devices are discovered update Homekit assessories
          this.refreshAccessories();
          this.log.info(`Flo device updates complete, background polling process started.\nDevice will be polled each ${Math.floor((config.deviceRefresh / 60))} min(s) ${Math.floor((config.deviceRefresh % 60))} second(s).`);      
        })
      })
    });
  }

  // Create associates in Homekit based on devices in flo account
  async refreshAccessories() {
  
  // Process each flo devices and create accessories within the platform. smart water value and water sensor classes 
  // will handle the creation and setting callback for each device types.
  var IsHealthSwitchEnabled = this.config.showHealthTestSwitch ? this.config.showHealthTestSwitch : false;

  for (var i = 0; i < this.flo.flo_devices.length; i++) {
    let currentDevice = this.flo.flo_devices[i];
    switch (currentDevice.type) {
        case FLO_SMARTWATER:
          var smartWaterAccessory = new smartwater(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen);
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
          if(IsHealthSwitchEnabled) {
              var healthswitch = new optionswitch(this.flo, currentDevice, this.log, this.config, Service, Characteristic, UUIDGen);
              // check the accessory was not restored from cache
              var foundAccessory = this.accessories.find(accessory => accessory.UUID === healthswitch.uuid)
              if (!foundAccessory) {
                // create a new accessory
                let newAccessory = new this.api.platformAccessory(currentDevice.name +" Health Test", healthswitch.uuid);
                // add services and Characteristic
                healthswitch.setAccessory(newAccessory);
                // register the accessory
                this.addAccessory(healthswitch);
              }
              else // accessory already exist just set characteristic
                healthswitch.setAccessory(foundAccessory);
              // This a accessories not base on flo device list, track it in another list for future use.
              this.optionalAccessories.push(healthswitch);
          }
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
        break;
       }
    }
    // Clean accessories with no association with Flo devices.
    this.orphanAccessory();
    // Start background process to poll devices.
    this.flo.startPollingProcess();
  }

  //Add accessory to homekit dashboard
  addAccessory(device) {

    if (this.debug) this.log.debug('Add accessory');
        try {
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [device.accessory]);
          this.accessories.push(device.accessory);
        } catch (err) {
            this.log.error(`An error occurred while adding accessory: ${err}`);
        }
  }

  //Remove accessory to homekit dashboard
  removeAccessory(accessory, updateIndex) {
      this.log.warn('Removing accessory:',accessory.displayName );
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
      foundAccessory = this.flo.flo_devices.find(device => UUIDGen.generate(device.serialNumber) === accessory.UUID)
      if (!foundAccessory) {
        // determine if an optional compoment, thus should remain
        foundAccessory = this.optionalAccessories.find(optionalAccessory => optionalAccessory.uuid === accessory.UUID);
        if (!foundAccessory) {
            this.removeAccessory(accessory,true);
        }
      }
    }
  }

  // This function is invoked when homebridge restores cached accessories from disk at startup.
  // It should be used to setup event handlers for characteristics and update respective values.
  configureAccessory(accessory) {
    if (this.debug) this.log.debug('Loading accessory from cache:', accessory.displayName);
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