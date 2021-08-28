
const config = require('./config.json');
const floengine = require('../flomain');
var flo = new floengine (console,config, "");



flo.init().then ( res_init => {
   flo.discoverDevices().then (res_discover => {
       console.log(flo.flo_devices);
    }) 
    
});



