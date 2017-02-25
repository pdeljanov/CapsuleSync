const assert = require('assert');
const debug = require('debug')('Capsule.Sources.FileSystem.IntegralScanner');

const fs = require('original-fs');
const path = require('path');
const async = require('async');

const PathTools = require('../../../fs/PathTools.js');
const PathStack = require('./PathStack.js');
const Link = require('../../../fs/Link.js');
const { FileEntry, LinkEntry, DirectoryEntry } = require('../../CapsuleEntry.js');

/* global performance:true */

class IntegralScanner {

    constructor(root, options) {
        assert(typeof root, 'string', 'RootPath must be a string.');
        assert(typeof options, 'object', 'Options must be an object.');

        this._options = {
            followLinks:       (options.followLinks || false),
            numJobs:           (options.numJobs || 8),
            progressInterval:  (options.progressInterval || 0),
            junctionDetection: false,
        };

        this.root = root;

        this.progress = () => {};
        this.insert = (() => {});
        this.commit = (() => Promise.resolve());
        this.exclude = (() => false);
        this.filter = (() => true);

        this._pathStack = null;
        this._traversalStack = [];

        this._resetStats();
    }

    _resetStats() {
        this._numFiles = 0;
        this._numDirectories = 0;
        this._numSoftLinks = 0;
        this._numBytes = 0;
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
            files:         this._numFiles,
            directories:   this._numDirectories,
            softLinks:     this._numSoftLinks,
            ignored:       this._numIgnored,
            errors:        this._errors,
            totalSize:     this._numBytes,
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

    _descend(childPath, done) {
        if (!this.exclude(childPath)) {
            this._traversalStack.push(childPath);
        }
        done();
    }

    _addFile(relativePath, stat, done) {
        const entry = FileEntry.makeFromStat(relativePath, stat);
        if (this.filter(entry)) {
            this._numFiles += 1;
            this._numBytes += stat.size;
            this.insert(entry);
        }
        done();
    }

    _addDirectory(relativePath, stat) {
        this._numDirectories += 1;
        const entry = DirectoryEntry.makeFromStat(relativePath, stat);
        this.insert(entry);
    }

    _addUnfollowedSymlink(relativePath, linkedPath, linkStat, done) {
        const entry = LinkEntry.makeFromStat(relativePath, linkedPath, linkStat);
        if (this.filter(entry)) {
            this._addedSoftLinks += 1;
            this.insert(entry);
        }
        done();
    }

    _addSymlink(linkPath, linkStat, done) {
        // If this is a link, it must be resolved BEFORE calling the
        // next callback to avoid race conditions.
        Link.resolve(linkPath).then((link) => {
            const relativePath = PathTools.stripRoot(linkPath, this.root);

            // If following links, insert an entry appropriate for the linked type.
            if (this._options.followLinks) {
                // Following links makes us liable to creating infinite loops. Therefore, if for the given traversal
                // path we back track in such a way it'll lead us down the same path, create a link.
                const level = this._pathStack.attempt(link.linkedStat.ino, link.linkedStat.dev);

                if (level != null) {
                    debug(`Link cycle: '${linkPath}' -> '${level.path}' detected. Ignoring further recursion.`);
                    const relativeLinkPath = PathTools.stripRoot(level.path, this.root);
                    return this._addUnfollowedSymlink(relativePath, relativeLinkPath, linkStat, done);
                }
                // Directory.
                else if (link.linkedStat.isDirectory()) {
                    return this._descend(linkPath, done);
                }
                // File.
                else if (link.linkedStat.isFile()) {
                    return this._addFile(relativePath, link.linkedStat, done);
                }

                // Neither a file nor directory, therefore ignore.
                debug(`Linked: '${link.linkedPath}' is neither a file, or directory. Ignoring.`);
                this._ignored += 1;
            }
            // If not following links, insert a link entry with the original linked path.
            else {
                return this._addUnfollowedSymlink(relativePath, link.linkedPath, linkStat, done);
            }

            return done();
        })
        .catch((err) => {
            debug(`Failed to resolve link: '${linkPath}' due to error: ${err.code}.`);
            this._errors += 1;
            // TODO: Handle ELOOP errors. When not following symlinks, these
            // links should be faithfully represented.
            done();
        });
    }

    _getDirectoryContentsStat(dirPath, dirStat, childPaths, done) {
        this._addDirectory(PathTools.stripRoot(dirPath, this.root), dirStat);

        async.eachLimit(childPaths, this._options.numJobs, (childName, next) => {
            const childPath = path.join(dirPath, childName);

            fs.lstat(childPath, (err, childStat) => {
                if (!err) {
                    // Count # of files and total byteLength.
                    if (childStat.isFile()) {
                        const relativePath = PathTools.stripRoot(childPath, this.root);
                        return this._addFile(relativePath, childStat, next);
                    }
                    // Count # of directories, and queue a task to travese into it.
                    else if (childStat.isDirectory()) {
                        return this._descend(childPath, next);
                    }
                    // Count # of links, and follow the link to queue a task to traverse it.
                    else if (childStat.isSymbolicLink()) {
                        return this._addSymlink(childPath, childStat, next);
                    }

                    // Not a file, directory, nor link.
                    debug(`Path: '${childPath}' is neither a file, directory, nor link. Ignoring.`);
                    this._ignored += 1;
                }
                else {
                    debug(`Failed to stat: '${childPath}' with error: ${err.code}.`);
                    this._errors += 1;
                }

                return next();
            });
        },
        () => {
            this.commit().then(done);
        });
    }

    _getDirectoryContents(dirPath, dirStat, done) {
        fs.readdir(dirPath, (err, childPaths) => {
            if (!err) {
                this._getDirectoryContentsStat(dirPath, dirStat, childPaths, done);
            }
            else {
                debug(`Failed enumeration: '${dirPath}' with error: ${err.code}.`);
                this._errors += 1;
                done();
            }
        });
    }

    _traverseSubTree(dirPath, done) {
        fs.stat(dirPath, (err, dirStat) => {
            if (!err) {
                this._pathStack.push(dirPath, dirStat.ino, dirStat.dev);
                this._getDirectoryContents(dirPath, dirStat, done);
            }
            else {
                debug(`Failed stat: '${dirPath}' with error: ${err.code}.`);
                this._errors += 1;
                done();
            }
        });
    }

    run(pathStack) {
        return new Promise((resolve) => {
            // Reset stats to zero values.
            this._resetStats();
            this._startStats();

            this._pathStack = pathStack || new PathStack();
            this._traversalStack = [];

            const runNext = () => {
                if (this._traversalStack.length > 0) {
                    const nextPath = this._traversalStack.pop();

                    this._pathStack.interogatePath(nextPath);
                    this._traverseSubTree(nextPath, runNext);
                }
                else {
                    this._endStats();

                    this._pathStack = null;
                    this._traversalStack = [];

                    resolve();
                }
            };

            this._descend(this.root, runNext);
        });
    }

}

module.exports = IntegralScanner;
