const File = require('./FileEntry.js');

class Link extends File {

    constructor(path, linkedPath, blob) {
        super(path, blob);
        this._data.t = 'l';
        this._data.lp = linkedPath;
    }

    get linkedPath() {
        return this._data.linkedPath;
    }

    static makeFromSerialization(path, serialization) {
        const deserialized = File.makeFromSerialization(path, serialization);
        deserialized._data.lp = serialization.lp;
        return deserialized;
    }

    static makeFromStat(path, linkedPath, stat) {
        const link = File.makeFromStat(path, stat);
        link._data.lp = linkedPath;
        return link;
    }
}

module.exports = Link;
