const BlobEntry = require('./BlobEntry.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class FileEntry {

    constructor(path, blob) {
        this._path = path;
        this._blob = blob || null;
        this._id = 0;
        this._mediaType = '';
        this._displayName = null;
        this._fileName = '';
        this._modVector = {};
        this._syncVector = {};
    }

    get path() {
        return this._path;
    }

    get type() {
        return FileEntry.TYPE;
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
        return this._fileName;
    }

    get fileName() {
        return this._fileName;
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

    prefix(prefix) {
        this._path = PathTools.appendRoot(prefix, this._path);
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
            t:   'f',
            id:  this._id,
            typ: this._mediaType,
            dn:  this._displayName,
            fn:  this._fileName,
            mv:  this._modVector,
            sv:  this._syncVector,
            b:   this._blob ? this._blob.serialize() : null,
            a:   this._blob !== null,
        };
    }

    static deserialize(path, serialization) {
        const blob = serialization.b ? BlobEntry.deserialize(serialization.b) : null;
        const entry = new FileEntry(path, blob);
        entry._id = serialization.id;
        entry._mediaType = serialization.typ;
        entry._displayName = serialization.dn;
        entry._fileName = serialization.fn;
        entry._modVector = serialization.mv;
        entry._syncVector = serialization.sv;
        return entry;
    }

    static fromFileInfo(path, stat) {
        const file = new FileEntry(path, BlobEntry.fromStat(path, stat));
        file._id = IdGenerator(FileEntry.ID_LENGTH);
        file._mediaType = PathTools.extractMediaType(path);
        file._fileName = PathTools.extractFileName(path);
        return file;
    }
}

FileEntry.ID_LENGTH = 12;

FileEntry.TYPE = 1;

module.exports = FileEntry;
