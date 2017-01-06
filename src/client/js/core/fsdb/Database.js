'use strict';

const assert = require('assert');
const debug = require('debug')('capsule.core.fsdb');
const levelup = require('levelup');

const index = require('./Index.js');

class Database {

    constructor(path){
        this._path = path;
        this._db = null;
    }

    open(path){

        // Open the database, and create or load the version, config, and indicies sections.
        return new Promise((resolve, reject) => {
            this._indicies = {};

            loadLevelDb(this._path)
                .then((db)      => { this._db       = db;      return this._getSection('', '!'); })
                .then((section) => { this._version  = section; return this._getSection('', '#'); })
                .then((section) => { this._config   = section; resolve(); })
                // .then(() => {
                //     this.version().then().catch()
                // })
                .catch(reject);
        });

        // Promisfy the LevelUP open function.
        function loadLevelDb(path){
            return new Promise((resolve, reject) => {

                const options = {
                    createIfMissing: true,
                    compression: true,
                    cacheSize: 8*1024*1024,
                    keyEncoding: 'utf8',
                    valueEncoding: 'json'
                };

                levelup(path, options, function (err, db){
                    if(err){
                        reject(err)
                    }
                    else {

                        // Install indexer.
                        index(db);

                        // Return database.
                        resolve(db);
                    }
                });

            });
        };

    }

    version(){
        return this._versionString;
    }

    config(key){
        assert(key.indexOf('/') === -1, 'Configuration keys may not contain a "/" character.');
        key = key.replace(/\./g, '/');
        return {
            get: function()      { return this._config.get(key);        }.bind(this),
            set: function(value) { return this._config.put(key, value); }.bind(this)
        };
    }

    /*
    index(key) {
        return {
            ensure: function(name) { return this._indicies.}
        }
    }
    */

    _getSection(prefix, identifier){
        return new Promise((resolve, reject) => {
            var section = new Section(this._db, prefix, identifier);
            section.prepare()
                .then(() => { resolve(section); })
                .catch(reject);
        });
    }

    getSection(identifier){
        return this._getSection('//', identifier);
    }



    /*
    addSource(){

    }

    removeSource(){

    }

    updateSource(){

    }

    getSources(){

    }

    getPathBySource(){

    }

    getPathByAddress(){

    }

    getPath(){

    }

    addPath(){

    }

    removePath(){

    }

    updatePath(){

    }
    */

}

Database.Version = {
    MAJOR:      1,
    MINOR:      0,
    REVISION:   0,
    STRING:     '1.0.0'
};

module.exports = Database;

class Section {

    constructor(db, prefix, identifier){
        assert(identifier.indexOf('/') === -1, 'Section identifiers may not contain a "/" character.');
        this._prefix = `${prefix}${identifier}/`;
        this._header = `${this._prefix}\x10`;
        this._footer = `${this._prefix}\xF0`;
        this._db = db;
    }

    _getHeader(){

        return new Promise((resolve, reject) => {
            // Get the header and footer. Ensure they match before returning the
            // header.
            this._db.get(this._header, (err, header) => {
                this._db.get(this._footer, (err, footer) => {

                    // Header and footer must match to be valid.
                    if(header && footer && header.id === footer.id){
                        resolve(header);
                    }
                    else if(header && footer && header.id !== footer.id){
                        debug(`Header mismatch.`);
                        reject(Section.Errors.HEADER_MISMATCH);
                    }
                    else {
                        reject(Section.Errors.NO_HEADER);
                    }
                });
            });
        });

    }

    _createHeader(type, id){
        return new Promise((resolve, reject) => {

            const ops = [
                { type: 'put', key: this._header, value: { type: type, id: id }},
                { type: 'put', key: this._footer, value: { id: id }}
            ]

            // Atomically insert the header and footer to the database.
            this._db.batch(ops, (err) => {
                if(!err){
                    resolve();
                }
                else {
                    debug(`Failed to create header with error: ${err.type}.`);
                    reject();
                }
            });

        });

    }

    prepare(){
        return new Promise((resolve, reject) => {

            // Attempt to get the header, if it fails, create it.
            this._getHeader()
                .then((header) => resolve())
                .catch((err) => {

                    // Generate a random id for the header.
                    const id = Math.floor(Math.random() * 0xFFFFFFFF);

                    // Create the header.
                    this._createHeader('section', id)
                        .then(resolve)
                        .catch(reject);
                });
        });
    }


    get(key){
        return new Promise((resolve, reject) => {
            const realKey = this._prefix + key;
            this._db.get(realKey, (err, value) => {
                if(!err){
                    resolve(value);
                }
                else {
                    reject(err);
                }
            });
        });
    }

    put(key, value){
        return new Promise((resolve, reject) => {
            const realKey = this._prefix + key;
            this._db.put(realKey, value, (err, value) => {
                if(!err){
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

}



Section.Errors = {
    NO_HEADER:          'NoHeader',
    HEADER_MISMATCH:    'HeaderMistmach',
    NO_ENTRY:           'NoEntry'
};

/*

//!/    ~ Version Info
//#/    ~ Configuration
//@/    ~ Indicies
//0/... ~ Source 0 Root
//1/... ~ Source 1 Root

!/\x10
!/version/major
!/version/minor
!/version/revision
!/\xf0
#/\x10
#/capsule/core/
#/capsule/core/uuid                       ->
#/capsule/core/evt_cnt                    -> 0
#/capsule/core/src_cnt                    -> 0
#/capsule/core/sections                   -> [ '@', '000' ]
#/capsule/crypto/
#/capsule/meta/
#/capsule/meta/name                       -> Desktop PC
#/capsule/meta/owner                      -> Philip Deljanov
#/\xf0
@/\x10
@/did/4560/a0ff5bc2                       -> //000/
@/did/4561/b5640bc2                       -> //000/home/
@/did/4562/a45bcdf7                       -> //000/home/philip
@/\xf0
//000\x10
//000/                                      -> { did: 4560, parent: null }
//000/home/                                 -> { did: 4561, parent: 4560 }
//000/home/philip                           -> { did: 4562, parent: 4561 }
//000/home/philip/Valse de Fantastica.flac  -> { fid: ghSb67Fa, size: 20468201 }
//000\xf0

*/

// “Make sure your requirements are testable, traceable, and verifiable”
