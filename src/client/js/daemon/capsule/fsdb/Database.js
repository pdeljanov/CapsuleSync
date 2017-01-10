'use strict';

const assert = require('assert');
const debug = require('debug')('capsule.core.fsdb.database');
const levelup = require('levelup');

const Partition = require('./Partition.js');
const IndexedPartition = require('./IndexedPartition.js');

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
                .then((db)      => { this._db       = db;      return this._getPartition('', '!'); })
                .then((section) => { this._version  = section; return this._getPartition('', '#'); })
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

    _getPartition(prefix, identifier){
        return new Promise((resolve, reject) => {
            var partition = new Partition(this._db, prefix, identifier);
            partition.prepare()
                .then(() => { resolve(partition); })
                .catch(reject);
        });
    }

    getPartition(identifier){
        return this._getPartition('//', identifier);
    }

    getIndexedPartition(identifier){
        return new Promise((resolve, reject) => {
            var partition = new IndexedPartition(this._db, '//', identifier);
            partition.prepare()
                .then(() => { resolve(partition); })
                .catch(reject);
        });
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
