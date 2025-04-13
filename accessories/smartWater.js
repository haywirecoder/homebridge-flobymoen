"use strict";

const FLO_VALVE_OPEN = 'open';
const FLO_VALVE_CLOSE = 'closed';

class FloSmartWater {
  constructor(flo, device, log, config, Service, Characteristic, UUIDGen, deviceIndex, enableSecuritySystem) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.log = log;
    this.name = device.name;
    this.deviceIndex = deviceIndex;
    this.model = device.deviceModel;
    this.serialNumber = device.serialNumber;
    this.location = device.location;
    this.version = device.version;
    this.isInstalled = device.isInstalled;
    this.enableSecuritySystem = enableSecuritySystem !== undefined ? enableSecuritySystem : true; // Default to true for compatibility

    this.deviceid = device.deviceid.toString();
    this.uuid = UUIDGen.generate(this.deviceid);

    this.VALVE_ACTIVE_STATE = {
      'closed': Characteristic.Active.INACTIVE,
      'open': Characteristic.Active.ACTIVE
    };

    this.VALVE_CONFIGURED_STATE = {
      'false': Characteristic.IsConfigured.NOT_CONFIGURED,
      'true': Characteristic.IsConfigured.CONFIGURED
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
    };

    this.TARGET_HOMEKIT_TO_FLO = {
      [Characteristic.SecuritySystemTargetState.DISARM]: 'sleep',
      [Characteristic.SecuritySystemTargetState.STAY_ARM]: 'home',
      [Characteristic.SecuritySystemTargetState.AWAY_ARM]: 'away',
    };

    this.VALID_CURRENT_STATE_VALUES = [
      Characteristic.SecuritySystemCurrentState.STAY_ARM,
      Characteristic.SecuritySystemCurrentState.AWAY_ARM,
      Characteristic.SecuritySystemCurrentState.DISARMED,
      Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
    ];
    this.VALID_TARGET_STATE_VALUES = [
      Characteristic.SecuritySystemTargetState.STAY_ARM,
      Characteristic.SecuritySystemTargetState.AWAY_ARM,
      Characteristic.SecuritySystemTargetState.DISARM
    ];
    this.systemFault = Characteristic.StatusFault.NO_FAULT;
    this.systemTampered = Characteristic.StatusTampered.NOT_TAMPERED;
    this.IsWarningAsCritical = config.treatWarningAsCritical ? config.treatWarningAsCritical : false;
    this.IsValveControlEnabled = config.enableValveControl ? config.enableValveControl : false;
    this.systemCurrentState = device.systemCurrentState;
    this.systemTargetState = device.systemTargetState;
    this.valveStatus = device.valveCurrentState;
    this.flo = flo;
    this.flo.on(this.deviceid, this.refreshState.bind(this));
  }

  refreshState(eventData) {
    this.log.debug(`Device updated requested: `, eventData);
    this.valveStatus = eventData.device.valveGlobalState;
    this.gallonsPerMin = eventData.device.gpm;
    this.isInstalled = eventData.device.isInstalled;
    this.pressure = eventData.device.psi;

    // Get valve service
    const valveService = this.accessory.getService(this.Service.Valve);

    // Update valve state
    valveService.updateCharacteristic(this.Characteristic.Active, this.VALVE_ACTIVE_STATE[this.valveStatus]);
    valveService.updateCharacteristic(this.Characteristic.InUse, this.VALVE_INUSE_STATE[this.valveStatus]);

    // Handle security system only if enabled
    if (this.enableSecuritySystem) {
      const securityService = this.accessory.getService(this.Service.SecuritySystem);
      if (securityService) {
        if (eventData.device.notifications.criticalCount > 0) {
          this.systemCurrentState = 'alarm';
        } else {
          this.systemCurrentState = eventData.device.systemCurrentState;
          this.systemTargetState = eventData.device.systemTargetState;
        }

        // Treat warning as critical
        if ((eventData.device.notifications.warningCount > 0) || (eventData.device.warningCount > 0)) {
          if (this.IsWarningAsCritical) {
            this.systemCurrentState = 'alarm';
          }
        }

        // Is device offline?
        if ((eventData.device.offline != 0) || (eventData.device.isConnected == false)) {
          this.systemFault = this.Characteristic.StatusFault.GENERAL_FAULT;
          this.systemTampered = this.Characteristic.StatusTampered.TAMPERED;
        } else {
          this.systemTampered = this.Characteristic.StatusTampered.NOT_TAMPERED;
          this.systemFault = this.Characteristic.StatusFault.NO_FAULT;
        }

        // Update security system state
        securityService.updateCharacteristic(
          this.Characteristic.SecuritySystemCurrentState,
          this.CURRENT_FLO_TO_HOMEKIT[this.systemCurrentState]
        );
        if (this.systemCurrentState != 'alarm') {
          securityService.updateCharacteristic(
            this.Characteristic.SecuritySystemTargetState,
            this.TARGET_FLO_TO_HOMEKIT[this.systemTargetState]
          );
          securityService.updateCharacteristic(this.Characteristic.StatusTampered, this.systemTampered);
          valveService.updateCharacteristic(this.Characteristic.StatusFault, this.systemFault);
        }
      }
    }
  }

  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory
      .getService(this.Service.AccessoryInformation)
      .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
      .setCharacteristic(this.Characteristic.Model, 'Smart Shutoff Valve - ' + this.model)
      .setCharacteristic(this.Characteristic.SerialNumber, this.serialNumber)
      .setCharacteristic(this.Characteristic.FirmwareRevision, this.version);

    // Valve Service
    let valveService = this.accessory.getService(this.Service.Valve);
    if (!valveService) {
      valveService = this.accessory.addService(this.Service.Valve, this.name + ' Valve');
    }
    valveService.setCharacteristic(this.Characteristic.Name, this.name + ' Valve');
    valveService.setCharacteristic(this.Characteristic.ValveType, 0);
    valveService.setCharacteristic(this.Characteristic.SetDuration, 0);
    valveService.setCharacteristic(this.Characteristic.RemainingDuration, 0);
    valveService
      .getCharacteristic(this.Characteristic.Active)
      .on('get', async callback => this.getValveActive(callback))
      .on('set', async (state, callback) => this.setValveActive(state, callback));
    valveService
      .getCharacteristic(this.Characteristic.InUse)
      .on('get', async callback => this.getValveInUse(callback));
    valveService.setCharacteristic(this.Characteristic.StatusFault, this.systemFault);
    valveService.setCharacteristic(
      this.Characteristic.IsConfigured,
      this.VALVE_CONFIGURED_STATE[this.isInstalled]
    );

    // Security System Service (conditional)
    if (this.enableSecuritySystem) {
      let securityService = this.accessory.getService(this.Service.SecuritySystem);
      if (!securityService) {
        securityService = this.accessory.addService(this.Service.SecuritySystem, this.name + ' Water System');
      }
      securityService.setCharacteristic(this.Characteristic.Name, this.name + ' Water System');
      securityService
        .getCharacteristic(this.Characteristic.SecuritySystemCurrentState)
        .setProps({ validValues: this.VALID_CURRENT_STATE_VALUES })
        .on('get', async callback => this.getCurrentState(callback));
      securityService
        .getCharacteristic(this.Characteristic.SecuritySystemTargetState)
        .setProps({ validValues: this.VALID_TARGET_STATE_VALUES })
        .on('get', async callback => this.getTargetState(callback))
        .on('set', async (state, callback) => this.setTargetState(state, callback));
      securityService.setCharacteristic(
        this.Characteristic.StatusTampered,
        this.Characteristic.StatusTampered.NOT_TAMPERED
      );
    } else {
      // Remove SecuritySystem service if it exists (handles cached accessories)
      let securityService = this.accessory.getService(this.Service.SecuritySystem);
      if (securityService) {
        this.accessory.removeService(securityService);
        this.log.info(`Removed SecuritySystem service for ${this.name} as enableSecuritySystem is false`);
      }
    }

    // Remove deprecated TemperatureSensor service
    let temperatureService = this.accessory.getService(this.Service.TemperatureSensor);
    if (temperatureService) {
      this.accessory.removeService(temperatureService);
    }
  }

  // Handle requests to get the alarm states
  async getCurrentState(callback) {
    if (!this.enableSecuritySystem) {
      this.log.debug('Security system is disabled, ignoring getCurrentState');
      return callback(new Error('Security system is disabled'));
    }
    var currentValue = this.CURRENT_FLO_TO_HOMEKIT[this.systemCurrentState];
    return callback(null, currentValue);
  }

  async getTargetState(callback) {
    if (!this.enableSecuritySystem) {
      this.log.debug('Security system is disabled, ignoring getTargetState');
      return callback(new Error('Security system is disabled'));
    }
    var currentValue = this.TARGET_FLO_TO_HOMEKIT[this.systemTargetState];
    return callback(null, currentValue);
  }

  async setTargetState(homekitState, callback) {
    if (!this.enableSecuritySystem) {
      this.log.debug('Security system is disabled, ignoring setTargetState');
      return callback(new Error('Security system is disabled'));
    }
    this.flo.setSystemMode(this.location, this.TARGET_HOMEKIT_TO_FLO[homekitState], this.systemCurrentState);
    this.systemCurrentState = this.TARGET_HOMEKIT_TO_FLO[homekitState];
    this.systemTargetState = this.TARGET_HOMEKIT_TO_FLO[homekitState];
    callback(null);
  }

  // Handle requests to get the current value of the "Active" characteristic
  async getValveActive(callback) {
    this.log.debug("Trigger Get Valve Active");
    var currentValue = this.VALVE_ACTIVE_STATE[this.valveStatus];
    return callback(null, currentValue);
  }

  // Handle requests to set the "Active" characteristic
  async setValveActive(homekitState, callback) {
    this.log.debug("Trigger Set Valve Active");
    if (this.IsValveControlEnabled) {
      if (homekitState == this.Characteristic.Active.ACTIVE) {
        this.flo.setValve(this.deviceid, FLO_VALVE_OPEN, this.deviceIndex);
        this.valveStatus = FLO_VALVE_OPEN;
      } else {
        this.flo.setValve(this.deviceid, FLO_VALVE_CLOSE, this.deviceIndex);
        this.valveStatus = FLO_VALVE_CLOSE;
      }
    } else {
      this.log.warn("Smart Water Shutoff: Valve control is disabled in Homebridge.");
      var valveService = this.accessory.getService(this.Service.Valve);
      setTimeout(
        function () {
          valveService.updateCharacteristic(this.Characteristic.Active, this.VALVE_ACTIVE_STATE[this.valveStatus]);
        }.bind(this),
        500
      );
    }
    return callback(null);
  }

  // Handle requests to get the current value of the "In Use" characteristic
  async getValveInUse(callback) {
    this.log.debug("Trigger Get Valve In Use");
    var currentValue = this.VALVE_INUSE_STATE[this.valveStatus];
    return callback(null, currentValue);
  }
}

module.exports = FloSmartWater;
