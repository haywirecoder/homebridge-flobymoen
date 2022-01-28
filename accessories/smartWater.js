"use strict";

const FLO_VALVE_OPEN = 'open';
const FLO_VALVE_CLOSE = 'closed';

class FloSmartWater {
 
 constructor(flo, device, log, config, Service, Characteristic, UUIDGen) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.log = log;
    this.name = device.name;
    this.serialNumber = device.serialNumber;
    this.location = device.location;
    this.valveStatus = device.valveTargetState;
    this.systemCurrentState = device.systemTargetState;
    this.systemTargetState = device.systemTargetState;
    this.gallonsPerMin = device.gpm;
    this.deviceid = device.deviceid.toString();
    this.uuid = UUIDGen.generate(this.deviceid);

    this.VALVE_ACTIVE_STATE = {
      'closed': Characteristic.Active.INACTIVE,
      'open': Characteristic.Active.ACTIVE
    };

    this.VALVE_INUSE_STATE = {
      'closed': Characteristic.InUse.NOT_IN_USE,
      'open': Characteristic.InUse.IN_USE
    };

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
      'alarm': Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
    };

    this.TARGET_HOMEKIT_TO_FLO = {
      [Characteristic.SecuritySystemTargetState.DISARM]: 'sleep',
      [Characteristic.SecuritySystemTargetState.STAY_ARM]: 'home',
      [Characteristic.SecuritySystemTargetState.AWAY_ARM]: 'away',
      [Characteristic.SecuritySystemCurrentState.NIGHT_ARM]: 'home' // Night mode should never occur, but as a safety precaution.
    };
    this.VALID_CURRENT_STATE_VALUES = [Characteristic.SecuritySystemCurrentState.STAY_ARM, Characteristic.SecuritySystemCurrentState.AWAY_ARM, Characteristic.SecuritySystemCurrentState.DISARMED, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED];
    this.VALID_TARGET_STATE_VALUES = [Characteristic.SecuritySystemTargetState.STAY_ARM, Characteristic.SecuritySystemTargetState.AWAY_ARM, Characteristic.SecuritySystemTargetState.DISARM];
    this.systemFault = Characteristic.StatusFault.NO_FAULT;
    this.IsWarningAsCritical = config.treatWarningAsCritical ? config.treatWarningAsCritical : false;  
    this.IsValveControlEnabled = config.enableValveControl ? config.enableValveControl : false;  
    this.flo = flo;
    this.flo.on(this.deviceid, this.refreshState.bind(this));
  }


  refreshState(eventData)
  {
    this.log.debug(`Device updated requested: ` , eventData);
    this.valveStatus = eventData.device.valveCurrentState;
    this.gallonsPerMin = eventData.device.gpm;
    // get security system
    const securitySevice = this.accessory.getService(this.Service.SecuritySystem);
    const valveService = this.accessory.getService(this.Service.Valve);
    if(eventData.device.notifications.criticalCount > 0) {
      this.systemCurrentState = 'alarm';
      this.systemTargetState = 'alarm';
    } else {
      // Current state does not provide correct state, using TargetState
      this.systemCurrentState = eventData.device.systemTargetState;
      this.systemTargetState = eventData.device.systemTargetState;
    }
    // Treat warning as faults
    if (eventData.device.notifications.warningCount > 0) {
      this.systemFault = this.Characteristic.StatusFault.GENERAL_FAULT;
      // Check option if warning should be esculated to alarms
      if (this.IsWarningAsCritical)
      {
        this.systemCurrentState = 'alarm';
        this.systemTargetState = 'alarm';
      }
    }
    else
      this.systemFault = this.Characteristic.StatusFault.NO_FAULT;
   

    // Update valve state
    valveService.updateCharacteristic(this.Characteristic.Active,this.VALVE_ACTIVE_STATE[this.valveStatus]);
    valveService.updateCharacteristic(this.Characteristic.InUse,this.VALVE_INUSE_STATE[this.valveStatus]);
   
    // Update mode state
    securitySevice.updateCharacteristic(this.Characteristic.SecuritySystemCurrentState, this.CURRENT_FLO_TO_HOMEKIT[this.systemCurrentState]);
    securitySevice.updateCharacteristic(this.Characteristic.SecuritySystemTargetState, this.TARGET_FLO_TO_HOMEKIT[this.systemTargetState]);
    securitySevice.updateCharacteristic(this.Characteristic.StatusFault, this.systemFault);

  }

  setAccessory(accessory)  {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.Model, 'Smart Water Shutoff')
        .setCharacteristic(this.Characteristic.SerialNumber, this.serialNumber);

    var securityService = this.accessory.getService(this.Service.SecuritySystem);
    if(securityService == undefined) securityService = this.accessory.addService(this.Service.SecuritySystem,'System Mode');
    securityService.setCharacteristic(this.Characteristic.Name, 'System Mode'); 
    securityService.getCharacteristic(this.Characteristic.SecuritySystemCurrentState)
        .setProps({ validValues: this.VALID_CURRENT_STATE_VALUES })
        .on('get', async callback => this.getCurrentState(callback));
        securityService.getCharacteristic(this.Characteristic.SecuritySystemTargetState)
        .setProps({ validValues: this.VALID_TARGET_STATE_VALUES })
        .on('get', async callback => this.getTargetState(callback))
        .on('set', async (state, callback) => this.setTargetState(state, callback));
    securityService.setCharacteristic(this.Characteristic.StatusFault, this.systemFault);

    // create a new Valve service
    var valveService = this.accessory.getService(this.Service.Valve);
    if(valveService == undefined) valveService = this.accessory.addService(this.Service.Valve,'Valve'); 
    // create handlers for required characteristics
    valveService.setCharacteristic(this.Characteristic.Name, 'Valve'); 
    valveService.getCharacteristic(this.Characteristic.Active)
        .on('get', async callback => this.getValveActive(callback))
        .on('set', async (state, callback) => this.setValveActive(state, callback));
    valveService.getCharacteristic(this.Characteristic.InUse)
        .on('get', async callback => this.getValveInUse(callback));
    valveService.getCharacteristic(this.Characteristic.ValveType)
        .on('get', async callback => this.getValveType(callback));
    valveService.getCharacteristic(this.Characteristic.StatusFault)
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

// Change smart water shutoff monitoring state.
async setTargetState(homekitState, callback) {
    this.flo.setSystemMode(this.location, this.TARGET_HOMEKIT_TO_FLO[homekitState],this.systemCurrentState);
    this.systemCurrentState = this.TARGET_HOMEKIT_TO_FLO[homekitState];
    this.systemTargetState = this.TARGET_HOMEKIT_TO_FLO[homekitState];
    callback(null);
  }

// Handle requests to get the current value of the "Active" characteristic
async getValveActive(callback) {

  // Assume on and disable if state is close
  var currentValue = this.VALVE_ACTIVE_STATE[this.valveStatus];
  return callback(null, currentValue);
}

// Handle requests to set the "Active" characteristic
async setValveActive(homekitState, callback) {
  if (this.IsValveControlEnabled) {
    if (homekitState == this.Characteristic.Active.ACTIVE) 
    {  
      this.flo.setValve(this.deviceid , FLO_VALVE_OPEN)
      this.valveStatus = FLO_VALVE_OPEN;
    }
    else {
      this.flo.setValve(this.deviceid , FLO_VALVE_CLOSE)
      this.valveStatus = FLO_VALVE_CLOSE;
    }
  } else {
      this.log.warn("Smart Water Shutoff: Valve control is disabled in Homebridge.");
      var valveService = this.accessory.getService(this.Service.Valve);
      setTimeout(function () {valveService.updateCharacteristic(this.Characteristic.Active,this.VALVE_ACTIVE_STATE[this.valveStatus])}.bind(this),500);
  }
  return callback(null);
}

// Handle requests to get the current value of the "In Use" characteristic
async getValveInUse(callback) {
  // var currentValue = this.Characteristic.InUse.NOT_IN_USE;
  // set this to a valid value for In-Use base meter usage
  var currentValue = this.VALVE_INUSE_STATE[this.valveStatus];
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

}

module.exports = FloSmartWater;