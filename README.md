[![NPM Version](https://img.shields.io/npm/v/homebridge-flobymoen.svg)](https://www.npmjs.com/package/homebridge-flobymoen)
<p align="center">
<img src="https://github.com/haywirecoder/homebridge-flobymoen/blob/master/images/flo-by-moen-logo.jpg" width="150">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">


</p>


# Homebridge Plug-In for Flo by Moen (Beta)
An Homebridge plug-in to integrate the Flo by Moen 3 water system with HomeKit. This plug-in manages the Flo smart water kit system. It monitors and control devices via the Flo unofficial cloud API. Thanks to the aioflo Python3 library https://github.com/bachya/aioflo development team, this module uses the logic gain from reviewing those libraries/code. The module is a activity being worked on and code is being corrected and new features are being added constantly.

## Limitation:
* This module works with Smart Water Shutoff and Water sensors only. It does not support the recently release Flo Smart Water Faucets.
* This module will poll for the status of the various compoments. No realtime notification is provided.
 
## TODO:

* Expose a switch to start a "Health Check".
* Obtain homebridge vertification for module. 

## Know Issues:
* At times the plug-in reports a 502 error. This is a communication error with the Flo server, an occaisional error will not effect operations of the plug-in.

## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Flo Moen username                     |
| password              | Flo Moen password                                                                  |
| deviceRefresh        | Polling interval to obtain status of Flo devices, provide in seconds. Default to <i>90</i> seconds. <b>Please note:</b> Small values may cause account lock or frequent API to errors.                                                                    |
| sleepRevertMinutes          | When Smart Water Shutoff Value is put into sleep what amount of time before it reverted back to previous mode (away or home).  Time value is provided in minutes (<i>120, 1440, 4320</i>). Default to <i>120</i> mins (2 hours).     
| showTemperatureAndHumidity| Display Temperature and Humidity for Water Sensors in Homekit.   Default to <i>true</i>                                                        |
| showHealthTestSwitch | Display Health Check switch in Homekit.   <b> Do not use not yet implemented.</b>                                                        |
| enableValveControl         | Enable Homekit to control the Smart Water Shutoff valve. The valve in Homekit will display (monitor) the status of valve, but will not be able control it unless this value is set to true. Default to <i>false</i>   |


Example configuration is below.

```javascript
...

"platforms": [
{
    "name": "Flo-by-Moen",
    "auth" : {
      "username": <username>,
      "password": <password>
    },
    "deviceRefresh": 60,
    "sleepRevertMinutes": 120,
    "platform": "Flo-by-Moen"
}
...

```

