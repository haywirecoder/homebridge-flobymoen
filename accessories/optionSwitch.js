"use strict";

class FloOptionSwitch {
    constructor(flo, device, log, config, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.id = device.serialNumber + '.sw';
    this.log = log;
    this.debug = config.debug;
    this.deviceid = device.deviceid;
    this.uuid = UUIDGen.generate(this.id);
    this.flo = flo;
  }
 
  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.SerialNumber, this.id);

    var swService = this.accessory.getService(this.Service.Switch);
    if(swService == undefined) swService = this.accessory.addService(this.Service.Switch); 
    swService.setCharacteristic(this.Characteristic.On, false);
    swService.getCharacteristic(this.Characteristic.On)
    .on('get', async callback => this.getOn(callback))
    .on('set', async (state, callback) => this.setOn(state, callback));

  }

  async getOn(callback) {
    const returnValue = false;
    return callback(null, returnValue);
  }

  async setOn(value,callback) {
    this.log.info("");
    return callback(null);
  }  

}

module.exports = FloOptionSwitch;