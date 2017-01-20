'use strict';

const assert = require('assert');
const debug = require('debug')('Capsule.FSDB.Partition');

class Partition {

    constructor(db, prefix, identifier){
        assert(identifier.indexOf('/') === -1, 'Partition identifiers may not contain a "/" character.');

        this._prefix = `${prefix}${identifier}`;
        this._header = `${this._prefix}\x00`;
        this._footer = `${this._prefix}\xFF`;
        this._db = db;
    }

    _encodeKey(key){
        return `${this._prefix}:${key}`;
    }

    _decodeKey(key){
        return key.split(':')[1];
    }

    _getHeader(){

        return new Promise((resolve, reject) => {
            // Get the header and footer. Ensure they match before returning the
            // header.
            this._db.get(this._header, (err, header) => {
                this._db.get(this._footer, (err, footer) => {

                    // Header and footer must match to be valid.
                    if(header && footer){
                        resolve(header);
                    }
                    else {
                        reject(Partition.Errors.NO_HEADER);
                    }
                });
            });
        });

    }

    _createHeader(type, metadata){
        return new Promise((resolve, reject) => {

            const ops = [
                { type: 'put', key: this._header, value: { type: type, data: metadata }},
                { type: 'put', key: this._footer, value: { }}
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
                .then(resolve)
                .catch((err) => {

                    // Create the header.
                    this._createHeader('partition')
                        .then(resolve)
                        .catch(reject);
                });
        });
    }

    get(key, options){
        return new Promise((resolve, reject) => {
            this._db.get(this._encodeKey(key), (err, value) => {
                if(!err){
                    resolve(value);
                }
                else {
                    reject(err);
                }
            });
        });
    }

    put(key, value, options){
        return new Promise((resolve, reject) => {
            this._db.put(this._encodeKey(key), value, (err, value) => {
                if(!err){
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

    batch(operations, options){
        return new Promise((resolve, reject) => {

            operations.forEach((operation) => { operation.key = this._encodeKey(opeation.key); });

            this._db.batch(operations, (err, value) => {
                if(!err){
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

    del(key, options){
        return new Promise((resolve, reject) => {
            this._db.del(this._encodeKey(key), (err, value) => {
                if(!err){
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

    delRange(options){
        return new Promise((resolve, reject) => {
            options.start = this._encodeKey(options.start); + '\x00';
            options.end = this._encodeKey(options.end) + '\xFF';
            this._db.delRange(options, function(err){
                if(!err){
                    resolve();
                }
                else {
                    reject();
                }
            });
        });
    }

}

Partition.Errors = {
    NO_HEADER:          'NoHeader',
    NO_ENTRY:           'NoEntry'
};

module.exports = Partition;
