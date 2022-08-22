# Change Log

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).
## v1.0.5 (2022-08-22)
### Changes
* Dependency updates

### Break fixes
* Fix incorrect attribute for SystemTargetState characteristics.


## v1.0.4 (2021-12-17)
### Break fixes
* Homekit device updated frequecy not algin with flo system.
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
* Add option to hide the water sensor temperature and humity information from Homekit. Thus, reducing the number of controls within Homekit.
* Add ablity to exclude Flo devices from Homekit. 

## v0.0.2 (2021-30-08)
### Initial release for testing and validation.
