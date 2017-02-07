const debug = require('debug')('Capsule.Sources.FileSystem.DeltaScanner');
const async = require('async');
const fs = require('original-fs');

const PathTools = require('../../../fs/PathTools.js');
const Directory = require('../../../fs/Directory.js');
const Link = require('../../../fs/Link.js');
const IntegralScanner = require('./IntegralScanner.js');
const { FileEntry, LinkEntry, DirectoryEntry, CapsuleEntry } = require('../../CapsuleEntry.js');

/* global performance:true */

class DeltaScanner {
    constructor(root, tree, options) {
        this._root = root;
        this._tree = tree;

        this._options = {
            followLinks:       (options.followLinks || false),
            numJobs:           (options.numJobs || 8),
            progressInterval:  (options.progressInterval || 0),
            junctionDetection: false,
        };

        this.progress = (() => {});
        this.upsert = (() => {});
        this.remove = (() => {});
        this.commit = (() => Promise.resolve());
        this.filter = (() => true);

        this._resetStats();
    }

    _resetStats() {
        this._addedFiles = 0;
        this._addedDirectories = 0;
        this._addedSoftLinks = 0;
        this._removedFiles = 0;
        this._removedDirectories = 0;
        this._removedSoftLinks = 0;
        this._scanned = 0;
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
        const entries = this._addedFiles + this._addedDirectories + this._addedSoftLinks +
            this._removedFiles + this._removedDirectories + this._removedSoftLinks + this._scanned;

        return {
            running:  (this._startTime !== null) && (this._endTime === null),
            finished: (this._startTime !== null) && (this._endTime !== null),
            added:    {
                files:       this._addedFiles,
                directories: this._addedDirectories,
                softLinks:   this._addedSoftLinks,
            },
            removed: {
                files:       this._removedFiles,
                directories: this._removedDirectories,
                softLinks:   this._removedSoftLinks,
            },
            entries:       entries,
            ignored:       this._numIgnored,
            errors:        this._errors,
            startDateTime: this._startDate,
            endDateTime:   this._endDate,
            duration:      (this._endTime || performance.now()) - this._startTime,
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

    _addFile(path, relativePath, stat, done) {
        const file = FileEntry.makeFromStat(relativePath, stat);
        if (this.filter(file)) {
            this.upsert(file);
            this._addedFiles += 1;
        }
        done();
    }

    _addDirectory(path, done) {
        const adjustedRoot = PathTools.stripRoot(path, this._root);

        const scanner = new IntegralScanner(path, this._options);

        scanner.insert = (entry) => {
            entry.path = PathTools.appendRoot(adjustedRoot, entry.path);
            this.upsert(entry);
        };

        let last = scanner.stats();
        scanner.progress = (p) => {
            this._addedFiles += (p.files - last.files);
            this._addedDirectories += (p.directories - last.directories);
            this._addedSoftLinks += (p.softLinks - last.softLinks);
            this._numIgnored += (p.ignored - last.ignored);
            this._errors += (p.errors - last.errors);
            last = p;
        };

        scanner.filter = this.filter;
        scanner.commit = this.commit;

        scanner.run()
            .then(done)
            .catch(() => {
                debug(`Failed to scan: ${path}.`);
                done();
            });
    }

    _addSymlink(path, relativePath, stat, done) {
        // Resolve the link.
        Link.resolve(path).then((link) => {
            // If following links, insert an entry appropriate with the linked type.
            if (this._options.followLinks) {
                // File.
                if (link.linkedStat.isFile()) {
                    return this._addFile(path, relativePath, link.linkedStat, done);
                }
                // Directory.
                else if (link.linkedStat.isDirectory()) {
                    return this._addDirectory(path, done);
                }

                // Neither.
                debug(`Linked: ${link.linkedPath} is neither a file, or directory. Ignoring.`);
                this._numIgnored += 1;
            }
            // If not following links, insert a link entry.
            else {
                this.upsert(LinkEntry.makeFromStat(relativePath, link.linkedPath, stat));
                this._addedSoftLinks += 1;
            }

            return done();
        })
        .catch((resolveErr) => {
            debug(`Failed to resolve link: ${path} due to error: ${resolveErr.code}.`);
            this._errors += 1;
            done();
        });
    }

    _processAddedPaths(paths, done) {
        async.eachLimit(paths, this._options.numJobs, (path, next) => {
            fs.lstat(path, (err, stat) => {
                if (!err) {
                    const relativePath = PathTools.stripRoot(path, this._root);

                    // File addition.
                    if (stat.isFile()) {
                        this._addFile(path, relativePath, stat, next);
                    }
                    // Directory addition.
                    else if (stat.isDirectory()) {
                        this._addDirectory(path, next);
                    }
                    // Link addition.
                    else if (stat.isSymbolicLink()) {
                        this._addSymlink(path, relativePath, stat, next);
                    }
                    // Not a file, directory, or link.
                    else {
                        debug(`Path: ${path} is neither a file, directory, nor link. Ignoring.`);
                        this._errors += 1;
                        next();
                    }
                }
                // Error in stating the path.
                else {
                    debug(`Failed to stat: ${path} with error: ${err.code}.`);
                    this._errors += 1;
                    next();
                }
            });
        },
        () => {
            done();
        });
    }

    _findAddedPaths(path, relativePath, done) {
        const fsGet = Directory.getChildren(path);
        const dbGet = this._tree.getChildren(relativePath);

        Promise.all([fsGet, dbGet]).then((values) => {
            const cur = values[0];
            const old = new Set(values[1].map(item => CapsuleEntry.getName(item.data)));
            const added = cur.filter(item => !old.has(item));
            done(added.map(item => PathTools.appendRoot(path, item)));
        })
        .catch((err) => {
            debug(`Could not scan directory at: ${relativePath} due to error: ${err.code}.`);
            done();
        });
    }

    run() {
        return new Promise((resolve, reject) => {
            let lastRemovedPrefix = '';

            const getStat = this._options.followLinks ? fs.stat : fs.lstat;

            this._startStats();

            this._tree.scanSubTree('/', (data, next) => {
                const relativePath = data.key;
                const path = PathTools.appendRoot(this._root, relativePath);
                const type = CapsuleEntry.getType(data.value);

                this._scanned += 1;

                // If the current path is prefixed with the last previously deleted directory path,
                // may be safely skipped as it would be considered deleted.
                if (lastRemovedPrefix && path.startsWith(lastRemovedPrefix)) {
                    switch (type) {
                    case CapsuleEntry.Type.DIRECTORY:
                        this._removedDirectories += 1;
                        break;
                    case CapsuleEntry.Type.FILE:
                        this._removedFiles += 1;
                        break;
                    case CapsuleEntry.Type.LINK:
                        this._removedSoftLinks += 1;
                        break;
                    default:
                    }
                    return next();
                }

                // Get the stat information for the item being scanned.
                return getStat(path, (err, stat) => {
                    if (err) {
                        // Deletion.
                        if (err.code === 'ENOENT') {
                            if (type === CapsuleEntry.Type.DIRECTORY) {
                                lastRemovedPrefix = path;
                                this._removedDirectories += 1;
                            }
                            else if (type === CapsuleEntry.Type.FILE) {
                                this._removedFiles += 1;
                            }
                            else if (type === CapsuleEntry.Type.LINK) {
                                this._removedSoftLinks += 1;
                            }
                            this.remove(relativePath);
                        }
                        else {
                            debug(`Unexpected error: ${err.code} at: ${relativePath}`);
                            this._errors += 1;
                        }
                    }
                    else if (!err) {
                        // File update.
                        if (stat.isFile() && type === CapsuleEntry.Type.FILE) {
                            const file = FileEntry.makeFromSerialization(relativePath, data.value);

                            if (!file.isIdentical(stat)) {
                                this.upsert(file);
                            }
                        }
                        // Directory update.
                        else if (stat.isDirectory() && type === CapsuleEntry.Type.DIRECTORY) {
                            const dir = DirectoryEntry.makeFromSerialization(relativePath, data.value);

                            if (!dir.isIdentical(stat)) {
                                this.upsert(dir);
                                return this._findAddedPaths(path, data.key, (additions) => {
                                    this._processAddedPaths(additions, next);
                                });
                            }
                        }
                        // Link update.
                        else if (stat.isSymbolicLink() && type === CapsuleEntry.Type.LINK) {
                            const link = LinkEntry.makeFromSerialization(relativePath, data.value);

                            if (!link.isIdentical(stat)) {
                                this.upsert(link);
                            }
                        }
                        // Type mistach for file or directory.
                        else {
                            debug(`Type mismatch for: ${relativePath}.`);
                            this._errors += 1;
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
