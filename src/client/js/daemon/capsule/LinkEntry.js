
const Blob = require('./Blob.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class LinkEntry {

    constructor(path, linkedPath, blob) {
        this.path = path;
        this._data = {
            t:  'l',
            id: 0,
            dn: '',
            fn: '',
            mv: { },
            sv: { },
            b:  blob ? blob.serialize() : null,
            a:  blob != null,
            lp: linkedPath,
        };
        this._blob = blob || null;
    }

    get id() {
        return this._data.id;
    }

    get linkedPath() {
        return this._data.lp;
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
            stat.ctime.getTime() === this.blob.creationTime.getTime() &&
            stat.uid === this.blob.uid &&
            stat.gid === this.blob.gid &&
            stat.mode === this.blob.mode &&
            stat.ino === this.blob.inode
        ) {
            return true;
        }
        return false;
    }

    static makeFromSerialization(path, serialization) {
        const blob = serialization.b ? Blob.deserialize(serialization.b) : null;
        const deserialized = new LinkEntry(path, serialization.lp, blob);
        deserialized._data.id = serialization.id;
        deserialized._data.dn = serialization.dn;
        deserialized._data.fn = serialization.fn;
        deserialized._data.sv = serialization.sv;
        deserialized._data.mv = serialization.mv;
        return deserialized;
    }

    static makeFromStat(path, linkedPath, stat) {
        const id = IdGenerator(LinkEntry.ID_LENGTH);
        const fileName = PathTools.extractFileName(path);
        const blob = Blob.fromStat(path, stat);

        const link = new LinkEntry(path, linkedPath, blob);
        link._data.id = id;
        link._data.fn = fileName;
        return link;
    }
}

LinkEntry.ID_LENGTH = 12;

module.exports = LinkEntry;
