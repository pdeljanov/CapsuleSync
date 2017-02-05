const debug = require('debug')('Capsule.Sources.FileSystemSource');
const fs = require('original-fs');
const async = require('async');

const Source = require('./Source.js');
const PathTools = require('../../fs/PathTools.js');
const Traverse = require('../../fs/BatchingTraverse.js');
const { FilterSet } = require('../FilterSet.js');
const { FileEntry, LinkEntry, DirectoryEntry, CapsuleEntry } = require('../CapsuleEntry.js');

function batch(arr, n, func, done) {
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


class Directory {
    static getChildren(path) {
        return new Promise((resolve, reject) => {
            fs.readdir(path, (err, children) => {
                if (!err) {
                    resolve(children);
                }
                else {
                    reject(err);
                }
            });
        });
    }
}

class FileSystemSource extends Source {

    constructor(id, root) {
        super(id);

        this._root = root;
        this.filters = FilterSet.empty();
        this.lastScan = null;
    }

    load() {
        debug(`[${this._id}] Loading FileSystemSource`);

        return new Promise((resolve, reject) => {
            debug(`[${this._id}] Checking ${this._root} exists...`);

            // Check to see if the directory exists.
            fs.stat(this._root, (err) => {
                // Error if the root does not exist.
                if (err && err.code === 'ENOENT') {
                    debug(`[${this._id}] Source path does not exist.`);
                    reject(Source.ERRORS.DOES_NOT_EXIST);
                }
                // Error if the permissions prevent access to the root.
                else if (err && err.code === 'EACCES') {
                    debug(`[${this._id}] Access denied to source path.`);
                    reject(Source.ERRORS.ACCESS_DENIED);
                }
                // Loaded successfully.
                else {
                    debug(`[${this._id}] Loaded successfully!`);
                    // Complete the load.
                    resolve();
                    // Check if there was an initial scan in a new thread to allow the load thread
                    // to complete.
                    process.nextTick(() => {
                        if (this.lastScan === null) {
                            debug(`[${this._id}] Source has never been scanned before.`);
                            this.emit('initialScan');
                        }
                        else {
                            debug(`[${this._id}] Source was last scanned ${this.lastScan}.`);
                            this.emit('deltaScan');
                        }
                    });
                }
            });
        });
    }

    applyFilter(filterSet) {
        this.filters = filterSet;
    }

    unload() {

    }

    enable() {

    }

    disable() {

    }

    traverse(add, commit) {
        return new Promise((resolve, reject) => {
            const progress = (p) => {
                if (!p.finished) {
                    debug(`[${this._id}] Scaning... Files: ${p.files}, Directories: ${p.directories}, Size: ${p.totalSize}, Time: ${p.duration}`);
                }
                else {
                    const speed = Math.floor((1000 * p.files) / p.duration);
                    debug(`[${this._id}] Scaning complete. Files: ${p.files}, Directories: ${p.directories}, Size: ${p.totalSize}, Time: ${p.duration}, Avg. Speed: ${speed} files/s`);
                }
            };

            this._walkTree(this._root, add, commit, progress)
                .then(() => {
                    this.lastScan = Date();
                    resolve();
                })
                .catch(reject);
        });
    }

    _walkTree(root, add, commit, progress) {
        const walker = new Traverse(root, { followLinks: true, progressInterval: 500 });

        walker.progress = progress || (() => {});

        walker.directory = (dirPath, dirStat, contents, depth, next) => {
            // Add directory.
            add(DirectoryEntry.makeFromStat(PathTools.stripRoot(dirPath, root), dirStat));

            // Iterate through each item in the directory in asynchronous batches.
            batch(contents, 32, (items, cb) => {
                items.forEach((item) => {
                    const relativePath = PathTools.stripRoot(item.path, root);
                    const stat = item.stat;

                    if (stat.isFile()) {
                        const file = FileEntry.makeFromStat(relativePath, stat);
                        if (this.filters.evaluate(file)) {
                            add(file);
                        }
                    }
                    else if (stat.isSymbolicLink()) {
                        const linkedPath = PathTools.stripRoot(item.linkedPath, root);
                        add(LinkEntry.makeFromStat(relativePath, linkedPath, stat));
                    }
                });
                cb();
            },
            () => {
                // Issue a commit before continuing on the traversal.
                commit().then(next);
            });
        };

        return walker.traverse();
    }

    delta(tree, upsert, remove, commit) {
        return new Promise((resolve, reject) => {
            let lastRemovedPath = null;

            // Find added children to the directory.
            const findDirectoryAdditions = (realPath, path, done) => {
                const fsGet = Directory.getChildren(realPath);
                const dbGet = tree.getChildren(path);

                Promise.all([fsGet, dbGet]).then((values) => {
                    const cur = values[0];
                    const old = new Set(values[1].map(item => CapsuleEntry.getName(item.data)));
                    const added = cur.filter(item => !old.has(item));
                    done(added.map(item => PathTools.appendRoot(realPath, item)));
                })
                .catch((err) => {
                    debug(`[${this._id}] Could not scan directory at: ${path} due to error: ${err.code}.`);
                    done();
                });
            };

            // Scan newly added directory.
            const addDirectory = (scanPath, done) => {
                const adjustedRoot = PathTools.stripRoot(scanPath, this._root);
                this._walkTree(scanPath,
                    (entry) => {
                        entry.path = PathTools.appendRoot(adjustedRoot, entry.path);
                        upsert(entry);
                        // debug(`[${this._id}] Added at: ${realPath}.`);
                    },
                    () => Promise.resolve())
                    .then(done);
            };

            const processAdditions = (realPaths, done) => {
                async.map(realPaths, (realPath, next) => {
                    fs.lstat(realPath, (err, stat) => {
                        if (!err) {
                            if (stat.isDirectory()) {
                                addDirectory(realPath, next);
                            }
                            else {
                                const relativePath = PathTools.stripRoot(realPath, this._root);

                                if (stat.isFile()) {
                                    const file = FileEntry.makeFromStat(relativePath, stat);
                                    if (this.filters.evaluate(file)) {
                                        upsert(file);
                                        // debug(`[${this._id}] Added file at: ${realPath}.`);
                                    }
                                }
                                else if (stat.isSymbolicLink()) {
                                    const linkedPath = ''; // PathTools.stripRoot(linkedPath, this._root);
                                    const link = LinkEntry.makeFromStat(relativePath, '', stat);
                                    // debug(`[${this._id}] Added link at: ${realPath}.`);
                                    upsert(link);
                                }
                                next();
                            }
                        }
                        else {
                            next(null, null);
                        }
                    });
                },
                done);
            };

            tree.scanSubTree('', (data, next) => {
                const realPath = PathTools.appendRoot(this._root, data.key);
                const path = data.key;
                const type = CapsuleEntry.getType(data.value);

                // If the current path is prefixed with the last previously deleted directory path,
                // may be safely skipped as it would be considered deleted.
                if (realPath.startsWith(lastRemovedPath)) {
                    // debug(`[${this._id}] Skipping: ${path} since parent was removed.`);
                    return next();
                }

                // Get the stat information for the item being scanned.
                return fs.lstat(realPath, (err, stat) => {
                    if (err) {
                        // Deletion.
                        if (err.code === 'ENOENT') {
                            if (type === CapsuleEntry.Type.DIRECTORY) {
                                lastRemovedPath = realPath;
                            }
                            // debug(`[${this._id}] Removal of: ${path}`);
                            remove(path);
                        }
                        else {
                            debug(`[${this._id}] Unknown error at: ${path}`);
                        }
                    }
                    else if (!err) {
                        // File
                        if (stat.isFile() && type === CapsuleEntry.Type.FILE) {
                            const file = FileEntry.makeFromSerialization(path, data.value);

                            if (!file.isIdentical(stat)) {
                                // debug(`[${this._id}] File difference for: ${path}.`);
                                upsert(file);
                            }
                        }
                        // Directory
                        else if (stat.isDirectory() && type === CapsuleEntry.Type.DIRECTORY) {
                            const dir = DirectoryEntry.makeFromSerialization(path, data.value);

                            if (!dir.isIdentical(stat)) {
                                return findDirectoryAdditions(realPath, data.key, (additions) => {
                                    processAdditions(additions, next);
                                });
                            }
                        }
                        // Link
                        else if (stat.isSymbolicLink() && type === CapsuleEntry.Type.LINK) {
                            const link = LinkEntry.makeFromSerialization(path, data.value);

                            if (!link.isIdentical(stat)) {
                                // debug(`[${this._id}] Link difference for: ${path}.`);
                                upsert(link);
                            }
                        }
                        // Type mistach
                        else {
                            debug(`[${this._id}] Type mismatch for: ${path}.`);
                        }
                    }

                    return next();
                });
            })
            .then(() => {
                this.lastScan = Date();
                debug(`[${this._id}] Delta scan complete.`);
                resolve();
            })
            .catch(reject);
        });
    }

    serialize() {
        return super.serialize(FileSystemSource.TYPE_IDENTIFIER, {
            root:     this._root,
            lastScan: this.lastScan || null,
        });
    }

    static deserialize(serialized) {
        const source = new FileSystemSource(serialized.id, serialized.derived.root);
        source.lastScan = serialized.derived.lastScan || null;
        return source;
    }

}

FileSystemSource.TYPE_IDENTIFIER = 'fs-1';

module.exports = FileSystemSource;
