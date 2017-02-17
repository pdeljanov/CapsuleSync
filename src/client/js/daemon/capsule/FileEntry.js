const Blob = require('./Blob.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class File {

    constructor(path, blob) {
        this.path = path;
        this._data = {
            t:   'f',
            typ: '',
            id:  0,
            dn:  '',
            fn:  '',
            mv:  { },
            sv:  { },
            b:   blob ? blob.serialize() : null,
            a:   blob != null,
        };
        this._blob = blob || null;
    }

    get id() {
        return this._data.id;
    }

    get mediaType() {
        return this._data.typ;
    }

    get displayName() {
        if (this._data.dn) {
            return this._data.dn;
        }
        return this._data.fn;
    }

    get fileName() {
        return this._data.fn;
    }

    get blob() {
        return this._blob;
    }

    get available() {
        return this._data.a;
    }

    get modificationVector() {
        return this._data.mv;
    }

    set modificationVector(vector) {
        this._data.mv = vector;
    }

    get syncronizationVector() {
        return this._data.sv;
    }

    set syncronizationVector(vector) {
        this._data.sv = vector;
    }

    modify(time) {
        this._data.mv = time;
    }

    synchronize(time) {
        this._data.sv = time;
    }

    serialize() {
        return this._data;
    }

    isIdentical(stat) {
        if (stat.size === this.blob.byteLength &&
            stat.mtime.getTime() === this.blob.modificationTime.getTime() &&
            stat.birthtime.getTime() === this.blob.creationTime.getTime() &&
            stat.uid === this.blob.uid &&
            stat.gid === this.blob.gid &&
            stat.mode === this.blob.mode &&
            stat.ino === this.blob.inode
        ) {
            return true;
        }
        return false;
    }

    update(stat) {
        if (this._blob) {
            this._blob.update(stat);
            this._data.b = this._blob.serialize();
        }
    }

    static makeFromSerialization(path, serialization) {
        const blob = serialization.b ? Blob.deserialize(serialization.b) : null;
        const deserialized = new File(path, blob);
        deserialized._data.typ = serialization.typ;
        deserialized._data.id = serialization.id;
        deserialized._data.dn = serialization.dn;
        deserialized._data.fn = serialization.fn;
        deserialized._data.sv = serialization.sv;
        deserialized._data.mv = serialization.mv;
        return deserialized;
    }

    static makeFromStat(path, stat) {
        const id = IdGenerator(File.ID_LENGTH);
        const fileName = PathTools.extractFileName(path);
        const mediaType = PathTools.extractMediaType(path);
        const blob = Blob.fromStat(path, stat);

        const file = new File(path, blob);
        file._data.typ = mediaType;
        file._data.id = id;
        file._data.fn = fileName;
        return file;
    }
}

File.ID_LENGTH = 12;

module.exports = File;
