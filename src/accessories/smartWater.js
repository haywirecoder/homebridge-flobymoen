"use strict";

const floengine = require("../flomain");


class FloSmartWater {
  //constructor(name, id, log, debug, flo, Service, Characteristic, UUIDGen) {
 constructor(name, id, log, debug, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.id = id;
    this.log = log;
    this.debug = debug;
    this.name = name;
    //this.flo = flo;
    this.uuid = UUIDGen.generate(id);
   
    this.CURRENT_FLO_TO_HOMEKIT = {
      'OFF': Characteristic.SecuritySystemCurrentState.DISARMED,
      'HOME': Characteristic.SecuritySystemCurrentState.STAY_ARM,
      'AWAY': Characteristic.SecuritySystemCurrentState.AWAY_ARM,
      'HOME_COUNT': Characteristic.SecuritySystemCurrentState.DISARMED,
      'AWAY_COUNT': Characteristic.SecuritySystemCurrentState.DISARMED,
      'ALARM_COUNT': Characteristic.SecuritySystemCurrentState.AWAY_ARM,
      'ALARM': Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
    };
    this.TARGET_FLO_TO_HOMEKIT = {
      'OFF': Characteristic.SecuritySystemTargetState.DISARM,
      'HOME': Characteristic.SecuritySystemTargetState.STAY_ARM,
      'AWAY': Characteristic.SecuritySystemTargetState.AWAY_ARM,
      'HOME_COUNT': Characteristic.SecuritySystemTargetState.STAY_ARM,
      'AWAY_COUNT': Characteristic.SecuritySystemTargetState.AWAY_ARM
    };
    this.TARGET_HOMEKIT_TO_FLO = {
      [Characteristic.SecuritySystemTargetState.DISARM]: 'OFF',
      [Characteristic.SecuritySystemTargetState.STAY_ARM]: 'HOME',
      [Characteristic.SecuritySystemTargetState.AWAY_ARM]: 'AWAY'
    };
    this.VALID_CURRENT_STATE_VALUES = [Characteristic.SecuritySystemCurrentState.STAY_ARM, Characteristic.SecuritySystemCurrentState.AWAY_ARM, Characteristic.SecuritySystemCurrentState.DISARMED, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED];
    this.VALID_TARGET_STATE_VALUES = [Characteristic.SecuritySystemTargetState.STAY_ARM, Characteristic.SecuritySystemTargetState.AWAY_ARM, Characteristic.SecuritySystemTargetState.DISARM];
    
  }

  identify(callback) {
    if (this.debug) this.log.debug(`Identify request for ${this.name}`);
    callback();
  }

  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.on('identify', (paired, callback) => this.identify(callback));

    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.Model, 'Smart Water Shutoff')
        .setCharacteristic(this.Characteristic.SerialNumber, this.id);

    this.service = this.accessory.getService(this.Service.SecuritySystem);

    this.service.getCharacteristic(this.Characteristic.SecuritySystemCurrentState)
        .setProps({ validValues: this.VALID_CURRENT_STATE_VALUES })
        .on('get', async callback => this.getCurrentState(callback));
    this.service.getCharacteristic(this.Characteristic.SecuritySystemTargetState)
        .setProps({ validValues: this.VALID_TARGET_STATE_VALUES })
        .on('get', async callback => this.getTargetState(callback))
        .on('set', async (state, callback) => this.setTargetState(state, callback));
  }

  async getCurrentState(callback, forceRefresh = false) {
    let characteristic = this.service.getCharacteristic(this.Characteristic.SecuritySystemCurrentState);
    return callback(null, characteristic.value);
  }

  async getTargetState(callback, forceRefresh = false) {
    
    let characteristic = this.service.getCharacteristic(this.Characteristic.SecuritySystemTargetState);
    return callback(null, characteristic.value);
  }

  async setTargetState(homekitState, callback) {
    callback(null);
  }

 async refreshState() {
    
  }

}

module.exports = FloSmartWater;