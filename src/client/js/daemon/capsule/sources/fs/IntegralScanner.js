const PathTools = require('../../../fs/PathTools.js');
const Traverse = require('../../../fs/BatchingTraverse.js');
const { FileEntry, LinkEntry, DirectoryEntry } = require('../../CapsuleEntry.js');

function Batch(arr, n, func, done) {
    let i = 0;
    function doNext() {
        if (i * n < arr.length) {
            setImmediate(() => {
                const s = i * n;
                const e = Math.min((s + n), arr.length);
                func(arr.slice(s, e), doNext);
                i += 1;
            });
        }
        else {
            done();
        }
    }

    if (arr.length > n) {
        doNext();
    }
    else {
        func(arr, done);
    }
}

class IntegralScanner {
    constructor(root, options) {
        this._scanner = new Traverse(root, options);

        this.insert = (() => {});
        this.commit = (() => Promise.resolve());
        this.filter = (() => true);
    }

    get progress() {
        return this._scanner.progress;
    }

    set progress(progress) {
        this._scanner.progress = progress;
    }

    run() {
        this._scanner.directory = (dirPath, dirStat, contents, depth, next) => {
            // Add directory.
            this.insert(DirectoryEntry.makeFromStat(PathTools.stripRoot(dirPath, this._scanner.root), dirStat));

            // Iterate through each item in the directory in asynchronous batches.
            Batch(contents, 32, (items, cb) => {
                items.forEach((item) => {
                    const relativePath = PathTools.stripRoot(item.path, this._scanner.root);
                    const stat = item.stat;

                    if (stat.isFile()) {
                        const file = FileEntry.makeFromStat(relativePath, stat);
                        if (this.filter(file)) {
                            this.insert(file);
                        }
                    }
                    else if (stat.isSymbolicLink()) {
                        const linkedPath = PathTools.stripRoot(item.linkedPath, this._scanner.root);
                        this.insert(LinkEntry.makeFromStat(relativePath, linkedPath, stat));
                    }
                });
                cb();
            },
            () => {
                // Issue a commit before continuing on the traversal.
                this.commit().then(next);
            });
        };

        return this._scanner.traverse();
    }

}

module.exports = IntegralScanner;
