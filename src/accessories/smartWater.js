"use strict";

const floengine = require("../flomain");

const FLO_VALVE_OPEN = 'open';
const FLO_VALVE_CLOSE = 'close';

class FloSmartWater {
 
 constructor(flo, device, log, debug, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.id = device.serialNumber;
    this.log = log;
    this.debug = debug;
    this.name = device.name;
    this.waterTemperature = device.temperature || -270;
    this.valueStatus = device.valveCurrentState;
    this.systemCurrentState = device.systemCurrentState;
    this.systemTargetState = device.systemTargetState;

    this.gallonsPerMin = 1;
    this.uuid = UUIDGen.generate(device.serialNumber);
    this.flo = flo;
    this.flo.on(this.id, this.refreshState.bind(this));

    this.CURRENT_FLO_TO_HOMEKIT = {
      'sleep': Characteristic.SecuritySystemCurrentState.DISARMED,
      'home': Characteristic.SecuritySystemCurrentState.STAY_ARM,
      'away': Characteristic.SecuritySystemCurrentState.AWAY_ARM,
      'alarm': Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
    };
    this.TARGET_FLO_TO_HOMEKIT = {
      'sleep': Characteristic.SecuritySystemTargetState.DISARM,
      'home': Characteristic.SecuritySystemTargetState.STAY_ARM,
      'away': Characteristic.SecuritySystemTargetState.AWAY_ARM,
    };
    this.TARGET_HOMEKIT_TO_FLO = {
      [Characteristic.SecuritySystemTargetState.DISARM]: 'sleep',
      [Characteristic.SecuritySystemTargetState.STAY_ARM]: 'home',
      [Characteristic.SecuritySystemTargetState.AWAY_ARM]: 'away'
    };
    this.VALID_CURRENT_STATE_VALUES = [Characteristic.SecuritySystemCurrentState.STAY_ARM, Characteristic.SecuritySystemCurrentState.AWAY_ARM, Characteristic.SecuritySystemCurrentState.DISARMED, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED];
    this.VALID_TARGET_STATE_VALUES = [Characteristic.SecuritySystemTargetState.STAY_ARM, Characteristic.SecuritySystemTargetState.AWAY_ARM, Characteristic.SecuritySystemTargetState.DISARM];
    
  }


  refreshState(eventData)
  {
    if (this.debug) this.log.debug(`Device updated requested: ` , eventData);
    this.waterTemperature = eventData.device.temperature|| -270;
    this.valueStatus = eventData.device.valveCurrentState;
    // get the leak sensor service to update status
    this.service = this.accessory.getService(this.Service.SecuritySystem);
    if(eventData.device.notifications.pending.criticalCount > 0) {
      this.systemCurrentState = 'alarm';
    }
    else {
      this.systemCurrentState = eventData.device.systemCurrentState;
      this.systemTargetState = eventData.device.systemTargetState;
    }
    this.service.updateCharacteristic(this.Characteristic.SecuritySystemCurrentState, this.CURRENT_FLO_TO_HOMEKIT[this.systemCurrentState]);
    this.service.updateCharacteristic(this.Characteristic.SecuritySystemTargetState, this.TARGET_FLO_TO_HOMEKIT[this.systemTargetState]);

  }

  identify(callback) {
    if (this.debug) this.log.debug(`Identify request for ${this.name}`);
    callback();
  }

  setAccessory(accessory,isNew)  {
    this.accessory = accessory;
    if (isNew) this.accessory.addService(this.Service.SecuritySystem);
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


    // Add temperature sensor
    if (isNew) this.accessory.addService(this.Service.TemperatureSensor);  
    this.service = this.accessory.getService(this.Service.TemperatureSensor);
    // create handlers for required characteristics
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
    .on('get', async callback => this.getCurrentTemperature(callback));

    // create a new Valve service
    if (isNew) this.accessory.addService(this.Service.Valve);  
    this.service = this.accessory.getService(this.Service.Valve);

    // create handlers for required characteristics
    this.service.getCharacteristic(this.Characteristic.Active)
        .on('get', async callback => this.getValveActive(callback))
        .on('set', async (state, callback) => this.setValveActive(state, callback));
    this.service.getCharacteristic(this.Characteristic.InUse)
        .on('get', async callback => this.getValveInUse(callback));
    this.service.getCharacteristic(this.Characteristic.ValveType)
        .on('get', async callback => this.getValveType(callback));
    this.service.getCharacteristic(this.Characteristic.StatusFault)
        .on('get', async callback => this.getValveFault(callback));


  }
// Handle requests to get the alarm states. Return index of alarm state
async getCurrentState(callback) {
    
    var currentValue = this.CURRENT_FLO_TO_HOMEKIT[this.systemCurrentState];
    return callback(null, currentValue);
  }

async getTargetState(callback) {
 
  var currentValue = this.TARGET_FLO_TO_HOMEKIT[this.systemTargetState];
    return callback(null, currentValue);
  }

// Change smart water shutoff state.
async setTargetState(homekitState, callback) {

    callback(null);
  }

// Handle requests to get the current temperature characteristic
async getCurrentTemperature(callback) {
    // set this to a valid value for CurrentTemperature
    return callback(null,this.waterTemperature);
    
  }

// Handle requests to get the current value of the "Active" characteristic
async getValveActive(callback) {

  var currentValue = this.Characteristic.Active.ACTIVE;
  // set this to a valid value for Active
  
  if (!this.valueStatus == FLO_VALVE_OPEN) currentValue = this.Characteristic.Active.INACTIVE;

  return callback(null, currentValue);
}

// Handle requests to set the "Active" characteristic
async setValveActive(homekitState, callback) {
  return callback(null);
}

// Handle requests to get the current value of the "In Use" characteristic
async getValveInUse(callback) {
  var currentValue = this.Characteristic.InUse.NOT_IN_USE;
  // set this to a valid value for InUse
  if (this.gallonsPerMin > 0) currentValue = this.Characteristic.InUse.IN_USE;
  return callback(null, currentValue);
}


// Handle requests to get the current value of the "Valve Type" characteristic
async getValveType(callback) {
  // set this to a valid value for ValveType
  var currentValue = this.Characteristic.ValveType.GENERIC_VALVE;
  return callback(null, currentValue);
}

// Handle requests to get the fault value characteristic
async getValveFault(callback) {

  // set this to a valid value for Active
  var currentValue = this.Characteristic.StatusFault.NO_FAULT;
  return callback(null, currentValue);
}

 async refreshState() {
    
  }

}

module.exports = FloSmartWater;