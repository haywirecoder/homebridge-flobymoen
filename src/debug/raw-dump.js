var config = require('./config.json');
var floclass = require('./flomain.js');
var flo = new floclass (console,config);



flo.init().then ( res_init => {
   flo.discoverDevices().then (res_discover => {
        flo.refreshAllDevices();
    }) 
    
});


flo.on('deviceupdate', function(data) {
  
	console.log("-------- Device Update ---------");
	console.log("ID: ", data.id);
	console.log("...");
})
