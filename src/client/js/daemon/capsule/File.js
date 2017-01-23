const Blob = require('./Blob.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class File {

    constructor(id, path, displayName, fileName, blob) {
        this._data = {
            id: id,
            p:  path,
            dn: displayName,
            fn: fileName,
            b:  blob,
            a:  blob != null,
        };
    }

    get id() {
        return this._data.id;
    }

    get path() {
        return this._data.p;
    }

    get displayName() {
        return this._data.dn;
    }

    get fileName() {
        return this._data.fn;
    }

    get blob() {
        return this._data.b;
    }

    get available() {
        return this._data.a;
    }

    static deserialize(serialization) {
        const deserialized = new File(
            serialization.id,
            serialization.p,
            serialization.dn,
            serialization.fn,
            serialization.b ? Blob.deserialize(serialization.b) : null);

        return deserialized;
    }

    serialize() {
        return this._data;
    }

    static fromStat(path, stat) {
        const id = IdGenerator(File.ID_LENGTH);
        const fileName = PathTools.extractFileName(path);
        const displayName = fileName;
        const blob = Blob.fromStat(path, stat);
        return new File(id, path, displayName, fileName, blob);
    }
}

File.ID_LENGTH = 12;

module.exports = File;
