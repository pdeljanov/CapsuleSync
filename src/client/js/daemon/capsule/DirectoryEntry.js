const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class Directory {

    constructor(path) {
        this.path = path;
        this._data = {
            t:   'd',
            id:  0,
            mt:  0,
            dn:  '',
            din: '',
            mv:  { },
            sv:  { },
        };
    }

    get id() {
        return this._data.id;
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

    get modificationTime() {
        return this._data.mt;
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

    isIdentical(stat) {
        if (stat.mtime.getTime() === this.modificationTime.getTime()) {
            return true;
        }
        return false;
    }

    update(stat) {
        this._data.mt = stat.mtime;
    }

    serialize() {
        return this._data;
    }

    static makeFromSerialization(path, serialization) {
        const deserialized = new Directory(path);
        deserialized._data.id = serialization.id;
        deserialized._data.dn = serialization.dn;
        deserialized._data.din = serialization.din;
        deserialized._data.sv = serialization.sv;
        deserialized._data.mv = serialization.mv;
        deserialized._data.mt = new Date(serialization.mt);
        return deserialized;
    }

    static makeFromStat(path, stat) {
        const id = IdGenerator(Directory.ID_LENGTH);
        const dirName = PathTools.extractFileName(path);

        const dir = new Directory(path);
        dir._data.id = id;
        dir._data.din = dirName;
        dir._data.mt = stat.mtime;
        return dir;
    }

}

Directory.ID_LENGTH = 12;

module.exports = Directory;
