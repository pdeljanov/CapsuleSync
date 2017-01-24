const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class Directory {

    constructor(path) {
        this._data = {
            t:   'd',
            id:  0,
            dn:  '',
            din: '',
            mv:  { },
            sv:  { },
        };
        this._path = path;
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
        return this._data.din;
    }

    get dirName() {
        return this._data.din;
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
        const deserialized = new Directory('');
        deserialized._data.id = serialization.id;
        deserialized._data.dn = serialization.dn;
        deserialized._data.din = serialization.din;
        deserialized._data.sv = serialization.sv;
        deserialized._data.mv = serialization.mv;
        return deserialized;
    }

    static makeFromStat(path, stat) {
        const id = IdGenerator(Directory.ID_LENGTH);
        const dirName = PathTools.extractFileName(path);

        const dir = new Directory(path);
        dir._data.id = id;
        dir._data.din = dirName;
        return dir;
    }

}

Directory.ID_LENGTH = 12;

module.exports = Directory;
