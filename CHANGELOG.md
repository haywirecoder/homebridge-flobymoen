All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).
 Change Log
  Change Log
# v1.0.16 (2024-09-23)
## Break fixes
* Correct code fault in Ping function

# v1.0.15 (2024-09-14)
## Break fixes
* Additional fixes to auxiliary shutoff switch (#19)

# Change Log
# v1.0.14 (2024-08-09)
## Break fixes
* Fix config file for clearOnNoLead.

# v1.0.13 (2024-07-27)
## Break fixes
* Fix typo on device information for water sensors
* Fix issue with code not properly reading configuration associated with enhancement (#14). Please note this resulted in changing this attribute from surpressWaterNotification to clearOnNoLeak. Please refer to updated readme

# v1.0.12 (2024-07-25)
## Break fixes
* Fix auxiliary shutoff switch and updated document to reflect only needed for the Home app automation (#13)
* Fix optional parameter for Temperature and Humidity for water sensor (#14)


# v1.0.11 (2024-06-11)
## Break fixes
* Disabled Flo device debug logging.

# v1.0.10 (2024-06-11)
### Enhancements
* Create an option to clear of leak sensor when no water is detected (#14 )
* Add an optional switch to control the water valve, for automation in Apple Home applications (#12).
* Expose the current Gallons Per Minute (GPM) and Water Pressure (PSI) values as lux sensors (#9)
* Dependency updates

# v1.0.9 (2023-07-28)
### Enhancements
* Generate a tamper event when the smart valve has a problem.
* General enhancement for valve functionality and state information.

# v1.0.8 (2023-07-15)
### Enhancements
* Create option when to log 502 errors.

### Break fixes
* Fix general fault logic for all devices.

# v1.0.7 (2023-02-10)
### Enhancements
* Generate general fault in homekit when battery device hasn't communicated with the service for pre-determine time.

### Break fixes
* Spelling and Typo fix.

## v1.0.6 (2022-08-22)
### Break fixes
* Fix incorrect attribute for SystemCurrentState characteristics.

## v1.0.5 (2022-08-22)
### Changes
* Dependency updates

### Break fixes
* Fix incorrect attribute for SystemTargetState characteristics.


## v1.0.4 (2021-12-17)
### Break fixes
* Homekit device updated frequency not algin with flo system.
* package setting resulted in warning messages appearing after node upgrade.

### Enhancements
* remove -d option, using native homebridge debug flags.

## v1.0.3 (2021-11-02)
### Break fixes
* Fix bug which crashes plug-in if proper values are not provided.
* Fix Plug-in defaulting polling to 60 sec rather than 90 sec.

## v1.0.2 (2021-10-26)
### Break fixes
* Fix bug associated with correction of (#5) - "EISDIR: illegal operation on a directory...". (#6).

### Enhancements
* Add support to disable local caching of Flo access token. 

## v1.0.1 (2021-10-25)
### Break fixes
* Fix bug where plug-in was writing to incorrect location (#5).

### Enhancements
* Add support for battery level for water leak sensors.

## v1.0.0 (2021-09-25)
### Changes
* Minor configuration changes.
* Add support to run health check.

## v0.0.3 (2021-04-09)
### Break fixes
* Fix water sensor temperature being displayed incorrectly in Homekit.
* Fix "waiting" for Flo valve control.

### Changes
* Add support to turn on and off Smart shutoff valve control.
* Add option to hide the water sensor temperature and humidity information from Homekit. Thus, reducing the number of controls within Homekit.
* Add ability to exclude Flo devices from Homekit. 

## v0.0.2 (2021-30-08)
### Initial release for testing and validation.
