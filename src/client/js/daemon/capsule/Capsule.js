'use strict';

const electron = require('electron')
const assert = require('assert');
const debug = require('debug')('capsule.core.capsule');
const path = require('path');
const EventEmitter = require('events')

const app = electron.app || electron.remote.app;

const Database = require('./fsdb/Database.js');

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
                .then(() => this._db.config('capsule.core.id').set('27xmWDKB'))
                .then(() => this._db.config('capsule.core.name').set('Desktop PC'))
                .then(() => this._db.config('capsule.core.filters').set(null))
                .then(() => this._db.config('capsule.core.sources').set([]))
                .then(() => this._db.config('capsule.user.id').set('8jfju5UhuR0Lc8mS4hUJbXL6ZUPKH4Qagjq878az32yNq8yB8SDPGzWJ4DOPOeL'))
                .then(() => this._db.config('capsule.user.name').set('Philip Deljanov'))
                .then(() => { resolve(); })
                .catch((err) => {
                    // Dang..
                    reject();
                });
        });

    }

    get id(){
        return this._db.config('capsule.core.id').get();
    }

    get name(){
        return this._db.config('capsule.core.name').get();
    }

    set name(newName){
        return this._db.config('capsule.core.name').set(newName);
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
