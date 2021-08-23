"use strict";

const floengine = require("../flomain");

class FloWaterSensor {
    constructor(device, log, debug, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.id = id;
    this.log = log;
    this.debug = debug;
    this.name = device.name;
    this.uuid = UUIDGen.generate(device.serialNumber);
    this.ws_temperature =device.temperature;
    this.ws_humidity = device.humidity
    this.ws_leakdected = false;
    this.ws_batterylevel = device.batterylevel;
  }

  identify(callback) {
    if (this.debug) this.log.debug(`Identify request for ${this.name}`);
    callback();
  }

 
  setAccessory(accessory) {
    this.accessory = accessory;

    // Add leak sensor
    this.accessory.addService(this.Service.LeakSensor);
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

    // Add temperature sensor
    this.accessory.addService(this.Service.TemperatureSensor);  
    this.service = this.accessory.getService(this.Service.TemperatureSensor);
    // create handlers for required characteristics
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
    .on('get', async callback => this.getCurrentTemperature(callback));

     // Add Humidity sensor
     this.accessory.addService(this.Service.HumiditySensor);  
     this.service = this.accessory.getService(this.Service.HumiditySensor);
     // create handlers for required characteristics
     this.service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
     .on('get', async callback => this.getCurrentRelativeHumidity(callback));
 

  }

 
  async getSensorInformation() {
    return "";
  }

  async getLeakStatus(callback) {
    if (this.ws_leakdected)
    {
      return callback(null, this.Characteristic.LeakDetected.LEAK_DETECTED); 
    } else {
      return callback(null, this.Characteristic.LeakDetected.LEAK_NOT_DETECTED); 
    }
    
  }

  async getCurrentTemperature(callback) {
    // set this to a valid value for CurrentTemperature
    return callback(null,this.ws_temperature);
    
  }

  //Handle requests to get the current value of the "Current Relative Humidity" characteristic
  async getCurrentRelativeHumidity (callback) {
    return callback(null,this.ws_humidity);

  }

  async getBatteryStatus(callback) {
    return callback(null, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
  }

  async refreshState() {
    
  }

}

module.exports = FloWaterSensor;