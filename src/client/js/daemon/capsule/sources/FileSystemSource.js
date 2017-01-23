const debug = require('debug')('Capsule.Sources.FileSystemSource');
const fs = require('original-fs');

const EventEmitter = require('events');
const Traverse = require('../../fs/Traverse.js');
const Watch = require('../../fs/Watch.js');
const File = require('../File.js');
const Directory = require('../Directory.js');
const PathTools = require('../../fs/PathTools.js');

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
                    });
                }
            });
        });
    }

    unload() {

    }

    enable() {

    }

    disable() {

    }

    traverse(add) {

        return new Promise((resolve, reject) => {
            const walker = new Traverse(this._root);

            walker.on('file', (path, stat) => {
                const relativePath = PathTools.stripRoot(path, this._root);
                add(File.fromStat(relativePath, stat));
            });

            walker.on('directory', (path, stat) => {
                const relativePath = PathTools.stripRoot(path, this._root);
                add(Directory.fromStat(relativePath, stat));
            });

            walker.on('link', (path, stat) => {
                const relativePath = PathTools.stripRoot(path, this._root);
                add(File.fromStat(relativePath, stat));
            });

            walker.on('progress', (p) => {
                debug(`[${this._id}] Scaning... Files: ${p.files}, Directories: ${p.directories}, Size: ${p.totalSize}, Time: ${p.duration}`);
            });

            walker.traverse().then(resolve).catch(reject);
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
