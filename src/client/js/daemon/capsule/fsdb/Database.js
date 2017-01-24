'use strict';

const assert = require('assert');
const debug = require('debug')('Capsule.FSDB.Database');
const levelup = require('levelup');
const levelupDeleteRange = require('level-delete-range');

const Partition = require('./Partition.js');
const IndexedPartition = require('./IndexedPartition.js');

class Database {

    constructor(path) {
        this._path = path;
        this._db = null;
    }

    open() {
        // Open the database, and create or load the version, config, and indicies sections.
        return new Promise((resolve, reject) => {
            loadLevelDb(this._path)
                .then((db) => { this._db = db; return this._getPartition('', '!'); })
                .then((section) => { this._version = section; return this._getPartition('', '#'); })
                .then((section) => { this._config = section; resolve(); })
                .catch(reject);
        });

        // Promisfy the LevelUP open function.
        function loadLevelDb(path) {
            return new Promise((resolve, reject) => {
                // LevelDB options. Set accordingly.
                const options = {
                    createIfMissing: true,
                    compression:     true,
                    cacheSize:       8 * 1024 * 1024,
                    keyEncoding:     'utf8',
                    valueEncoding:   'json',
                };

                // Instantiate the LevelDB instance.
                levelup(path, options, function (err, db) {
                    if (!err) {
                        // Install delRange function.
                        if (!db.delRange) {
                            db.delRange = levelupDeleteRange.bind(null, db);
                        }

                        resolve(db);
                    }
                    else {
                        reject(err)
                    }
                });
            });
        }
    }

    version() {
        return this._versionString;
    }

    config(key) {
        assert(key.indexOf('/') === -1, 'Configuration keys may not contain a "/" character.');
        key = key.replace(/\./g, '/');
        return {
            get: function () { return this._config.get(key); }.bind(this),
            set: function (value) { return this._config.put(key, value); }.bind(this),
        };
    }

    _getPartition(prefix, identifier) {
        return new Promise((resolve, reject) => {
            const partition = new Partition(this._db, prefix, identifier);
            partition.prepare()
                .then(() => { resolve(partition); })
                .catch(reject);
        });
    }

    getPartition(identifier) {
        return this._getPartition('//', identifier);
    }

    getIndexedPartition(identifier) {
        return new Promise((resolve, reject) => {
            const partition = new IndexedPartition(this._db, '//', identifier);
            partition.prepare()
                .then(() => { resolve(partition); })
                .catch(reject);
        });
    }

}

Database.Version = {
    MAJOR:    1,
    MINOR:    0,
    REVISION: 0,
    STRING:   '1.0.0',
};

module.exports = Database;
