const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class Directory {

    constructor(id, path, displayName, dirName) {
        this._data = {
            id:          id,
            path:        path,
            displayName: displayName,
            dirName:     dirName,
        };
    }

    get id() {
        return this._data.id;
    }

    get path() {
        return this._data.path;
    }

    get displayName() {
        return this._data.displayName;
    }

    get dirName() {
        return this._data.dirName;
    }

    static deserialize(serialization) {
        const deserialized = new Directory(
            serialization.id,
            serialization.path,
            serialization.displayName,
            serialization.dirName);

        return deserialized;
    }

    serialize() {
        return this._data;
    }

    static fromStat(path, stat){
        const id = IdGenerator(Directory.ID_LENGTH);
        const dirName = PathTools.extractFileName(path);
        const displayName = dirName;
        return new Directory(id, path, displayName, dirName);
    }

}

Directory.ID_LENGTH = 12;

module.exports = Directory;
