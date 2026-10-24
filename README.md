[![NPM Version](https://img.shields.io/npm/v/homebridge-flobymoen.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-flobymoen)

<p align="center">
<img src="https://github.com/haywirecoder/homebridge-flobymoen/blob/master/images/flo-by-moen-logo.jpg?raw=true" width="150" alt="Flo by Moen logo">
<img src="https://github.com/homebridge/branding/blob/latest/logos/homebridge-color-round-stylized.png?raw=true" width="150" alt="Homebridge logo">
</p>

# Homebridge Plug-in for Flo by Moen

A Homebridge plug-in that integrates the Flo by Moen smart water system with HomeKit. It monitors and controls Flo devices through the unofficial Flo cloud API.

Thanks to the developers of the [aioflo](https://github.com/bachya/aioflo) Python 3 library, whose code informed the logic used in this plug-in.

## Requirements and Limitations

* This plug-in works with the Smart Water Shutoff valve and water sensors only. Moen/Flo Smart Water Faucets are not supported.
* The plug-in polls the status of each device at the interval set in the configuration. Real-time notifications are not supported.
* You must have an active, working account that can log in to the [user.meetflo.com](https://user.meetflo.com) portal. Issues about access problems with the Moen portal or the Moen mobile app itself will be closed unanswered.

## Configuration Options

| Attribute | Required | Default | Description |
| --------- | -------- | ------- | ----------- |
| `username` | Yes | | Your Flo by Moen account username. |
| `password` | Yes | | Your Flo by Moen account password. |
| `useSSO` | No | `false` | Use the modern Moen SSO (OAuth2) login flow instead of the legacy login. Set this inside the `auth` object, alongside `username` and `password`. This option is still under testing. |
| `deviceRefresh` | No | `90` | Polling interval, in seconds, for retrieving the status of Flo devices. **Note:** very short intervals may cause account lockouts or frequent API errors. |
| `sleepRevertMinutes` | No | `120` | How long, in minutes, the Smart Water Shutoff valve stays in sleep mode before reverting to its previous mode (home or away). Options: `120` (2 hours), `1440`, or `4320`. |
| `showTemperatureAndHumidity` | No | `true` | Show temperature and humidity for water sensors in HomeKit. |
| `showHealthTestSwitch` | No | `false` | Show a Health Check switch in HomeKit. The switch turns on for 4 minutes while Flo runs the health check. |
| `disableCache` | No | `false` | Disable caching of the Flo access token. The plug-in will obtain a new access token at every startup, which may slightly slow startup. |
| `enableValveControl` | No | `false` | Allow HomeKit to open and close the Smart Water Shutoff valve. By default, the valve appears in HomeKit (for example, in the Home app) and its status is displayed and monitored, but it cannot be controlled unless this option is set to `true`. |
| `treatWarningAsCritical` | No | `false` | By default, Flo warnings are reported as alarm faults. Set to `true` to escalate Flo warnings to critical, which triggers a HomeKit alarm event. |
| `securityControlOption` | No | Enable Security Control | Controls whether the security control and notifications are displayed in HomeKit. If the security control is not displayed, the auxiliary switch is used to control the valve. |
| `showAuxSwitch` | No | `false` | Show an auxiliary water on/off switch. This is useful in Apple's Home app; other HomeKit apps, such as Eve, can expose the Flo valve for automation directly. |
| `offlineTimeLimit` | No | `4` | Battery-powered devices periodically send data to the Flo servers. This value sets how long, in hours, the plug-in waits without an update before it marks the device as offline and raises a general fault. |
| `excludedDevices` | No | | List of device serial numbers to hide from HomeKit. |

## Example Configuration

Add the following to the `platforms` array in your Homebridge `config.json`:

```json
{
  "name": "Flo-by-Moen",
  "platform": "Flo-by-Moen",
  "auth": {
    "username": "<username>",
    "password": "<password>"
  },
  "deviceRefresh": 90,
  "sleepRevertMinutes": 120
}
```
