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
        };

        this._rootPath = rootPath;
        this._queue = async.queue(this._traverse.bind(this), 1);

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

        getDirectoryStat(task.path, task.depth, taskDone);

        function getDirectoryStat(dirPath, depth, done) {
            fs.lstat(dirPath, (err, stat) => {
                if (!err) {
                    getDirectoryContents(dirPath, stat, depth, done);
                }
                else {
                    debug(`Failed stat path ${dirPath} with error: ${err.code}.`);
                    self._errors += 1;
                    done();
                }
            });
        }

        function getDirectoryContents(dirPath, dirStat, depth, done) {
            fs.readdir(dirPath, {}, (err, childPaths) => {
                if (!err) {
                    getDirectoryContentsStat(dirPath, dirStat, childPaths, depth, done);
                }
                else {
                    debug(`Failed enumerate path ${dirPath} with error: ${err.code}.`);
                    self._errors++;
                    done();
                }
            });
        }

        function getDirectoryContentsStat(dirPath, dirStat, childPaths, depth, done) {
            const contents = [];

            async.eachLimit(childPaths, self._options.numJobs,
                (childPath, nextChild) => {
                    const statPath = path.join(dirPath, childPath);

                    // Perform the stat.
                    fs.lstat(statPath, (err, stat) => {
                        let followingLink = false;

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
                            self._numDirectories += 1;
                            self._queue.push({ path: statPath, depth: depth + 1 });
                        }
                        // Count # of links, and follow the link to queue a task to traverse it.
                        else if (stat.isSymbolicLink()) {
                            if (self._options.followLinks) {
                                followingLink = true;
                            }
                            else {
                                self._numSoftLinks += 1;
                            }
                        }

                        // Package the path of the child and the stat information in an object.
                        // Flourish this with the linkedPath if it is a link.
                        const child = { path: statPath, stat: stat };

                        // If a link has to be resolved, it must be resolved BEFORE calling the
                        // next callback to avoid race conditions.
                        if (followingLink) {
                            resolveLink(statPath, (linkedPath, linkedStat) => {
                                // If the link is not broken, push it to the contents array.
                                if (linkedPath) {
                                    // If the link points to a directory, push that onto the queue.
                                    if (linkedStat.isDirectory()) {
                                        self._queue.push({ path: linkedPath, depth: depth });
                                        self._numDirectories += 1;
                                    }
                                    else if (linkedStat.isFile()) {
                                        self._numFiles += 1;
                                    }

                                    // Flourish the child content object with the link path.
                                    child.linkedPath = linkedPath;
                                    contents.push(child);
                                }
                                nextChild(null);
                            });
                        }
                        else {
                            contents.push(child);
                            nextChild(null);
                        }
                    });
                },
                (err) => {
                    if (!err) {
                        publish(dirPath, dirStat, contents, depth, done);
                    }
                    else {
                        done();
                    }
                });
        }

        function publish(dirPath, dirStat, contents, depth, done) {
            self.emit('directory', dirPath, dirStat, contents, depth);
            done();
        }

        function resolveLink(linkPath, cb, depth) {
            const currentDepth = depth || 0;

            // Do not recurse any further than the resursive maximum.
            if (currentDepth > BatchingTraverse.LINK_RECURSIVE_MAXIMUM) {
                debug('The link resursive maximum limit has been reached. Ignoring.');
                self._numIgnored += 1;
                return cb(null);
            }

            // Resolve the link.
            fs.readlink(linkPath, (err, linkedPath) => {
                if (!err) {
                    const resolvedPath = path.resolve(path.dirname(linkPath), linkedPath);

                    // Check the link resolves to a path external to the root path.
                    if (!resolvedPath.startsWith(self._rootPath)) {
                        // Stat the resolved path to determine and pass it out.
                        fs.lstat(resolvedPath, (statErr, stat) => {
                            if (!statErr) {
                                // The resolved path is another symbolic link. Follow it.
                                if (stat.isSymbolicLink()) {
                                    resolveLink(resolvedPath, cb, currentDepth + 1);
                                }
                                // The resolved path is a file or directory. We're done ehre.
                                else {
                                    cb(resolvedPath, stat);
                                }
                            }
                            else {
                                debug(`Cannot stat linked file: ${resolvedPath}.`);
                                self._errors += 1;
                                cb(null);
                            }
                        });
                    }
                    // Link resolves to a path within the root path. Ignore it to avoid cycles.
                    else {
                        debug(`Link at: ${linkPath} resolves to ${resolvedPath} which is a child of the root path.`);
                        self._numIgnored += 1;
                        cb(null);
                    }
                }
                // Failed to resolve the link.
                else {
                    debug(`Cannot follow link at path ${linkPath} due to error: ${err.code}.`);
                    self._errors += 1;
                    cb(null);
                }
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
