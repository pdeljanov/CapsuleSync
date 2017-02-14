const debug = require('debug')('Capsule.Sources.FileSystem.DeltaScanner');
const async = require('async');
const fs = require('original-fs');

const PathTools = require('../../../fs/PathTools.js');
const Directory = require('../../../fs/Directory.js');
const Link = require('../../../fs/Link.js');
const PathStack = require('./PathStack.js');
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
        this.exclude = (() => false);
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

    _removeCount(type) {
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
            break;
        }
    }

    _remove(relativePath, type) {
        this._removeCount(type);
        this.remove(relativePath);
    }

    _addFile(relativePath, stat, done) {
        const entry = FileEntry.makeFromStat(relativePath, stat);
        if (this.filter(entry)) {
            this.upsert(entry);
            this._addedFiles += 1;
        }
        done();
    }

    _addDirectory(path, done) {
        if (!this.exclude(path)) {
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

            scanner.exclude = this.exclude;
            scanner.filter = this.filter;
            scanner.commit = this.commit;

            scanner.run(this._pathStack)
                .then(done)
                .catch(() => {
                    debug(`Failed to scan: '${path}'.`);
                    done();
                });
        }
        else {
            done();
        }
    }

    _addUnfollowedSymlink(path, linkedPath, linkStat, done) {
        const entry = LinkEntry.makeFromStat(path, linkedPath, linkStat);
        if (this.filter(entry)) {
            this._addedSoftLinks += 1;
            this.upsert(entry);
        }
        done();
    }

    _addSymlink(path, relativePath, stat, done) {
        // Resolve the link.
        Link.resolve(path).then((link) => {
            // If following links, insert an entry appropriate for the linked type.
            if (this._options.followLinks) {
                // Following links makes us liable to creating infinite loops. Therefore, if for the given traversal
                // path we back track in such a way it'll lead us down the same path, create a link.
                const level = this._pathStack.attempt(link.linkedStat.ino, link.linkedStat.dev);

                if (level != null) {
                    debug(`Link cycle: '${path}' -> '${level.path}' detected. Ignoring further recursion.`);
                    const relativeLinkedPath = PathTools.stripRoot(level.path, this.root);
                    return this._addUnfollowedSymlink(relativePath, relativeLinkedPath, stat, done);
                }
                // File.
                else if (link.linkedStat.isFile()) {
                    return this._addFile(relativePath, link.linkedStat, done);
                }
                // Directory.
                else if (link.linkedStat.isDirectory()) {
                    return this._addDirectory(path, done);
                }

                // Neither a file nor directory, therefore ignore.
                debug(`Linked: '${link.linkedPath}' is neither a file, or directory. Ignoring.`);
                this._numIgnored += 1;
            }
            // If not following links, insert a link entry.
            else {
                return this._addUnfollowedSymlink(relativePath, link.linkedPath, stat, done);
            }

            return done();
        })
        .catch((resolveErr) => {
            debug(`Failed to resolve link: '${path}' due to error: ${resolveErr.code}.`);
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
                        return this._addFile(relativePath, stat, next);
                    }
                    // Directory addition.
                    else if (stat.isDirectory()) {
                        return this._addDirectory(path, next);
                    }
                    // Link addition.
                    else if (stat.isSymbolicLink()) {
                        return this._addSymlink(path, relativePath, stat, next);
                    }

                    // Not a file, directory, or link.
                    debug(`Path: '${path}' is neither a file, directory, nor link. Ignoring.`);
                    this._errors += 1;
                }
                // Error in stating the path.
                else {
                    debug(`Failed to stat: '${path}' with error: ${err.code}.`);
                    this._errors += 1;
                }

                return next();
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
            debug(`Could not scan directory at: '${relativePath}' due to error: ${err.code}.`);
            done();
        });
    }

    run() {
        return new Promise((resolve, reject) => {
            let lastRemovedPrefix = '';

            const getStat = this._options.followLinks ? fs.stat : fs.lstat;

            this._pathStack = new PathStack();

            this._startStats();

            this._tree.scanSubTree('/', (data, next) => {
                const relativePath = data.key;
                const path = PathTools.appendRoot(this._root, relativePath);
                const type = CapsuleEntry.getType(data.value);
                const entry = CapsuleEntry.deserialize(relativePath, data.value);

                this._scanned += 1;

                // If the current path is prefixed with the last previously deleted directory path,
                // may be safely skipped as it would be considered deleted.
                if (lastRemovedPrefix && path.startsWith(lastRemovedPrefix)) {
                    this._removeCount(type);
                    return next();
                }

                // Get the stat information for the item being scanned.
                return getStat(path, (err, stat) => {
                    // Update the path stack.
                    if (type === CapsuleEntry.Type.DIRECTORY) {
                        this._pathStack.interogatePath(path);
                        if (!err) {
                            this._pathStack.push(path, stat.ino, stat.dev);
                        }
                        else {
                            lastRemovedPrefix = path;
                        }
                    }

                    // Removal due to deletion, or error.
                    if (err) {
                        if (err.code !== 'ENOENT') {
                            debug(`Unexpected error: ${err.code} at: '${relativePath}'.`);
                            this._errors += 1;
                        }

                        this._remove(relativePath, type);
                    }
                    // Directory removal due to exclusion.
                    else if (type === CapsuleEntry.Type.DIRECTORY && this.exclude(path)) {
                        lastRemovedPrefix = path;
                        this._remove(relativePath, type);
                    }
                    // File or link removal due to filter.
                    else if (type !== CapsuleEntry.Type.DIRECTORY && !this.filter(entry)) {
                        this._remove(relativePath, type);
                    }
                    // Update.
                    else {
                        // File update.
                        if (stat.isFile() && type === CapsuleEntry.Type.FILE) {
                            const file = FileEntry.makeFromSerialization(relativePath, data.value);

                            if (!file.isIdentical(stat)) {
                                file.update(stat);
                                this.upsert(file);
                            }

                            return next();
                        }
                        // Directory update.
                        else if (stat.isDirectory() && type === CapsuleEntry.Type.DIRECTORY) {
                            const dir = DirectoryEntry.makeFromSerialization(relativePath, data.value);

                            if (!dir.isIdentical(stat)) {
                                dir.update(stat);
                                this.upsert(dir);
                                return this._findAddedPaths(path, data.key, (additions) => {
                                    this._processAddedPaths(additions, next);
                                });
                            }

                            return next();
                        }
                        // Weak link update.
                        else if (type === CapsuleEntry.Type.LINK && this._options.followLinks) {
                            // When following links, a Capsule link entry is a weak-link, a link to break cycles
                            // in the file system structure. The above getStat call is a stat in this case which gets us
                            // the metadata of the file or directory the link points to, not the link itself. So redo
                            // with an lstat.
                            return fs.lstat(path, (linkErr, linkStat) => {
                                // Path does point to a link.
                                if (!linkErr && linkStat.isSymbolicLink()) {
                                    const link = LinkEntry.makeFromSerialization(relativePath, data.value);

                                    // TODO: Do we have to check if the linked path changed? Symlinks have no atomic
                                    // edit capability.
                                    if (!link.isIdentical(linkStat)) {
                                        link.update(linkStat);
                                        this.upsert(link);
                                    }
                                }
                                // Path is not actually a link.
                                else {
                                    this._remove(relativePath, type);
                                }

                                return next();
                            });
                        }
                        // Link update.
                        else if (type === CapsuleEntry.Type.LINK && !this._options.followLinks) {
                            // When not following links, a Capsule link entry should mirror an on-disk link entry. The
                            // getStat call above in this case is an lstat, meaning we can compare the database entry to
                            // the on-disk entry directly.
                            if (stat.isSymbolicLink()) {
                                const link = LinkEntry.makeFromSerialization(relativePath, data.value);

                                if (!link.isIdentical(stat)) {
                                    link.update(stat);
                                    this.upsert(link);
                                }
                                return next();
                            }
                        }

                        // Type mismatch. Remove database entry.
                        this._remove(relativePath, type);
                    }

                    return next();
                });
            })
            .then(() => {
                this._endStats();
                this._pathStack = null;
                resolve();
            })
            .catch(reject);
        });
    }

}

module.exports = DeltaScanner;
