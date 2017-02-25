const BlobEntry = require('./BlobEntry.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class DirectoryEntry {

    constructor(path, blob) {
        this._path = path;
        this._blob = blob || null;
        this._id = 0;
        this._displayName = null;
        this._directoryName = '';
        this._modVector = {};
        this._syncVector = {};
    }

    get path() {
        return this._path;
    }

    get type() {
        return DirectoryEntry.TYPE;
    }

    get id() {
        return this._id;
    }

    get mediaType() {
        return this._mediaType;
    }

    get displayName() {
        if (this._displayName) {
            return this._displayName;
        }
        return this._directoryName;
    }

    get directoryName() {
        return this._directoryName;
    }

    get blob() {
        return this._blob;
    }

    get available() {
        return this._blob !== null;
    }

    get modificationVector() {
        return this._modVector;
    }

    get syncronizationVector() {
        return this._syncVector;
    }

    modify(time) {
        this._modVector = time;
    }

    synchronize(time) {
        this._syncVector = time;
    }

    isIdentical(stat) {
        if (this.available && this.blob.isIdentical(stat)) {
            return true;
        }
        return false;
    }

    update(stat) {
        if (this._blob) {
            this._blob.update(stat);
        }
    }

    serialize() {
        return {
            t:  'd',
            id: this._id,
            dn: this._displayName,
            fn: this._directoryName,
            mv: this._modVector,
            sv: this._syncVector,
            b:  this._blob ? this._blob.serialize() : null,
            a:  this._blob !== null,
        };
    }

    static deserialize(path, serialization) {
        const blob = serialization.b ? BlobEntry.deserialize(serialization.b) : null;
        const entry = new DirectoryEntry(path, blob);
        entry._id = serialization.id;
        entry._displayName = serialization.dn;
        entry._directoryName = serialization.fn;
        entry._modVector = serialization.mv;
        entry._syncVector = serialization.sv;
        return entry;
    }

    static fromDirectoryInfo(path, stat) {
        const directory = new DirectoryEntry(path, BlobEntry.fromStat(path, stat));
        directory._id = IdGenerator(DirectoryEntry.ID_LENGTH);
        directory._directoryName = PathTools.extractFileName(path);
        return directory;
    }
}

DirectoryEntry.ID_LENGTH = 12;

DirectoryEntry.TYPE = 2;

module.exports = DirectoryEntry;
