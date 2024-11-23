"use strict";
const HealthTestRunTime = 240000;
const FLO_VALVE_OPEN = 'open';
const FLO_VALVE_CLOSE = 'closed';


class FloOptionSwitch { 
    constructor(flo, device, log, config, Service, Characteristic, UUIDGen, deviceIndex) {
    this.Characteristic = Characteristic;
    this.Service = Service;
    this.model = device.deviceModel;
    this.name = device.name;
    this.deviceIndex = deviceIndex;
    this.serialNumber = device.serialNumber;
    this.log = log;
    this.switchType = config.switchType;
    this.deviceid = device.deviceid.toString();
    this.busy = false;
    this.gallonsPerMin = device.gpm;
    this.pressure = device.psi;
    this.uuid = UUIDGen.generate(this.deviceid + "-" + this.switchType);
    this.flo = flo;
    this.flo.on(device.deviceid, this.refreshState.bind(this));
    this.IsValveControlEnabled = config.enableValveControl ? config.enableValveControl : false;  
    this.valveStatus = device.valveCurrentState;
    this.VALVE_INUSE_STATE = {
      'closed': false,
      'open': true
    };
  }

  refreshState(eventData)
  {
    this.log.debug(`Switch updated requested: ` , eventData);
    this.valveStatus = eventData.device.valveGlobalState;
    this.gallonsPerMin = eventData.device.gpm;
    this.pressure = eventData.device.psi;

  }
 
  setAccessory(accessory) {
    this.accessory = accessory;
    this.accessory.getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.Manufacturer, 'Moen')
        .setCharacteristic(this.Characteristic.SerialNumber, this.serialNumber);

    switch (this.switchType) {
      case 'healthswitch':
        var swServiceHealthTest = this.accessory.getService(this.Service.Switch);
        if(swServiceHealthTest == undefined) swServiceHealthTest = this.accessory.addService(this.Service.Switch, this.name + ' Health Check');
        swServiceHealthTest.setCharacteristic(this.Characteristic.Name, this.name + ' Health Check'); 
        swServiceHealthTest.setCharacteristic(this.Characteristic.On, false);
        swServiceHealthTest.getCharacteristic(this.Characteristic.On)
        .on('get', async callback => this.getHealthTestOn(callback))
        .on('set', async (state, callback) => this.setHealthTestOn(state, callback));
      break;
      case 'auxswitch':
        this.accessory.getService(this.Service.AccessoryInformation)
          .setCharacteristic(this.Characteristic.Model, 'Smart Shutoff Switch ' + this.model)
        var swServiceAux = this.accessory.getService(this.Service.Switch);
        if(swServiceAux == undefined) swServiceAux = this.accessory.addService(this.Service.Switch, this.name + ' Valve Switch'); 
        swServiceAux.setCharacteristic(this.Characteristic.Name, this.name + ' Valve Switch'); 
        swServiceAux.setCharacteristic(this.Characteristic.On, false);
        swServiceAux.getCharacteristic(this.Characteristic.On)
        .on('get', async callback => this.getAuxSwitch(callback))
        .on('set', async (state, callback) => this.setAuxSwitch(state, callback));
      break;
      case 'pSIlux':
        // Created two light sensors to report GPM and PSI sensor
        var lightSensorPSIService = this.accessory.getService(this.Service.LightSensor,'PSIService');
        if (lightSensorPSIService == undefined) lightSensorPSIService = this.accessory.addService(this.Service.LightSensor, this.name + ' PSI','PSIService');  
        // create handlers for required characteristics
        lightSensorPSIService.getCharacteristic(this.Characteristic.CurrentAmbientLightLevel)
        .on('get', async callback => this.getCurrentPSI(callback));
      break;
      case 'gpmlux':
        var lightSensorGPMService = this.accessory.getService(this.Service.LightSensor,'GPMService');
        if (lightSensorGPMService == undefined) lightSensorGPMService = this.accessory.addService(this.Service.LightSensor, this.name + ' GPM','GPMService');  
        // create handlers for required characteristics
        lightSensorGPMService.getCharacteristic(this.Characteristic.CurrentAmbientLightLevel)
        . on('get', async callback => this.getCurrentGPM(callback));
      break;
    }

  }

  // Health check switch handlers
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

  // Aux switch handlers
  async getAuxSwitch(callback) {
    var currentValve = this.VALVE_INUSE_STATE[this.valveStatus];
    return callback(null, currentValve);
  }

  async setAuxSwitch(value,callback) { 
    var switchService = this.accessory.getService(this.Service.Switch);
    if (this.IsValveControlEnabled) {
      if (value) {
        await this.flo.setValve(this.deviceid , FLO_VALVE_OPEN, this.deviceIndex)
        this.valveStatus = FLO_VALVE_OPEN;
      }
      else {
        await this.flo.setValve(this.deviceid , FLO_VALVE_CLOSE, this.deviceIndex)
        this.valveStatus = FLO_VALVE_CLOSE;
      
      }
     // setTimeout(function () {this.flo.refreshDevice(this.deviceIndex)}.bind(this),30000);
    } 
    else {
      this.log.warn("Smart Water Shutoff: Valve control is disabled in Homebridge."); 
      // Get the button service and updated switch soon after set function is complete 
      var currentValve = this.VALVE_INUSE_STATE[this.valveStatus];
      setTimeout(function () {switchService.updateCharacteristic(this.Characteristic.On,currentValve)}.bind(this),2000);
    }
    return callback(null);
  }
  
//Handle requests to get the current value of the "Current light PSI" characteristic
async getCurrentPSI(callback) {
  // set this to a valid value for CurrentTemperature
  return callback(null,this.pressure);
}

//Handle requests to get the current value of the "Current light for GPM" characteristic
async getCurrentGPM(callback) {
  // set this to a valid value for GPM
  if (this.gallonsPerMin == 0) 
    return callback(null,0.0001);
  else 
    return callback(null,this.gallonsPerMin);
}
 
}

module.exports = FloOptionSwitch;