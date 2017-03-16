
class Cursor {

    constructor(tree, at) {
        this._tree = tree;
        this._path = at;
        this._entry = null;
    }

    _populate() {
        return new Promise((resolve) => {
            this._tree.get(this._path).then((entry) => {
                this._entry = entry;
                resolve();
            });
        });
    }

    get entry() {
        return this._entry;
    }

    data() {

    }

    children(cb) {
        return this._tree.getChildStream(this._path, cb);
    }

    static at(tree, path) {
        const cursor = new Cursor(tree, path);
        return cursor._populate().then(() => Promise.resolve(cursor));
    }
}

module.exports = Cursor;

//   /music/
