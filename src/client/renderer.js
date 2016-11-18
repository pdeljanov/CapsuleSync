const Config = require('./js/Config.js');



function setup(){

    var config = new Config("App.Settings");
    config.defaults({
        user: { name: "" },
        device: { id: "", prefix: "", name: "" },
        capsules: {  },
        devices: { },
    });

    window.capsule = {};
    window.capsule.config = config;
}

setup();
