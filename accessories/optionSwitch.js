"use strict";
const HealthTestRunTime = 240000;
class FloOptionSwitch {
    constructor(flo, device, log, config, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.id = device.serialNumber + '.sw';
    this.log = log;
    this.deviceid = device.deviceid;
    this.busy = false;
    this.uuid = UUIDGen.generate(this.id);
    this.flo = flo;
  }
 
  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.SerialNumber, this.id);

    var swServiceHealthTest = this.accessory.getService(this.Service.Switch);
    if(swServiceHealthTest == undefined) swServiceHealthTest = this.accessory.addService(this.Service.Switch); 
    swServiceHealthTest.setCharacteristic(this.Characteristic.On, false);
    swServiceHealthTest.getCharacteristic(this.Characteristic.On)
    .on('get', async callback => this.getHealthTestOn(callback))
    .on('set', async (state, callback) => this.setHealthTestOn(state, callback));

  }

  async getHealthTestOn(callback) {
    if(!this.busy) return callback(null, false);
    else return callback(null, true);
  }

  async setHealthTestOn(value,callback) {
    if(!this.busy) {
      this.busy = true;
      this.flo.runHealthCheck(this.deviceid);
      setTimeout(this.HeathTestComplete.bind(this), HealthTestRunTime);
    }
    return callback(null);
  }   

  HeathTestComplete ()
  {
    this.busy = false;
    var swServiceHealthTest = this.accessory.getService(this.Service.Switch);
    swServiceHealthTest.updateCharacteristic(this.Characteristic.On, false);
    this.log.info("Health Test Complete.");
  }
}

module.exports = FloOptionSwitch;