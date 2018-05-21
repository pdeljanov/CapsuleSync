const fs = require('fs');

const { CapsuleEntry } = require('./CapsuleEntry.js');

class Cursor {

    constructor(tree, at) {
        this._tree = tree;
        this._path = at;
        this._entry = null;
    }

    entry() {
        return new Promise((resolve) => {
            this._tree.get(this._path).then((data) => {
                const entry = CapsuleEntry.deserialize(this._path, data);
                resolve(entry);
            });
        });
    }

    data(options) {
        return fs.createReadStream(this._path, options);
    }

    children(cb) {
        return this._tree.getChildStream(this._path, (data, next) => {
            const entry = CapsuleEntry.deserialize(data.path, data.data);
            cb(entry, next);
        });
    }

}

module.exports = Cursor;

//   /music/
