const debug = require('debug')('Capsule.Sources.FileSystem.FileSystemSource');
const fs = require('original-fs');

const Source = require('../Source.js');
const IntegralScanner = require('./IntegralScanner.js');
const DeltaScanner = require('./DeltaScanner.js');
const { FilterSet } = require('../../FilterSet.js');

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

    applyFilter(filters) {
        this.filters = filters;
    }

    unload() {

    }

    enable() {

    }

    disable() {

    }

    integral(insert, commit, progress) {
        return new Promise((resolve, reject) => {
            const integral = new IntegralScanner(this._root, { followLinks: true, progressInterval: 500 });

            integral.progress = progress || (() => {});
            integral.insert = insert;
            integral.commit = commit;
            integral.filter = entry => this.filters.evaluate(entry);

            integral.run()
                .then(() => {
                    this.lastScan = Date();
                    resolve();
                })
                .catch(reject);
        });
    }

    delta(tree, upsert, remove, commit, progress) {
        return new Promise((resolve, reject) => {
            const delta = new DeltaScanner(this._root, tree, { followLinks: true, progressInterval: 500 });

            delta.progress = progress || (() => {});
            delta.upsert = upsert;
            delta.remove = remove;
            delta.commit = commit;
            delta.filter = entry => this.filters.evaluate(entry);

            delta.run()
                .then(() => {
                    this.lastScan = Date();
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
