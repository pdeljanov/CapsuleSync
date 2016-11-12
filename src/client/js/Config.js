'use strict';

const fs = require('fs');
const path = require('path');

const kDefaultDebounceTime = 100;
const kUserDataPath = app.getPath('userData');

class Config extends EventEmitter {

    constructor(name, debounceTimeMs){
        super();

        this._defaults = {};

        this._path = path.join(kUserDataPath, name);

        this._readSettings();
    }

    _writeSettings(){

    }

    _readSettings(path){
        debug('Reading settings file.');

        return new Promise((resolve, reject) => {

            fs.readFile(path, readFile);

            function readFile(err, data){
                if(!err){
                    this._settings = JSON.parse(data);
                }
                else if(err.code == 'ENOENT'){
                    this._settings = Object.
                }
                else {
                    reject();
                }
            };

        });
    }

    get(key){

    }

    set(key, value){

    }

    observe(key, cb){

    }



}

// capsule.config.get("user.name", function(err, name){ console.log(name); })
