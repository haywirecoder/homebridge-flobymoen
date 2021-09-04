"use strict";

const floengine = require("../flomain");

class FloWaterSensor {
    constructor(flo, device, log, debug, config, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.id = device.serialNumber;
    this.log = log;
    this.debug = debug;
    this.name = device.name;
    this.uuid = UUIDGen.generate(device.serialNumber);
    this.currentTemperature = device.temperature || -180;
    this.currentHumidity = device.humidity || 0.0;
    this.leakDected = false;
    this.batteryLevel = device.batterylevel || 0;
    this.IsTemperatureAndHumidity = config.showTemperatureAndHumidity ? config.showTemperatureAndHumidity : true;
    this.flo = flo;
    this.flo.on(this.id, this.refreshState.bind(this));
  }

  refreshState(eventData)
  {
    if (this.debug) this.log.debug(`Device updated requested: ` , eventData);
    this.currentTemperature = eventData.device.temperature || -180;
    this.currentHumidity = eventData.device.humidity || 0.0;
    this.batteryLevel = eventData.device.batterylevel || 0;

    // get the leak sensor service to update status
    const leakService = this.accessory.getService(this.Service.LeakSensor);
    if((eventData.device.notifications.criticalCount > 0) || (eventData.device.waterdetect))
    { 
      this.leakDected = true; 
      leakService.updateCharacteristic(this.Characteristic.LeakDetected, this.Characteristic.LeakDetected.LEAK_DETECTED);
    }
     else  { 

       this.leakDected = false;
       leakService.updateCharacteristic(this.Characteristic.LeakDetected, this.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
    }


  }

  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.Model, 'Water Sensor')
        .setCharacteristic(this.Characteristic.SerialNumber, this.id);

       // Add leak sensor
    var leakService = this.accessory.getService(this.Service.LeakSensor);
    if(leakService == undefined) leakService = this.accessory.addService(this.Service.LeakSensor); 
    leakService.getCharacteristic(this.Characteristic.LeakDetected)
        .on('get', async callback => this.getLeakStatus(callback));
    leakService.getCharacteristic(this.Characteristic.StatusLowBattery)
        .on('get', async callback => this.getBatteryStatus(callback));

    // Check if Temperature and Humidity should be shown in homekit
    var tempService;
    var humService;
    if (this.IsTemperatureAndHumidity)
    {
      // Add temperature sensor
      tempService = this.accessory.getService(this.Service.TemperatureSensor);
      if (tempService == undefined) tempService = this.accessory.addService(this.Service.TemperatureSensor);  
      // create handlers for required characteristics
      tempService.getCharacteristic(this.Characteristic.CurrentTemperature)
      .on('get', async callback => this.getCurrentTemperature(callback));

      // Add Humidity sensor
      humService = this.accessory.getService(this.Service.HumiditySensor);
      if (humService == undefined)  humService = this.accessory.addService(this.Service.HumiditySensor);  
      // create handlers for required characteristics
      humService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .on('get', async callback => this.getCurrentRelativeHumidity(callback));
    }
    else {
      // Remove service if already created in cache accessory
      tempService = this.accessory.getService(this.Service.TemperatureSensor);
      if (tempService!= undefined) this.accessory.removeService(tempService);
      humService = this.accessory.getService(this.Service.HumiditySensor);
      if (humService != undefined) this.accessory.removeService(humService);  
    }
  }

  async getLeakStatus(callback) {
    if (this.leakDected)
    {
      return callback(null, this.Characteristic.LeakDetected.LEAK_DETECTED); 
    } else {
      return callback(null, this.Characteristic.LeakDetected.LEAK_NOT_DETECTED); 
    }
    
  }

   //Handle requests to get the current value of the "Current temperature" characteristic
  async getCurrentTemperature(callback) {
    // set this to a valid value for CurrentTemperature
    return callback(null,this.currentTemperature);
    
  }

  //Handle requests to get the current value of the "Current Relative Humidity" characteristic
  async getCurrentRelativeHumidity (callback) {
    return callback(null,this.currentHumidity);

  }
  
  // Battery status Low Battery status and Battery Level.
  async getBatteryStatus(callback) {
    var currentValue = this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    if (this.batteryLevel < 20) currentValue = this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    return callback(null, currentValue);
  }

  async getBatteryLevel(callback) {
    return callback(null, this.batteryLevel);
  }

}

module.exports = FloWaterSensor;