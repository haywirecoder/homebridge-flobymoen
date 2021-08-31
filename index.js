const packageJson = require('./package.json');
const smartwater = require('./accessories/smartWater');
const watersensor = require('./accessories/waterSensor');
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
    this.excludedDevices = config.excludedDevices || [];
    this.devices = [];
    this.accessories = [];
    this.api = api;  
    this.refreshInterval = config.deviceRefresh * 1000 || 30000;
    this.valveControl = config.enableValveCntrl || false;
    this.flo = new floengine (log, config, this.debug);
    
   
    // Login in meetflo portal
    this.log.info("Starting communication with Flo portal");
    this.initialLoad = this.flo.init().then ( () => {
      if (this.debug) this.log.debug('Initialization Successful.');
    }).catch(err => {
              this.log.error('Flo API Initization Failure:', err);
    });

  
    api.on('didFinishLaunching', () => {

      // When login completes discover devices with flo account
      this.initialLoad.then(() => {
          // Discover devices
          this.log.info("Initiaizing Flo devices...")
          this.flo.discoverDevices().then (() => {
            
            // for (var i = 0; i < this.accessories.length; i++) 
            //  {   
            //   this.log.info("Removing: ", i) 
            //   this.removeAccessory(this.accessories[i], false);}
              
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

  for (var i = 0; i < this.flo.flo_devices.length; i++) {
    let currentDevice = this.flo.flo_devices[i];
    switch (currentDevice.type) {
        case FLO_SMARTWATER:
          var smartWaterAccessory = new smartwater(this.flo, currentDevice,this.log, this.debug, this.valveControl, Service, Characteristic, UUIDGen);
          // check the accessory was not restored from cache
          var foundAccessory = this.accessories.find(accessory => accessory.UUID === smartWaterAccessory.uuid)
          if (!foundAccessory) {
            // create a new accessory
            let newAccessory = new this.api.platformAccessory(smartWaterAccessory.name, smartWaterAccessory.uuid);
            // add services and Characteristic
            smartWaterAccessory.setAccessory(newAccessory,true);
            // register the accessory
            this.addAccessory(smartWaterAccessory);
          }
          else // accessory already exist just set characteristic
            smartWaterAccessory.setAccessory(foundAccessory,false);
        break; 
        case FLO_WATERSENSOR: 
          var waterAccessory = new watersensor(this.flo, currentDevice,this.log, this.debug, Service, Characteristic, UUIDGen);
          // check the accessory was not restored from cache
          var foundAccessory = this.accessories.find(accessory => accessory.UUID === waterAccessory.uuid)

          if (!foundAccessory) {
              // create a new accessory
              let newAccessory = new this.api.platformAccessory(waterAccessory.name, waterAccessory.uuid);
              // add services and Characteristic
              waterAccessory.setAccessory(newAccessory,true);
              // register the accessory
              this.addAccessory(waterAccessory);
          }
          else // accessory already exist just set characteristic
            waterAccessory.setAccessory(foundAccessory,false);
        break;
       }
       // Start background process to poll devices.
       this.flo.startPollingProcess();
    }
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
    if (this.debug) this.log.debug('Removing accessory:',accessory.displayName );
      if (accessory) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      if (updateIndex) {
        if (this.accessories.indexOf(accessory) > -1) {
            this.accessories.splice(this.accessories.indexOf(accessory), 1);
      }}
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