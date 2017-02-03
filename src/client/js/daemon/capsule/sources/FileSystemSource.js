const debug = require('debug')('Capsule.Sources.FileSystemSource');
const fs = require('original-fs');
const async = require('async');

const EventEmitter = require('events');
const Traverse = require('../../fs/BatchingTraverse.js');
const Watch = require('../../fs/Watch.js');
const File = require('../File.js');
const Directory = require('../Directory.js');
const PathTools = require('../../fs/PathTools.js');
const { FilterSet } = require('../FilterSet.js');

function batch(arr, n, func, done) {
    let i = 0;
    function doNext() {
        if (i * n < arr.length) {
            setImmediate(() => {
                const s = i * n;
                const e = Math.min((s + n), arr.length);
                func(arr.slice(s, e), doNext);
                i += 1;
            });
        }
        else {
            done();
        }
    }

    if (arr.length > n) {
        doNext();
    }
    else {
        func(arr, done);
    }
}

class FileSystemObject {
    static deserialize(path, serialization) {
        if (serialization.t === 'f') {
            return File.makeFromSerialization(path, serialization);
        }
        else if (serialization.t === 'd') {
            return Directory.makeFromSerialization(path, serialization);
        }
        return null;
    }
}

class Source extends EventEmitter {

    constructor(id) {
        super();
        this._id = id;
    }

    get id() {
        return this._id;
    }

    serialize(type, derivedData) {
        const serialized = {
            type: type,
            data: {
                id:      this._id,
                derived: derivedData,
            },
        };
        return serialized;
    }
}

Source.ERRORS = {
    ACCESS_DENIED:  'AccessDenied',
    DOES_NOT_EXIST: 'DoesNotExist',
};

class FileSystemSource extends Source {

    constructor(id, root) {
        super(id);

        this._root = root;
        this.filters = FilterSet.empty();
        this.lastScan = null;
    }

    load() {
        debug(`[${this._id}] Loading FileSystemSource`);

        return new Promise((resolve, reject) => {
            debug(`[${this._id}] Checking ${this._root} exists...`);

            // Check to see if the directory exists.
            fs.stat(this._root, (err) => {
                // Error if the root does not exist.
                if (err && err.code === 'ENOENT') {
                    debug(`[${this._id}] Source path does not exist.`);
                    reject(Source.ERRORS.DOES_NOT_EXIST);
                }
                // Error if the permissions prevent access to the root.
                else if (err && err.code === 'EACCES') {
                    debug(`[${this._id}] Access denied to source path.`);
                    reject(Source.ERRORS.ACCESS_DENIED);
                }
                // Loaded successfully.
                else {
                    debug(`[${this._id}] Loaded successfully!`);
                    // Complete the load.
                    resolve();
                    // Check if there was an initial scan in a new thread to allow the load thread
                    // to complete.
                    process.nextTick(() => {
                        if (this.lastScan === null) {
                            debug(`[${this._id}] Source has never been scanned before.`);
                            this.emit('initialScan');
                        }
                        else {
                            debug(`[${this._id}] Source was last scanned ${this.lastScan}.`);
                            this.emit('deltaScan');
                        }
                    });
                }
            });
        });
    }

    applyFilter(filterSet) {
        this.filters = filterSet;
    }

    unload() {

    }

    enable() {

    }

    disable() {

    }

    traverse(add, commit) {
        return new Promise((resolve, reject) => {
            const walker = new Traverse(this._root, { followLinks: true, progressInterval: 500 });

            walker.directory = (dirPath, dirStat, contents, depth, next) => {
                // Add directory.
                add(Directory.makeFromStat(PathTools.stripRoot(dirPath, this._root), dirStat));

                // Iterate through each item in the directory in asynchronous batches.
                batch(contents, 32, (items, cb) => {
                    items.forEach((item) => {
                        const relativePath = PathTools.stripRoot(item.path, this._root);
                        const stat = item.stat;

                        if (stat.isFile()) {
                            const file = File.makeFromStat(relativePath, stat);
                            if (this.filters.evaluate(file)) {
                                add(file);
                            }
                        }
                        // else if (stat.isSymbolicLink()) {
                        //    add(File.makeFromStat(relativePath, stat));
                        // }
                    });
                    cb();
                },
                () => {
                    // Issue a commit before continuing on the traversal.
                    commit().then(next);
                });
            };

            walker.on('progress', (p) => {
                debug(`[${this._id}] Scaning... Files: ${p.files}, Directories: ${p.directories}, Size: ${p.totalSize}, Time: ${p.duration}`);
            });

            walker.traverse().then(() => {
                this.lastScan = Date();

                const s = walker.stats();
                const speed = Math.floor((1000 * s.files) / s.duration);
                debug(`[${this._id}] Scaning complete. Files: ${s.files}, Directories: ${s.directories}, Size: ${s.totalSize}, Time: ${s.duration}, Avg. Speed: ${speed} files/s`);
                resolve();
            }).catch(reject);
        });
    }

    delta(tree, upsert, remove, commit) {
        return new Promise((resolve, reject) => {
            tree.scanSubTree('', (data, next) => {
                const path = PathTools.appendRoot(this._root, data.key);
                const item = FileSystemObject.deserialize(path, data.value);
                // Get the stat information for the item being scanned.
                fs.lstat(path, (err, stat) => {
                    if (err) {
                        // File deletion.
                        if (err.code === 'ENOENT') {
                            debug(`[${this._id}] File removal at: ${path}`);
                        }
                        else {
                            debug(`[${this._id}] Unknown error at: ${path}`);
                        }
                    }
                    else if (!err) {
                        if (stat.isFile()) { // && (item.type === File.TYPE)
                            // File check.
                            if (stat.size !== item.blob.byteLength ||
                                stat.mtime.getTime() !== item.blob.modificationTime.getTime() ||
                                stat.ctime.getTime() !== item.blob.creationTime.getTime() ||
                                stat.uid !== item.blob.uid ||
                                stat.gid !== item.blob.gid ||
                                stat.mode !== item.blob.mode ||
                                stat.ino !== item.blob.inode) {
                                debug(`[${this._id}] File difference for: ${path}.`);
                            }
                        }
                        else if (stat.isDirectory()) { // && (item.type === Directory.TYPE)
                            if (stat.mtime.getTime() !== item.modificationTime.getTime()) {
                                debug(`[${this._id}] Directory scan required at: ${path}.`);
                            }
                        }
                        else if (stat.isSymbolicLink()) {
                            // Do nothing fo now.
                        }
                        else {
                            debug(`[${this._id}] Type mismatch for: ${path}.`);
                        }
                    }
                    next();
                });
            })
            .then(() => {
                this.lastScan = Date();
                debug(`[${this._id}] Delta scan complete.`);
                resolve();
            })
            .catch(reject);
        });
    }

    serialize() {
        return super.serialize(FileSystemSource.TYPE_IDENTIFIER, {
            root:     this._root,
            lastScan: this.lastScan || null,
        });
    }

    static deserialize(serialized) {
        const source = new FileSystemSource(serialized.id, serialized.derived.root);
        source.lastScan = serialized.derived.lastScan || null;
        return source;
    }

}

FileSystemSource.TYPE_IDENTIFIER = 'fs-1';

module.exports = FileSystemSource;
