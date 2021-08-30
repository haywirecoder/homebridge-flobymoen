
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Plugin Flo by Moen (Beta)
An Homebridge plugin to integrate the Flo by Moen 3 water system with HomeKit. This plugin manages the Flo smart water kit monitoring and control devices via the Flo unofficial cloud API. This module leverage work done by aioflo Python3 library https://github.com/bachya/aioflo development team. 

## Limitation:
* This module works with Smart Water Shutoff and Water sensors only. It does not support the recently release Flo Smart Water Faucets.
* This module will poll for the status of the various compoments. No realtime notification is provided.
 
## TODO:
* Add support for turn-off Smart Water Shutoff valve using the valve control.
* Using the current state to return for revert back for sleep mode.
* Expose compomnent to start a "Health Check".
* Obtain homebridge vertification for module.  
* Add ability to excluded devices.


## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Flo Moen username                     |
| password              | Flo Moen password                                                                  |
| deviceRefresh        | Polling interval to obtain status of Flo devices, provide in seconds. Default to 1 mins. Please note: Small values may cause account lock or frequent API to errors.                                                                    |
| sleepRevertMinutes          | When Smart Water Shutoff Value is put into sleep what amount of time before it reverted back to previous mode (away or home).  time provided in minutes. Default to 120 mins (2 hours).                                                                          |


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

