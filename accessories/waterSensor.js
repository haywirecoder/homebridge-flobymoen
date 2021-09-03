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
    this.currentTemperature = device.temperature || -270;
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
    this.currentTemperature = eventData.device.temperature || -270;
    this.currentHumidity = eventData.device.humidity || 0.0;
    this.batteryLevel = eventData.device.batterylevel || 0;

    // get the leak sensor service to update status
    this.service = this.accessory.getService(this.Service.LeakSensor);
    if(eventData.device.notifications.criticalCount > 0) 
    { 
      this.leakDected = true; 
      this.service.updateCharacteristic(this.Characteristic.LeakDetected, this.Characteristic.LeakDetected.LEAK_DETECTED);
    }
     else  { 

       this.leakDected = false;
       this.service.updateCharacteristic(this.Characteristic.LeakDetected, this.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
    }


  }

  identify(callback) {
    if (this.debug) this.log.debug(`Identify request for ${this.name}`);
    callback();
  }

 
  setAccessory(accessory,isNew) {
    this.accessory = accessory;

    // Add leak sensor
    if (isNew) this.accessory.addService(this.Service.LeakSensor);
    this.accessory.on('identify', (paired, callback) => this.identify(callback));

    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.Model, 'Water Sensor')
        .setCharacteristic(this.Characteristic.SerialNumber, this.id);

    this.service = this.accessory.getService(this.Service.LeakSensor);
    this.service.getCharacteristic(this.Characteristic.LeakDetected)
        .on('get', async callback => this.getLeakStatus(callback));

    this.service.getCharacteristic(this.Characteristic.StatusLowBattery)
        .on('get', async callback => this.getBatteryStatus(callback));
    this.service.getCharacteristic(this.Characteristic.BatteryLevel)
        .on('get', async callback => this.getBatteryLevel(callback));

    // Check if Temperature and Humidity should be shown in homekit
    if (this.IsTemperatureAndHumidity)
    {
      // Add temperature sensor
      this.service = this.accessory.getService(this.Service.TemperatureSensor);
      if (this.service == undefined) this.service = this.accessory.addService(this.Service.TemperatureSensor);  
      // create handlers for required characteristics
      this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .on('get', async callback => this.getCurrentTemperature(callback));

      // Add Humidity sensor
      this.service = this.accessory.getService(this.Service.HumiditySensor);
      if (this.service == undefined)  this.service = this.accessory.addService(this.Service.HumiditySensor);  
      this.service = this.accessory.getService(this.Service.HumiditySensor);
      // create handlers for required characteristics
      this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .on('get', async callback => this.getCurrentRelativeHumidity(callback));
    }
    else {
      // Remove service if already created in cache accessory
      this.service = this.accessory.getService(this.Service.TemperatureSensor);
      if (this.service != undefined) this.accessory.removeService(this.service);
      this.service = this.accessory.getService(this.Service.HumiditySensor);
      if (this.service != undefined) this.accessory.removeService(this.service);  
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