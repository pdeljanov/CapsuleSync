const debug = require('debug')('Capsule.Sources.FileSystem.DeltaScanner');
const async = require('async');
const fs = require('original-fs');

const PathTools = require('../../../fs/PathTools.js');
const Directory = require('../../../fs/Directory.js');
const IntegralScanner = require('./IntegralScanner.js');
const { FileEntry, LinkEntry, DirectoryEntry, CapsuleEntry } = require('../../CapsuleEntry.js');

class DeltaScanner {
    constructor(root, tree, options) {
        this._root = root;
        this._tree = tree;

        this._options = {
            followLinks:      (options.followLinks || false),
            numJobs:          (options.numJobs || 8),
            progressInterval: (options.progressInterval || 0),
            cycleProtection:  false,
        };

        this.progress = (() => {});
        this.upsert = (() => {});
        this.remove = (() => {});
        this.commit = (() => Promise.resolve());
        this.filter = (() => true);

        this._resetStats();
    }

    _resetStats() {
        this._deltaFiles = 0;
        this._deltaDirectories = 0;
        this._deltaSoftLinks = 0;
        this._deltaHardLinks = 0;
        this._numIgnored = 0;
        this._errors = 0;

        this._startDate = null;
        this._startTime = null;
        this._endDate = null;
        this._endTime = null;

        clearInterval(this._progressInterval);
        this._progressInterval = null;
    }

    stats() {
        return {
            running:       (this._startTime !== null) && (this._endTime === null),
            finished:      (this._startTime !== null) && (this._endTime !== null),
            files:         this._deltaFiles,
            directories:   this._deltaDirectories,
            softLinks:     this._deltaSoftLinks,
            hardLinks:     this._deltaHardLinks,
            ignored:       this._numIgnored,
            errors:        this._errors,
            startDateTime: this._startDate,
            endDateTime:   this._endDate,
            duration:      (this._endTime || performance.now()) - this._startTime
        };
    }

    _startStats() {
        this._startDate = Date();
        this._startTime = performance.now();

        if (this._options.progressInterval) {
            this._progressInterval = setInterval(() => {
                this.progress(this.stats());
            }, this._options.progressInterval);
        }
    }

    _endStats() {
        clearInterval(this._progressInterval);
        this._progressInterval = null;

        this._endTime = performance.now();
        this._endDate = Date();

        this.progress(this.stats());
    }

    _findDirectoryAdditions(realPath, path, done) {
        const fsGet = Directory.getChildren(realPath);
        const dbGet = this._tree.getChildren(path);

        Promise.all([fsGet, dbGet]).then((values) => {
            const cur = values[0];
            const old = new Set(values[1].map(item => CapsuleEntry.getName(item.data)));
            const added = cur.filter(item => !old.has(item));
            done(added.map(item => PathTools.appendRoot(realPath, item)));
        })
        .catch((err) => {
            debug(`Could not scan directory at: ${path} due to error: ${err.code}.`);
            done();
        });
    }

    _addDirectory(scanPath, done) {
        const adjustedRoot = PathTools.stripRoot(scanPath, this._root);

        const scanner = new IntegralScanner(scanPath, this._options);

        scanner.insert = (entry) => {
            entry.path = PathTools.appendRoot(adjustedRoot, entry.path);
            this.upsert(entry);
        };

        scanner.commit = () => this.commit();

        scanner.run()
            .then(done)
            .catch(() => {
                debug('Failed to scan new directory.');
                done();
            });
    }

    _processAdditions(realPaths, done) {
        async.map(realPaths, (realPath, next) => {
            fs.lstat(realPath, (err, stat) => {
                if (!err) {
                    // Directory addition.
                    if (stat.isDirectory()) {
                        this._addDirectory(realPath, next);
                    }
                    else {
                        const relativePath = PathTools.stripRoot(realPath, this._root);

                        // File addition.
                        if (stat.isFile()) {
                            const file = FileEntry.makeFromStat(relativePath, stat);
                            if (this.filter(file)) {
                                this.upsert(file);
                            }
                            next();
                        }
                        // Symbolic link addition.
                        else if (stat.isSymbolicLink()) {
                            // Resolive the link.
                            this._resolveLink(realPath, stat, (resolveErr, linkedPath, linkedStat) => {
                                if (!resolveErr) {
                                    // If following links...
                                    if (this._options.followLinks) {
                                        if (linkedStat.isDirectory()) {
                                            this._addDirectory(realPath);
                                        }
                                        else if (linkedStat.isFile()) {
                                            const file = FileEntry.makeFromStat(relativePath, linkedStat);
                                            this.upsert(file);
                                        }
                                    }
                                    else {
                                        const link = LinkEntry.makeFromStat(relativePath, linkedPath, stat);
                                        this.upsert(link);
                                    }
                                }
                                // Carry on.
                                next();
                            });
                        }
                        // Unknown file.
                        else {
                            next();
                        }
                    }
                }
                else {
                    next(null, null);
                }
            });
        },
        done);
    }

    _resolveLink(linkPath, linkStat, cb) {
        // Resolve the link.
        fs.readlink(linkPath, (readLinkErr, linkedPath) => {
            // Failed to resolve the link.
            if (readLinkErr) {
                debug(`Cannot follow link due to error: ${readLinkErr.code}`);
                this._errors += 1;
                return cb(true);
            }

            // Stat the link to get information about the file the link(s) points to.
            return fs.stat(linkPath, (statErr, linkedStat) => {
                if (statErr) {
                    debug(`Cannot stat linked file: ${linkedPath} due to error: ${statErr.code}.`);
                    this._errors += 1;
                    return cb(true);
                }
                return cb(null, linkedPath, linkedStat);
            });
        });
    }

    run() {
        return new Promise((resolve, reject) => {
            let lastRemovedPath = null;

            this._startStats();

            this._tree.scanSubTree('/', (data, next) => {
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
                            this.remove(path);
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
                                this.upsert(file);
                            }
                        }
                        // Directory
                        else if (stat.isDirectory() && type === CapsuleEntry.Type.DIRECTORY) {
                            const dir = DirectoryEntry.makeFromSerialization(path, data.value);

                            if (!dir.isIdentical(stat)) {
                                return this._findDirectoryAdditions(realPath, data.key, (additions) => {
                                    this._processAdditions(additions, next);
                                });
                            }
                        }
                        // Link
                        else if (stat.isSymbolicLink() && type === CapsuleEntry.Type.LINK) {
                            const link = LinkEntry.makeFromSerialization(path, data.value);

                            if (!link.isIdentical(stat)) {
                                this.upsert(link);
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
                this._endStats();
                resolve();
            })
            .catch(reject);
        });
    }

}

module.exports = DeltaScanner;
