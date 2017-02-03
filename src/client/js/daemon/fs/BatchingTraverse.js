const assert = require('assert');
const debug = require('debug')('FS.BatchingTraverse');

const fs = require('original-fs');
const path = require('path');
const async = require('async');

const EventEmitter = require('events');

class BatchingTraverse extends EventEmitter {

    constructor(rootPath, options = {}) {
        super();

        assert(typeof rootPath, 'string', 'RootPath must be a string.');
        assert(typeof options, 'object', 'Options must be an object.');

        this._options = {
            followLinks:      (options.followLinks || false),
            maxDepth:         (options.maxDepth || 0),
            // retryAttempts:  (options.retryAttempts || 1),
            numJobs:          (options.numJobs || 8),
            progressInterval: (options.progressInterval || 0),
            cycleProtection:  false,
        };

        this._rootPath = rootPath;
        this._queue = async.queue(this._traverse.bind(this), 1);

        this.directory = (dp, ds, c, d, done) => { done(); };

        this._resetStats();
    }

    _resetStats() {
        // Traversal statistics.
        this._numPaths = 0;
        this._numFiles = 0;
        this._numDirectories = 0;
        this._numSoftLinks = 0;
        this._numHardLinks = 0;
        this._numIgnored = 0;
        this._numBytes = 0;
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
            hardLinks:     this._numHardLinks,
            ignored:       this._numIgnored,
            errors:        this._errors,
            totalSize:     this._numBytes,
            startDateTime: this._startDate,
            endDateTime:   this._endDate,
            duration:      (this._endTime || performance.now()) - this._startTime
        };
    }

    traverse() {
        const root = path.normalize(this._rootPath);

        // Reset stats to zero values.
        this._resetStats();

        // Record start date, and high precision timestamp.
        this._startDate = Date();
        this._startTime = performance.now();
        this._hardLinked = {};
        this._softLinked = {};

        // Return a promise for when the traversal is complete.
        return new Promise((resolve, reject) => {
            if (this._options.progressInterval) {
                this._progressInterval = setInterval(() => { this.emit('progress', this.stats()); }, this._options.progressInterval);
            }

            this._queue.error =
            this._queue.drain = (err) => {
                clearInterval(this._progressInterval);
                this._progressInterval = null;

                this._endTime = performance.now();
                this._endDate = Date();
                this._hardLinked = {};
                this._softLinked = {};

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

        return getDirectoryStat(task.path, task.depth, taskDone);

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
                    // Use the inode number to maintain a visit count, and when the count reaches 2,
                    // skip the directory to prevent a cycle.
                    //
                    // Future revisions may wish to check the FILE_ATTRIBUTE_REPARSE_POINT attribute
                    // on Windows specifically. Linux and OSX does not allow creation of hardLinks
                    // that cause cycles.
                    if (self._options.cycleProtection && stat.nlink > 1) {
                        self._numHardLinks += 1;
                        if (!self._hardLinked[stat.ino]) {
                            self._hardLinked[stat.ino] = 0;
                        }
                        self._hardLinked[stat.ino] += 1;
                        if (self._hardLinked[stat.ino] >= 2) {
                            debug(`Cycle detected at ${dirPath}. Ignoring further recursion.`);
                            self._ignored += 1;
                            return done();
                        }
                    }

                    self._numDirectories += 1;
                    return getDirectoryContents(dirPath, stat, depth, done);
                }

                debug(`Failed stat path ${dirPath} with error: ${err.code}.`);
                self._errors += 1;
                return done();
            });
        }

        function getDirectoryContents(dirPath, dirStat, depth, done) {
            fs.readdir(dirPath, {}, (err, childPaths) => {
                if (!err) {
                    return getDirectoryContentsStat(dirPath, dirStat, childPaths, depth, done);
                }

                debug(`Failed enumerate path ${dirPath} with error: ${err.code}.`);
                self._errors += 1;
                return done();
            });
        }

        function getDirectoryContentsStat(dirPath, dirStat, childPaths, depth, done) {
            const contents = [];

            async.eachLimit(childPaths, self._options.numJobs,
                (childPath, nextChild) => {
                    const statPath = path.join(dirPath, childPath);

                    // Perform the stat.
                    fs.lstat(statPath, (err, stat) => {
                        // If there is an error while stating, ignore it.
                        if (err) {
                            debug(`Failed to stat path ${path} with error: ${err.code}.`);
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

                        // Package the path of the child and the stat information in an object.
                        // Flourish this with the linkedPath if it is a link.
                        const child = { path: statPath, stat: stat };

                        // If a link has to be resolved, it must be resolved BEFORE calling the
                        // next callback to avoid race conditions.
                        if (stat.isSymbolicLink()) {
                            // Resolve the link.
                            return resolveLink(statPath, stat, (resolveErr, linkedPath, linkedStat) => {
                                // Only further process the link if there was no resolution error.
                                if (!resolveErr) {
                                    // If following links...
                                    if (self._options.followLinks) {
                                        // And the link points to a directory, push the path of the
                                        // link to the queue. It will be resolved by the directory
                                        // fstat.
                                        if (linkedStat.isDirectory()) {
                                            self._queue.push({ path: statPath, depth: depth });
                                        }
                                        // Or if the link is a file, count the file and swap the
                                        // stat information.
                                        else if (linkedStat.isFile()) {
                                            child.stat = linkedStat;
                                            self._numFiles += 1;
                                            self._numBytes += linkedStat.size;
                                        }
                                    }
                                    // If not following links. Append the linkedPath to the child
                                    // content.
                                    else {
                                        child.linkedPath = linkedPath;
                                    }

                                    // TODO: Handle ELOOP errors. When not following symlinks, these
                                    // links should be faithfully represented.

                                    // Push the child content to the contents array.
                                    contents.push(child);
                                }
                                nextChild(null);
                            });
                        }

                        // Not following link, so just push the child content.
                        contents.push(child);
                        return nextChild(null);
                    });
                },
                (err) => {
                    if (!err) {
                        return publish(dirPath, dirStat, contents, depth, done);
                    }
                    return done();
                });
        }

        function publish(dirPath, dirStat, contents, depth, done) {
            self.directory(dirPath, dirStat, contents, depth, done);
        }

        function resolveLink(linkPath, linkStat, cb) {
            // Resolve the link.
            fs.readlink(linkPath, (readLinkErr, linkedPath) => {
                // Failed to resolve the link.
                if (readLinkErr) {
                    debug(`Cannot follow link due to error: ${readLinkErr.code}`);
                    self._errors += 1;
                    return cb(true);
                }

                // When following links, it is possible to get into a situation whereby a link
                // in a directory points directly or indirectly to the directory that contains it.
                // This will NOT be caught by the following fs.stat because it will resolve to the
                // directory until we traverse far enough to hit the symlink maximum. Therefore,
                // cycle protection is implemeneted using a "visited" object. If a link (identified)
                // by its inode is visited more than once, raise an error to break the cycle.
                // Since this error can only occur when following links, only provide this cycle
                // protection when following links.
                if (self._options.followLinks) {
                    if (!self._softLinked[linkStat.ino]) {
                        self._softLinked[linkStat.ino] = 0;
                    }

                    self._softLinked[linkStat.ino] += 1;

                    if (self._softLinked[linkStat.ino] >= 2) {
                        debug(`Cycle detected at ${linkPath}. Ignoring further recursion.`);
                        self._errors += 1;
                        return cb(true);
                    }
                }

                // Stat the link to get information about the file the link(s) points to.
                return fs.stat(linkPath, (statErr, linkedStat) => {
                    if (statErr) {
                        debug(`Cannot stat linked file: ${linkedPath} due to error: ${statErr.code}.`);
                        self._errors += 1;
                        return cb(true);
                    }
                    return cb(null, linkedPath, linkedStat);
                });
            });
        }
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
