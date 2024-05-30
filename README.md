[![NPM Version](https://img.shields.io/npm/v/homebridge-flobymoen.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-flobymoen)


<p align="center">
  <img src="https://github.com/haywirecoder/homebridge-flobymoen/blob/master/images/flo-by-moen-logo.jpg" width="150">
  <img src="https://github.com/homebridge/branding/blob/latest/logos/homebridge-color-round-stylized.png" width="150">
</p>


# Homebridge Plug-In for Flo by Moen 
A Homebridge plug-in to integrate the Flo by Moen 3 water system with HomeKit. This plug-in manages the Flo smart water kit system. It monitors and controls devices via the Flo unofficial cloud API. Thanks to the aioflo Python3 library https://github.com/bachya/aioflo development team, this module uses the logic gained from reviewing those libraries/code.

## Limitation:
* This module works with Smart Water Shutoff and Water Sensors only. It does not support the Flo Smart Water Faucets or Sump pump monitor.
* This module will poll for the status of the various components based on the frequency provided in the configuration file. No real-time notification is provided.

## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Flo Moen username. This is a required value.                    |
| password              | Flo Moen password. This is a required value.                                                                 |
| deviceRefresh        | Polling interval to obtain the status of Flo devices, provided in seconds. Default to <i>90</i> seconds, this is an optional value. <b>Please note:</b> Small values may cause account lock or frequent API errors.                                                                    |
| sleepRevertMinutes          | When Smart Water Shutoff Value is put into sleep what amount of time before it reverts to the previous mode (away or home).  Time value is provided in minutes (<i>120, 1440, 4320</i>). Default to <i>120</i> mins (2 hours), this is an optional value.
| showTemperatureAndHumidity| Display Temperature and Humidity for Water Sensors in Homekit.   Default to <i>true</i>, this is an optional value.                                                        |
| showHealthTestSwitch | Display Health Check switch in Homekit. The switch will turn on for 4 minutes while Flo runs the health check.  Default to <i>false</i>, this is an optional value.        
| disableCache         | Disable the storage of Flo access token. This will cause the plug-in to obtain a new access token upon startup. This could result in a minor performance hit at startup. Default to <i>false</i>, this is an optional value. |                                           
| enableValveControl         | Enable Homekit to control the Smart Water Shutoff valve. By design, the valve will be displayed in Homekit (e.g. Home). The status of the valve will be displayed and monitored, however, it will not be controllable (e.g. Open or Close) unless this value is set to true. Default to <i>false</i>, this is an optional value.   |
| treatWarningAsCritical         | By default, Flo warnings are treated as alarm faults. Set this value to <i>true</i> to escalate Flo warnings to critical resulting in a Homekit alarm trigger event. |
| surpressWaterNotification         | By default the leak event remains active until it is clear within the flo system, this option allows the plug-in to auto-clear when water is no longer detected. Default to <i>false</i>, this is an optional value. |
| showAuxSwitch              | Create a switch to control the control flo valve. Useful in some home automation.  Default to <i>false</i>, this is an optional value.                                    |
| offlineTimeLimit         | The Battery device periodically sends data to the Flo servers. This value determines how long before plug-in indicates the device is offline and a general fault is generated. Defaults to <i>4</i> hours.|
| showGPMPSIasLight         | Show the current Gallons Per Minute (GPM) and Water Pressure (PSI) value as lux sensors.   Default to <i>false</i> |
| pingRefresh         | Set value to force a refresh of Flo Cloud service. Should be used if device updates are not occurring for an extended period.  |
| excludedDevices         | Using the device serial number to suppress from HomeKit. This is an optional value. | |




An example configuration is below.

```javascript
...

"platforms": [
{
    "name": "Flo-by-Moen",
    "auth" : {
      "username": <username>,
      "password": <password>
    },
    "deviceRefresh": 90,
    "sleepRevertMinutes": 120,
    "platform": "Flo-by-Moen"
}
...
