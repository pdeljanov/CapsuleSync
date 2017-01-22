const debug = require('debug')('Capsule.Sources.FileSystemSource');
const fs = require('original-fs');

const EventEmitter = require('events');
const Traverse = require('../../fs/Traverse.js');
const Watch = require('../../fs/Watch.js');
const File = require('../File.js');
const Directory = require('../Directory.js');

class Source extends EventEmitter {

    constructor(id) {
        super();
        this._id = id;
        this.lastScan = null;
    }

    get id() {
        return this._id;
    }

    serialize(type, derivedData) {
        const serialized = {
            type: type,
            data: {
                id:       this._id,
                lastScan: this.lastScan,
                derived:  derivedData,
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
    }

    load() {
        return new Promise((resolve, reject) => {
            // Check to see if the directory exists.
            fs.stat(this._root, (err) => {
                if (err && err.code === 'ENOENT') {
                    reject(Source.ERRORS.DOES_NOT_EXIST);
                }
                else if (err && err.code === 'EACCES') {
                    reject(Source.ERRORS.ACCESS_DENIED);
                }
                else {
                    resolve();
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
            walker.on('file', (path, stat) => add(File.fromStat(path, stat)));
            walker.on('directory', (path, stat) => add(Directory.fromStat(path, stat)));
            walker.on('link', (path, stat) => add(File.fromStat(path, stat)));
            walker.traverse().then(resolve).catch(reject);
        });
    }

    serialize() {
        return super.serialize(FileSystemSource.TYPE_IDENTIFIER, { root: this._root });
    }

    static deserialize(serialized) {
        return new FileSystemSource(serialized.id, serialized.derived.root);
    }

}

FileSystemSource.TYPE_IDENTIFIER = 'fs-1';

module.exports = FileSystemSource;
