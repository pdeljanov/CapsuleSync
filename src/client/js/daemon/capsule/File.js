const Blob = require('./Blob.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class File {

    constructor(path, blob) {
        this._data = {
            t:  'f',
            id: 0,
            dn: '',
            fn: '',
            mv: { },
            sv: { },
            b:  blob ? blob.serialize() : null,
            a:  false,
        };
        this._path = path;
        this._blob = blob || null;
    }

    get id() {
        return this._data.id;
    }

    get path() {
        return this._path;
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

    serialize() {
        return this._data;
    }

    static makeFromSerialization(serialization) {
        const blob = serialization.b ? Blob.deserialize(serialization.b) : null;
        const deserialized = new File('', blob);
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
        const blob = Blob.fromStat(path, stat);

        const file = new File(path, blob);
        file._data.id = id;
        file._data.fn = fileName;
        return file;
    }
}

File.ID_LENGTH = 12;

module.exports = File;
