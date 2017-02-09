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

    _getLinkChild(linkPath, linkStat, done) {
        // If this is a link, it must be resolved BEFORE calling the
        // next callback to avoid race conditions.
        Link.resolve(linkPath).then((link) => {
            // If following links...
            if (this._options.followLinks) {
                const relativePath = PathTools.stripRoot(linkPath, this.root);

                // Following links makes us liable to creating infinite loops. Therefore, if for the given traversal
                // path we back track in such a way it'll lead us down the same path, create a link.
                const level = this._pathStack.attempt(link.linkedStat.ino, link.linkStat.dev);

                if (level != null) {
                    debug(`Link cycle: '${linkPath}' -> '${level.path}' detected. Ignoring further recursion.`);
                    this._numSoftLinks += 1;
                    const relativeLinkPath = PathTools.stripRoot(level.path, this.root);
                    // this.insert(WeakLinkEntry.makeFromStat(relativePath, relativeLinkPath, linkStat));
                    this.insert(LinkEntry.makeFromStat(relativePath, relativeLinkPath, linkStat));
                }
                // If a directory is linked, push the linked path to the work queue.
                else if (link.linkedStat.isDirectory()) {
                    this._traversalStack.push(linkPath);
                    this.insert(DirectoryEntry.makeFromStat(relativePath, link.linkedStat));
                }
                // If a file is linked, count the file and swap stat information.
                else if (link.linkedStat.isFile()) {
                    this._numFiles += 1;
                    this._numBytes += link.linkedStat.size;
                    this.insert(FileEntry.makeFromStat(relativePath, link.linkedStat));
                }
                // Neither a file nor directory, therefore ignore.
                else {
                    debug(`Linked: '${link.linkedPath}' is neither a file, or directory. Ignoring.`);
                    this._ignored += 1;
                }
                done();
            }
            // If not following links. Append the linkedPath to the child
            // content.
            else {
                this.insert(LinkEntry.makeFromStat(linkPath, linkStat, link.linkedPath));
                done();
            }
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
        this._numDirectories += 1;
        this.insert(DirectoryEntry.makeFromStat(PathTools.stripRoot(dirPath, this.root), dirStat));

        async.eachLimit(childPaths, this._options.numJobs, (childName, next) => {
            const childPath = path.join(dirPath, childName);

            fs.lstat(childPath, (err, childStat) => {
                if (!err) {
                    // Count # of files and total byteLength.
                    if (childStat.isFile()) {
                        this._numFiles += 1;
                        this._numBytes += childStat.size;
                        this.insert(FileEntry.makeFromStat(PathTools.stripRoot(childPath, this.root), childStat));
                        next();
                    }
                    // Count # of directories, and queue a task to travese into it.
                    else if (childStat.isDirectory()) {
                        this._traversalStack.push(childPath);
                        next();
                    }
                    // Count # of links, and follow the link to queue a task to traverse it.
                    else if (childStat.isSymbolicLink()) {
                        if (!this._options.followLinks) {
                            this._numSoftLinks += 1;
                        }

                        this._getLinkChild(childPath, childStat, next);
                    }
                    else {
                        // Not a file, directory, nor link.
                        debug(`Path: '${childPath}' is neither a file, directory, nor link. Ignoring.`);
                        this._ignored += 1;
                        next();
                    }
                }
                else {
                    debug(`Failed to stat: '${childPath}' with error: ${err.code}.`);
                    this._errors += 1;
                    next();
                }
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
            const root = path.normalize(this.root);

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

                    this._traverse = null;
                    this._traversalStack = [];

                    resolve();
                }
            };

            this._traversalStack.push(root);
            runNext();
        });
    }

}

module.exports = IntegralScanner;
