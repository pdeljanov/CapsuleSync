'use strict';

const electron = require('electron')
const assert = require('assert');
const debug = require('debug')('capsule.core.capsule');
const path = require('path');
const EventEmitter = require('events')

const app = electron.app || electron.remote.app;

const Database = require('./db/Database.js');

module.exports =
class Capsule {

    constructor(identifier){
        const filename = `${identifier}.db`;
        const filepath = path.join(app.getPath('userData'), 'CapsuleSync', 'capsules', filename);
        this._db = new Database(filepath);
    }

    open(){
        return new Promise((resolve, reject) => {
            this._db.open()
                .then((isNew) => {

                    // If the database was newly created, populate some basic tags.
                    if(isNew){
                        this._db
                            .setTag('capsule.id', 'asFtY53V')
                            .then(()  => this._db.setTag('capsule.name', 'New Capsule'))
                            .then(()  => this._db.setTag('capsule.filters', null))
                            .then(()  => resolve())
                            .catch(() => reject());
                    }
                    else {
                        // Database existed previously and opened successfully.
                        resolve();
                    }
                })
                .catch((err) => {
                    // Dang..
                    reject();
                });
        });

    }

    get id(){
        return this._db.getTag('capsule.id');
    }

    get name(){
        return this._db.getTag('capsule.name');
    }

    set name(newName){
        return this._db.setTag('capsule.name', newName);
    }

    get sources(){

    }

    get subscribers(){

    }

    subscribe(){

    }
    unsubscribe(){

    }

    get filters(){

    }

    get database(){

    }
}

//
// <userid>:<deviceid>:<capsuleid>

class Device {

    constructor(){

    }

    get capsules() {

    }

}
