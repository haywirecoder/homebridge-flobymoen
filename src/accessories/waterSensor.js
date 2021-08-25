"use strict";

const floengine = require("../flomain");

class FloWaterSensor {
    constructor(flo, device, log, debug, Service, Characteristic, UUIDGen) {
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
    this.flo = flo;
    this.flo.on(this.id, this.refreshState.bind(this));
  }

  refreshState(event)
  {
    if (this.debug) this.log.debug(`Device updated requested: ` , event);
    this.currentTemperature = event.device.temperature|| -270;
    this.currentHumidity = event.device.humidity || 0.0;
    this.batteryLevel = event.device.batterylevel || 0;

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

    // Add temperature sensor
    if (isNew) this.accessory.addService(this.Service.TemperatureSensor);  
    this.service = this.accessory.getService(this.Service.TemperatureSensor);
    // create handlers for required characteristics
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
    .on('get', async callback => this.getCurrentTemperature(callback));

     // Add Humidity sensor
     if (isNew) this.accessory.addService(this.Service.HumiditySensor);  
     this.service = this.accessory.getService(this.Service.HumiditySensor);
     // create handlers for required characteristics
     this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
     .on('get', async callback => this.getCurrentRelativeHumidity(callback));
 

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