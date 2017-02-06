const assert = require('assert');
const debug = require('debug')('FileSystem.BatchingTraverse');

const fs = require('original-fs');
const path = require('path');
const async = require('async');

const Link = require('./Link.js');

/* global performance:true */

class CycleDetector {
    constructor() {
        this._adjaceny = {};
    }

    attempt(fromId, toId) {
        if (!this._adjaceny[toId]) {
            this._adjaceny[toId] = [fromId];
            return true;
        }
        const isNotCycle = (this._adjaceny[toId].indexOf(fromId) === -1);
        this._adjaceny[toId].push(fromId);
        return isNotCycle;
    }
}

class BatchingTraverse {

    constructor(root, options = {}) {
        assert(typeof root, 'string', 'RootPath must be a string.');
        assert(typeof options, 'object', 'Options must be an object.');

        this.root = root;

        this._options = {
            followLinks:       (options.followLinks || false),
            numJobs:           (options.numJobs || 8),
            progressInterval:  (options.progressInterval || 0),
            junctionDetection: false,
        };

        this._queue = async.queue(this._traverse.bind(this), 1);

        this.directory = (dp, ds, c, d, done) => { done(); };
        this.progress = () => {};

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

    traverse() {
        const root = path.normalize(this.root);

        // Reset stats to zero values.
        this._resetStats();

        // Record start date, and high precision timestamp.
        this._startDate = Date();
        this._startTime = performance.now();
        this._hardCycle = new CycleDetector();
        this._softCycle = new CycleDetector();

        // Return a promise for when the traversal is complete.
        return new Promise((resolve, reject) => {
            if (this._options.progressInterval) {
                this._progressInterval = setInterval(() => {
                    this.progress(this.stats());
                }, this._options.progressInterval);
            }

            this._queue.error =
            this._queue.drain = (err) => {
                clearInterval(this._progressInterval);
                this._progressInterval = null;

                this._endTime = performance.now();
                this._endDate = Date();
                this._hardCycle = null;
                this._softCycle = null;

                this.progress(this.stats());

                if (!err) {
                    resolve();
                }
                else {
                    reject();
                }
            };

            this._queue.push({ path: root, depth: 0 });
        });
    }

    _traverse(task, taskDone) {
        const self = this;

        function publish(dirPath, dirStat, contents, depth, done) {
            self.directory(dirPath, dirStat, contents, depth, done);
        }

        function getDirectoryContentsStat(dirPath, dirStat, childPaths, depth, done) {
            const contents = [];

            async.eachLimit(childPaths, self._options.numJobs, (childPath, nextChild) => {
                const statPath = path.join(dirPath, childPath);

                // Perform the stat.
                fs.lstat(statPath, (err, stat) => {
                    // If there is an error while stating, ignore it.
                    if (err) {
                        debug(`Failed to stat: ${path} with error: ${err.code}.`);
                        self._errors += 1;
                        return nextChild(null);
                    }

                    // Count # of files and total byteLength.
                    if (stat.isFile()) {
                        self._numFiles += 1;
                        self._numBytes += stat.size;
                    }
                    // Count # of directories, and queue a task to travese into it.
                    else if (stat.isDirectory()) {
                        self._queue.push({ path: statPath, depth: depth + 1 });
                    }
                    // Count # of links, and follow the link to queue a task to traverse it.
                    else if (stat.isSymbolicLink()) {
                        if (!self._options.followLinks) {
                            self._numSoftLinks += 1;
                        }
                    }
                    // Not a file, directory, nor link.
                    else {
                        debug(`Path: ${statPath} is neither a file, directory, nor link. Ignoring.`);
                        self._ignored += 1;
                        return nextChild(null);
                    }

                    // Package the path of the child and the stat information in an object.
                    // Flourish this with the linkedPath if it is a link.
                    const child = { path: statPath, stat: stat };

                    // If not a link, no further processing is required.
                    if (!stat.isSymbolicLink()) {
                        contents.push(child);
                        return nextChild(null);
                    }

                    // If this is a link, it must be resolved BEFORE calling the
                    // next callback to avoid race conditions.
                    Link.resolve(statPath).then((link) => {
                        // If following links...
                        if (self._options.followLinks) {
                            // If a cycle is detected, ignore it.
                            if (!self._softCycle.attempt(stat.ino, link.linkedStat.ino)) {
                                debug(`Link cycle: ${statPath} -> ${link.linkedPath} detected. Ignoring further recursion.`);
                                self._errors += 1;
                            }
                            // If a directory is linked, push the linked path to the work queue.
                            else if (link.linkedStat.isDirectory()) {
                                self._queue.push({ path: statPath, depth: depth });
                                child.stat = link.linkedStat;
                                contents.push(child);
                            }
                            // If a file is linked, count the file and swap stat information.
                            else if (link.linkedStat.isFile()) {
                                self._numFiles += 1;
                                self._numBytes += link.linkedStat.size;
                                child.stat = link.linkedStat;
                                contents.push(child);
                            }
                            // Neither a file nor directory, therefore ignore.
                            else {
                                debug(`Linked: ${link.linkedPath} is neither a file, or directory. Ignoring.`);
                                self._ignored += 1;
                            }
                        }
                        // If not following links. Append the linkedPath to the child
                        // content.
                        else {
                            child.linkedPath = link.linkedPath;
                            contents.push(child);
                        }
                        nextChild(null);
                    })
                    .catch((error) => {
                        debug(`Failed to resolve link: ${statPath} due to error: ${error.code}.`);
                        // TODO: Handle ELOOP errors. When not following symlinks, these
                        // links should be faithfully represented.
                        self._errors += 1;
                        nextChild(null);
                    });

                    return null;
                });
            },
            (err) => {
                if (!err) {
                    return publish(dirPath, dirStat, contents, depth, done);
                }
                return done();
            });
        }

        function getDirectoryContents(dirPath, dirStat, depth, done) {
            fs.readdir(dirPath, {}, (err, childPaths) => {
                if (!err) {
                    return getDirectoryContentsStat(dirPath, dirStat, childPaths, depth, done);
                }

                debug(`Failed enumerate: ${dirPath} with error: ${err.code}.`);
                self._errors += 1;
                return done();
            });
        }

        // getDirectoryStat retrieves the stat information for the directory to traverse. A stat is
        // always used here instead of lstat because if we are following links, we must maintain
        // a consistent path from the root and if we used the resolved link path we would lose that.
        // If links are not being followed, then the link would never be added to the path queue
        // because we aren't following them.
        function getDirectoryStat(dirPath, depth, done) {
            fs.stat(dirPath, (err, stat) => {
                if (!err) {
                    // Hardlink cycle protection for Windows.
                    //
                    // If a directory has an nlink > 1, this implies that it has been hardlinked.
                    // Use the cycle detector to record when an inode with nlink > 1 has been visited.
                    // Since there is no "from" inode, we will substitute 0 in its place. This will
                    // effectively only allow a directory to be seen once.
                    //
                    // Future revisions may wish to check the FILE_ATTRIBUTE_REPARSE_POINT attribute
                    // on Windows specifically. Linux and OSX does not allow creation of hardLinks
                    // that cause cycles.
                    if (self._options.junctionDetection && stat.nlink > 1) {
                        if (!this._hardCycle.attempt(0, stat.ino)) {
                            debug(`Hard link cycle at ${dirPath}. Ignoring further recursion.`);
                            self._errors += 1;
                            return done();
                        }
                    }

                    self._numDirectories += 1;
                    return getDirectoryContents(dirPath, stat, depth, done);
                }

                debug(`Failed stat: ${dirPath} with error: ${err.code}.`);
                self._errors += 1;
                return done();
            });
        }

        return getDirectoryStat(task.path, task.depth, taskDone);
    }

    pause() {
        this._queue.pause();
    }

    resume() {
        this._queue.resume();
    }

    cancel() {
        this._queue.kill();
    }
}

BatchingTraverse.LINK_RECURSIVE_MAXIMUM = 8;

module.exports = BatchingTraverse;
