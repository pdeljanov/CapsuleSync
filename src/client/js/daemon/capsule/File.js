const Blob = require('./Blob.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class File {

    constructor(id, path, displayName, fileName, blob) {
        this._data = {
            id:          id,
            path:        path,
            displayName: displayName,
            fileName:    fileName,
            blob:        blob,
            available:   blob != null,
        };
    }

    get path() {
        return this._data.path;
    }

    get id() {
        return this._data.id;
    }

    get displayName() {
        return this._data.displayName;
    }

    get fileName() {
        return this._data.fileName;
    }

    get blob() {
        return this._data.blob;
    }

    get available() {
        return this._data.available;
    }

    static deserialize(serialization) {
        const deserialized = new File(
            serialization.id,
            serialization.path,
            serialization.displayName,
            serialization.fileName,
            serialization.blob ? Blob.deserialize(serialization.blob) : null);

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
