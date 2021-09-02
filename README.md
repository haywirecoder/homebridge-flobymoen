
[![NPM Version](https://img.shields.io/npm/v/homebridge-flobymoen.svg)](https://www.npmjs.com/package/homebridge-flobymoen)
<p align="center">
<img src="https://github.com/haywirecoder/homebridge-flobymoen/blob/master/images/flo-by-moen-logo.jpg" width="150">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">


</p>


# Homebridge Plug-In for Flo by Moen (Beta)
An Homebridge plug-in to integrate the Flo by Moen 3 water system with HomeKit. This plug-in manages the Flo smart water kit monitoring and control devices via the Flo unofficial cloud API. Thanks to the aioflo Python3 library https://github.com/bachya/aioflo development team, this module uses logic gain from reviewing those libraries. 

## Limitation:
* This module works with Smart Water Shutoff and Water sensors only. It does not support the recently release Flo Smart Water Faucets.
* This module will poll for the status of the various compoments. No realtime notification is provided.
 
## TODO:

* Expose a button to start a "Health Check".
* Obtain homebridge vertification for module. 


## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Flo Moen username                     |
| password              | Flo Moen password                                                                  |
| deviceRefresh        | Polling interval to obtain status of Flo devices, provide in seconds. Default to <i>60</i> seconds. <b>Please note:</b> Small values may cause account lock or frequent API to errors.                                                                    |
| sleepRevertMinutes          | When Smart Water Shutoff Value is put into sleep what amount of time before it reverted back to previous mode (away or home).  Time value is provided in minutes (<i>120, 1440, 4320</i>). Default to <i>120</i> mins (2 hours).      
| enableValveControl         | Enable Homekit to control the Smart Water Shutoff valve. Default to <i>false</i>   |


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
    "enableValveControl": false,
    "deviceRefresh": 60,
    "sleepRevertMinutes": 120,
    "platform": "Flo-by-Moen"
}
...

```

