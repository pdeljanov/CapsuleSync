const xxhash = require('xxhashjs')
const bytewise = require('bytewise');
const hooks = require('level-hooks');
const deleteRange = require('level-delete-range');

function encodeKey(key){
    return '@/' + bytewise.encode(key).toString('hex');
}

function decodeKey(encodedKey){
    return bytewise.decode(new Buffer(encodedKey.substr(2), 'hex'));
}

function hash(value){
    const XXHASH_SEED = 0xFEED1075;
    return xxhash(value, XXHASH_SEED);
}

// Options: { start, end, reduceFunc }
function ensureIndex(db, indexName){
    // Get all args, removing db and indexName arguments.
    var args = [].slice.call(arguments).slice(2);

    var options = {};
    var cb = null;

    if(args.length > 1){
        options = args.shift();
    }

    if(args.length > 0) {
        cb = args.shift();
    }

    args = [];

    // Use default reduce function if none is provided.
    if(!options.reduceFunc){
        options.reduceFunc = function(value){
            // TODO: Use key-path tools to resolve this.
            return value[indexName];
        }
    }

    if(!db.indicies[indexName]){

        db.indicies[indexName] = {
            name: indexName,
            options: options
        };

        let indexableRange = {
            start: options.start || '@/\xff',
            end: options.end || '\xff'
        };

        db.hooks.pre(indexableRange, handleChange.bind(this));
    }

    // Build index.
    db.createReadStream(indexableRange)
        .on('data', function(data){
            const reducedValue = options.reduceFunc(data.value);

            if(reducedValue){
                pause();
                const encodedKey = encodeKey([ indexName, reducedValue, hash(data.key) ]);
                db.put(encodedKey, data.key, function(){
                    resume();
                });
            }
        })
        .end(function(){
            cb && cb();
        });

    handleChange(change, add, batch){
        const value = change.value[indexKey];

        // Check the index to see if the key previously had an indexed entry.
        db.get(change.key, function(err, oldValue){

            // Remove the old, previously indexed value if it existed.
            if(!err){
                const oldEncodedKey = encodeKey([indexName, options.reduceFunc(oldValue), hash(change.key) ]);
                add({ type: 'del', key: oldEncodedKey });
            }

            // Add the value to the index.
            if(change.type === 'put'){

                // Extract the value from the indexable object.
                const reducedValue = options.reduceFunc(value);

                // If the indexable value could be extracted from the object, add it to the index.
                if(reducedValue){
                    const encodedKey = encodeKey([ indexName, reducedValue, hash(change.key) ]);
                    add({ type: 'put', key: encodedKey, value: change.key })
                }
            }
        });
    } // handleChange

}

function dropIndex(db, indexName, cb){
    if(db.indicies[indexName]) {

        const range = {
            start: encodeKey([indexName, null]),
            end: encodeKey([indexName, undefined]),
        };

        db.deleteRange(range, function(err){
            delete db.indicies[indexName];
            cb && cb();
        });

    }
    else {
        cb && cb();
    }
}

function createIndexStream(db, indexName, options){
    options = options || null;

    options.start = options.start || [ null ];
    options.end = options.end || [ undefined ];

    options.start = encodeKey([indexName, options.start]);
    options.end = encodeKey([indexName, options.end]);

    return db.createReadStream(options).pipe(through2.obj(data, enc, cb){
        cb(null, { indexKey: decodeKey(data.key)[1], dataKey: data.value });
    });

}

function getBy(db, indexName, value, cb){
    var entries = [];
    db.createIndexStream(indexName, options).pipe(through2(data, enc, cb){
        db.get(data.dataKey, function(err, value){
            cb(null, { key: data.dataKey, value: value });
        });
    })
    .on('data', function(data){
        entries.push(data);
    })
    .on('error', function(err){
        cb && cb(err);
    })
    .on('end', function(){
        cb && cb(null, entries);
    });
}

module.exports =
function indexer(db){
    hooks(db);

    if(!db.deleteRange){
        db.deleteRange = function(options, cb){
            deleteRange(db, cb);
        }
    }

    if(!db.ensureIndex){
        db.ensureIndex = ensureIndex.bind(null, db);
    }

    if(!db.dropIndex){
        db.dropIndex = dropIndex.bind(null, db);
    }

    if(!db.getBy){
        db.getBy = getBy.bind(null, db);
    }

    if(!db.createIndexStream){
        db.createIndexStream = createIndexStream.bind(null, db);
    }

    if(!db.indicies){
        db.indicies = {};
    }

    return db;
}
