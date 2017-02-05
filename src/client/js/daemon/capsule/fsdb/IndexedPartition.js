'use strict';

const assert = require('assert');
const debug = require('debug')('Capsule.FSDB.IndexedPartition');

const async = require('async');
const xxhash = require('xxhash');
const { Buffer } = require('buffer');
const bytewise = require('bytewise');
const keyPath = require('key-path-helpers');
const through2 = require('through2');
const endStream = require('end-stream');

const Partition = require('./Partition.js');

function hash(value) {
    const XXHASH_SEED = 0xFEED1075;
    return xxhash.hash(Buffer.from(value), XXHASH_SEED, 'hex');
}

class IndexedPartition extends Partition {

    constructor(db, prefix, identifier) {
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

    _encodeIndexKey(key) {
        const encodedKey = bytewise.encode(key).toString('hex');
        return `${this._prefix}@${encodedKey}`;
    }

    _decodeIndexKey(encodedKey) {
        return bytewise.decode(new Buffer(encodedKey.split('@')[1], 'hex'));
    }


    _indexExists(indexName) {
        const idx = this._indicies.findIndex(index => index.name === indexName);
        return idx > -1;
    }

    _removeByName(indexName) {
        const idx = this._indicies.findIndex(index => index.name === indexName);

        if (idx > -1) {
            const deleted = this._indicies.splice(idx, 1);
            return deleted[0];
        }

        return null;
    }

    index(indexName, reduceFunc) {
        if (!this._indexExists(indexName)) {
            if (!reduceFunc) {
                reduceFunc = function (value){
                    return keyPath.getValueAtKeyPath(value, indexName);
                }
            }

            this._indicies.push({
                name:       indexName,
                reduceFunc: reduceFunc,
            });
        }
    }

    drop(indexKey) {
        return new Promise((resolve) => {
            // Attempt to remove the index from the indicies array. If it doesn't return
            // the removed index, don't do anything.
            if (this._removeByName(indexKey)) {
                const range = {
                    start: this._encodeIndexKey([indexKey, null]),
                    end:   this._encodeIndexKey([indexKey, undefined]),
                };

                this._db.deleteRange(range, function(err) {
                    resolve();
                });
            }
            // Otherwise, return immediately.
            else {
                resolve();
            }
        });
    }


    _inflateWithIndexOperations(operation, previousValue) {
        // The hash of the original key is used as a unique identifier for indicies.
        const keyHash = hash(operation.key);

        // The first item in the new operations array is the original operation.
        const operations = [operation];

        // For each index in this partition...
        this._indicies.forEach((index) => {
            // Remove the previously indexed value from from the index.
            if (previousValue) {
                const previousReducedValue = index.reduceFunc(previousValue);

                if (previousReducedValue !== undefined && previousReducedValue !== null) {
                    const previousEncodedIndexKey =
                        this._encodeIndexKey([index.name, previousReducedValue, keyHash]);
                    operations.push({ type: 'del', key: previousEncodedIndexKey });
                }
            }

            // If this is a put operation, create new index values.
            if (operation.type === 'put') {
                // Extract the indexable value from the new object.
                const reducedValue = index.reduceFunc(operation.value);

                // If the indexable value could be extracted from the object, add it to the index.
                if (reducedValue !== undefined && reducedValue !== null) {
                    const encodedKey = this._encodeIndexKey([index.name, reducedValue, keyHash]);
                    operations.push({ type: 'put', key: encodedKey, value: operation.key });
                }
            }
        }); // forEach Index

        return operations;
    }


    _inflateBatch(batch, cb) {

        return new Promise((resolve, reject) => {
            async.mapLimit(batch, 8, getPreviousValue.bind(this), (err, batches) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve([].concat.apply([], batches));
                }
            });
        });

        function getPreviousValue(operation, cb) {
            operation.key = this._encodeKey(operation.key);

            this._db.get(operation.key, (err, previousValue) => {
                const notFound = err && err.notFound;

                if (!err || notFound) {
                    const inflatedOperations = this._inflateWithIndexOperations(operation,
                        notFound ? null : previousValue);
                    cb(null, inflatedOperations);
                }
                else {
                    cb(err);
                }
            });
        }
    }

    _applyBatch(batch, options) {
        return new Promise((resolve, reject) => {
            this._inflateBatch(batch).then((inflatedBatch) => {
                this._db.batch(inflatedBatch, (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            })
            .catch(reject);
        });
    }

    put(key, value, options) {
        return this._applyBatch([{ type: 'put', key: key, value: value }], options);
    }

    batch(ops, options) {
        return this._applyBatch(ops, options);
    }

    del(key, options) {
        return this._applyBatch([{ type: 'del', key: key }], options);
    }

    delRange(options) {
        return new Promise((resolve) => {
            options.start = this._encodeKey(options.start);
            options.end = this._encodeKey(options.end);

            // Create a stream that will read all key-value pairs between the start and end of the
            // desired range.
            this._db.createReadStream(options).pipe(endStream((data, next) => {
                // Create a delete operation for each key.
                const operation = { type: 'del', key: data.key };

                // Inflate the operation into a batch with the required index operations.
                const operations = this._inflateWithIndexOperations(operation, data.value);

                // Submit batch operations to the database.
                this._db.batch(operations, next);
            }))
            .on('finish', resolve);
        });
    }

    createIndexStream(indexName, options) {
        options = options || null;

        options.start = options.start || [null];
        options.end = options.end || [undefined];

        options.start = this._encodeIndexKey([indexName].concat(options.start));
        options.end = this._encodeIndexKey([indexName].concat(options.end));

        return this._db.createReadStream(options).pipe(through2.obj((data, enc, cb) => {
            cb(null, { indexKey: this._decodeIndexKey(data.key)[1], dataKey: data.value });
        }));
    }

    getBy(indexName, indexValue) {
        return new Promise((resolve, reject) => {
            // By default, the range will just include the one value.
            let start = indexValue;
            let end = indexValue;

            // However, check for ranges in the object.
            if (typeof indexValue === 'object' && indexValue.start !== undefined && indexValue.end !== undefined) {
                start = indexValue.start;
                end = indexValue.end;
            }

            // Create options for the index stream.
            const options = {
                start: [start, null],
                end:   [end, undefined],
            };

            const entries = [];

            // Create an index stream to return the keys which contain the indexed value.
            this.createIndexStream(indexName, options).pipe(through2.obj((data, enc, cb) => {
                // Use the keys to get the values associated with the lookup.
                this._db.get(data.dataKey, (err, value) => {
                    cb(null, { key: this._decodeKey(data.dataKey), value: value });
                });
            }))
            .on('data', (data) => {
                entries.push(data);
            })
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                resolve(entries);
            });
        });
    }

}

module.exports = IndexedPartition;
