const assert = require('assert');
const debug = require('debug')('capsule.core.fsdb.indexed_partition');

const xxhash = require('xxhashjs')
const bytewise = require('bytewise');
const keyPath = require('key-path-helpers');
const deleteRange = require('level-delete-range');
const through2 = require('through2');

const Partition = require('./Partition.js');

function encodeKey(prefix, key){
    const encodedKey = bytewise.encode(key).toString('hex');
    return `${prefix}@${encodedKey}`;
}

function decodeKey(encodedKey){
    return bytewise.decode(new Buffer(encodedKey.split('@')[1], 'hex'));
}

function hash(value){
    const XXHASH_SEED = 0xFEED1075;
    return xxhash.h32(value, XXHASH_SEED).toString(16);
}

class IndexedPartition extends Partition {

    constructor(db, prefix, identifier){
        super(db, prefix, identifier);

        this._indicies = [];
    }

/*
    prepare(){
        super.prepare().then((metadata) => {
            metadata = metadata || {};
            this._indicies = [];
        });
    }
*/

    rebuild(){

    }

    _indexExists(indexName){
        const idx = this._indicies.findIndex(function(index){
            return index.name === indexName;
        });
        return idx > -1;
    }

    _removeByName(indexName){
        const idx = this._indicies.findIndex(function(index){
            return index.name === indexName;
        });

        if(idx > -1){
            var deleted = this._indicies.splice(idx, 1);
            return deleted[0];
        }

        return null;
    }

    index(indexName, reduceFunc){
        if(!this._indexExists(indexName)){

            if(!reduceFunc){
                reduceFunc = function (value){
                    return keyPath.getValueAtKeyPath(value, indexName);
                }
            }

            this._indicies.push({
                name: indexName,
                reduceFunc: reduceFunc
            });
        }
    }

    drop(indexKey){
        return new Promise((resolve, reject) => {
            // Attempt to remove the index from the indicies array. If it doesn't return
            // the removed index, don't do anything.
            if(this._removeByName(indexKey)) {

                const range = {
                    start: encodeKey(this._prefix, [indexKey, null]),
                    end: encodeKey(this._prefix, [indexKey, undefined])
                };

                this._db.deleteRange(range, function(err){
                    resolve();
                });
            }
            // Otherwise, return immediately.
            else {
                resolve();
            }
        });

    }

    put(key, value, options){
        key = `${this._prefix}/${key}`;

        return new Promise((resolve, reject) => {

            // Attempt to get the previous value of the key we're inserting so that any indexed values may be removed.
            this._db.get(key, (err, previousValue) => {
                if(err && !err.notFound){
                    reject(err);
                }
                else {
                    const keyHash = hash(this._prefix, key);
                    const prefix = this._prefix;

                    var ops = [ { type: 'put', key: key, value: value }];

                    // For each index in this partition...
                    this._indicies.forEach(function(index){

                        // Remove the previously indexed value from from the index.
                        if(!err || !err.notFound){
                            const previousReducedValue = index.reduceFunc(previousValue)

                            if(previousReducedValue !== undefined && previousReducedValue !== null){
                                const previousEncodedIndexKey = encodeKey(prefix, [index.name, previousReducedValue, keyHash]);
                                ops.push({ type: 'del', key: previousEncodedIndexKey });
                            }
                        }

                        // Extract the indexable value from the new object.
                        const reducedValue = index.reduceFunc(value);

                        // If the indexable value could be extracted from the object, add it to the index.
                        if(reducedValue !== undefined && reducedValue !== null){
                            const encodedKey = encodeKey(prefix, [ index.name, reducedValue, keyHash ]);
                            ops.push({ type: 'put', key: encodedKey, value: key });
                        }

                    }); // forEach Index

                    this._db.batch(ops, function(err){
                        if(!err){
                            resolve();
                        }
                        else{
                            reject(err);
                        }
                    });
                }
            });

        });
    }

    batch(ops, options){

    }

    del(key){

    }

    createIndexStream(indexName, options){
        options = options || null;

        options.start = options.start || [ null ];
        options.end = options.end || [ undefined ];

        options.start = encodeKey(this._prefix, [indexName].concat(options.start));
        options.end = encodeKey(this._prefix, [indexName].concat(options.end));

        return this._db.createReadStream(options).pipe(through2.obj(function(data, enc, cb){
            cb(null, { indexKey: decodeKey(data.key)[1], dataKey: data.value });
        }));
    }

    getBy(indexName, value){
        return new Promise((resolve, reject) => {

            var entries = [];

            const options = {
                start: [value, null],
                end: [value, undefined]
            };

            // Create an index stream to return the keys which contain the indexed value.
            this.createIndexStream(indexName, options).pipe(through2.obj((data, enc, cb) => {

                // Use the keys to get the values associated with the lookup.
                this._db.get(data.dataKey, function(err, value){
                    cb(null, { key: data.dataKey, value: value });
                });

            }))
            .on('data', function(data){
                entries.push(data);
            })
            .on('error', function(err){
                reject(err);
            })
            .on('end', function(){
                resolve(entries);
            });
        });
    }

}

module.exports = IndexedPartition;
