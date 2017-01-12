'use strict';

const assert = require('assert');
const debug = require('debug')('Daemon');

class Daemon {

    /*
        Startup:
            Start (frontend) bridge
            Load Capsules
                Begin full rescan
            Start Protocol-01 server
            Start pairing listener
            Start broadcast manager
                MDNS Broadcaster
                Fallback Broadcaster

    */

    constructor(){
        //loadModule('bridge', './bridge/Module.js');
        //loadModule('capsules', './capsule/Module.js');
        //loadModule('protocol', './net/protocol/Module.js');
        //loadModule('discovery', './net/discovery/Module.js');
        loadModule('broadcast', 'net/broadcast/Module.js');
    }

    loadModule(name, path){
        if(this._modules){
            this._modules = {};
        }

        if(!this._modules[name]){
            debug(`Loading module ${name}.`);
            this._modules[name] = {
                make: require(path).make,
                instance: null
            };
        }
        else {
            debug(`Module ${name} already loaded.`);
        }
    }

    start(){
        modules = [];

        for(let key in this._modules){
            let module = this._modules[key];
            module.instance = module.make();
            modules.push(module.instance.start());
        }

        return Promise.all(modules);
    }


}
