const packageJson = require('./package.json');
const flometer = require('./accessories/floMeter');
const watersensor = require('./accessories/waterSensor');
const floengine = require("./flomain");

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
    //this.flo = new floengine (log,config, "",homebridge.hap.Storage);;
    let refreshInterval = 30000;
    
    if (config.deviceRefresh) {
      refreshInterval = config.deviceRefresh * 1000;
    }
    this.log.info("Testing-1")
    api.on('didFinishLaunching', () => {
      this.initAccessories(this.accessories);
      /*const flometerAccessory = new flometer("Main","000000001",this.log, this.debug, Service, Characteristic, UUIDGen);
     
      this.log.info("Testing-2")
      // check the accessory was not restored from cache
      if (!this.accessories.find(accessory => accessory.UUID === flometerAccessory.uuid)) {

        // create a new accessory
        const newAccessory = new this.api.platformAccessory(flometerAccessory.name, flometerAccessory.uuid);
        newAccessory.addService(Service.SecuritySystem);
        flometerAccessory.setAccessory(newAccessory);
        // register the accessory
        this.log.info("Testing-4")
        api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [flometerAccessory.accessory]);

      }*/
    });
    this.log.info("Testing-5")
    /*const flometerAccessory = new flometer("Main","1234567890--1",this.log, this.debug, Service, Characteristic, UUIDGen);
    let newAccessory = new Accessory("Main", UUIDGen.generate("1234567890"));
    newAccessory.addService(Service.SecuritySystem);
    flometerAccessory.setAccessory(newAccessory);
    this.accessories.push(flometerAccessory.accessory);

    /* this.flo = new floclass (log,config, "",homebridge.hap.Storage);

    this.initialLoad = this.flo.init().then ( () => {
      if (this.debug) this.log.debug('Initialization Successful.');
      this.discoverDevice = this.flo.discoverDevices().then ( () => {
        this.flo.refreshAllDevices();
      })
    }).catch(err => {
              this.log.error('Initization Failure:', err);
    });*/
    
 
  }

  initAccessories(flo_devices) {
    /*if (this.debug) this.log.debug(`Initializing accessories`);
    for (var i = 0; i < flo_devices.length; i++) {
      let loc_device = flo_devices[i];
      switch (device.type) {
        case FLO_SMARTMETER:
          //let flometerAccessory = new flometer(loc_device.devicename,loc_device.serialNumber,this.log, this.debug, Service, Characteristic, UUIDGen);
          const flometerAccessory = new flometer("Main","000000001",this.log, this.debug, Service, Characteristic, UUIDGen);
          // check the accessory was not restored from cache
          if (!this.accessories.find(accessory => accessory.UUID === flometerAccessory.uuid)) {
            // create a new accessory
            let newAccessory = new this.api.platformAccessory(flometerAccessory.name, flometerAccessory.uuid);
            newAccessory.addService(Service.SecuritySystem);
            flometerAccessory.setAccessory(newAccessory);
            // register the accessory
            this.addAccessory(flometerAccessory);
         }
         break; 

        case FLO_WATERSENSOR: 
          break;*/
           //let waterAccessory = new watersensor(loc_device.devicename,loc_device.serialNumber,this.log, this.debug, Service, Characteristic, UUIDGen);
       
          let waterAccessory = new watersensor("Bathroom","100000001",this.log, this.debug, Service, Characteristic, UUIDGen);
          // check the accessory was not restored from cache
            if (!this.accessories.find(accessory => accessory.UUID === waterAccessory.uuid)) {
            // create a new accessory
            let newAccessory = new this.api.platformAccessory(waterAccessory.name, waterAccessory.uuid);
            newAccessory.addService(Service.LeakSensor);
            waterAccessory.setAccessory(newAccessory);
            // register the accessory
            this.addAccessory(waterAccessory);
          }
     /* }
          
    }*/
  }

  addAccessory(device) {

    if (this.debug) this.log.debug('Add accessory');
        try {
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [device.accessory]);
          this.accessories.push(device.accessory);
        } catch (err) {
            this.log.error(`An error occurred while adding accessory: ${err}`);
        }
  }

  removeAccessory(accessory) {
    if (this.debug) this.log.debug('Remove accessory');
      if (accessory) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      if (this.accessories.indexOf(accessory) > -1) {
          this.accessories.splice(this.accessories.indexOf(accessory), 1);
      }
  }

  configureAccessory(accessory) {
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