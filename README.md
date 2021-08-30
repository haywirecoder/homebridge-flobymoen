
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Plugin Flo by Moen (In-Development)
An Homebridge plugin to integrate the Flo by Moen 3 water system with HomeKit. This plug-in manages the Flo smart water kit monitoring and control devices via the Flo unofficial cloud API. It leverage work done by aioflo Python3 library https://github.com/bachya/aioflo. This module use This module interact with the Smart Water Shutoff and Water sensors only. It does not support the recently release Flo Smart Water Faucets. 
## Configuration options

| Attributes        | Description                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| username              | Flo username                     |
| password              | Flo password                                                                  |
| deviceRefresh        | Polling interval to obtain status of Flo devices. Default to 1 mins. Please note: Small values may cause account lock or frequent API to errors.                                                                    |
| sleepRevertMinutes          | When Smart Water Shutoff Value is put into sleep what amount of time before it reverted back to previous mode (away or home).                                                                           |


Example configuration is below.

```javascript
...

"platforms": [
{
    "name": "Flo-by-Moen",
    "auth" : {
      "username": "<username>",
      "password": "<password>"
    }
    "deviceRefresh": 60,
    "sleepRevertMinutes": 120,
    "platform": "Flo-by-Moen"
}
...

```

