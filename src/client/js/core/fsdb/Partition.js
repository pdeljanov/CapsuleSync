const assert = require('assert');
const debug = require('debug')('capsule.core.fsdb.partition');

class Partition {

    constructor(db, prefix, identifier){
        assert(identifier.indexOf('/') === -1, 'Partition identifiers may not contain a "/" character.');

        this._prefix = `${prefix}${identifier}`;
        this._header = `${this._prefix}\x00`;
        this._footer = `${this._prefix}\xFF`;
        this._db = db;
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
            const realKey = `${this._prefix}/${key}`;
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

    put(key, value, options){
        return new Promise((resolve, reject) => {
            const realKey = `${this._prefix}/${key}`;
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

    batch(ops, options){
        return new Promise((resolve, reject) => {
            const prefix = this._prefix;
            ops.forEach(function(operation){
                operation.key = `${prefix}/${operation.key}`;
            });

            this._db.batch(ops, (err, value) => {
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
            const realKey = `${this._prefix}/${key}`;
            this._db.del(realKey, (err, value) => {
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

Partition.Errors = {
    NO_HEADER:          'NoHeader',
    HEADER_MISMATCH:    'HeaderMistmach',
    NO_ENTRY:           'NoEntry'
};

module.exports = Partition;
