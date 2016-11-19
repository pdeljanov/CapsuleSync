'use strict';

const assert = require('assert');
const debug = require('debug')('capsule.fs.traverse');
const fs = require('fs');
const path = require('path');

const EventEmitter = require('events')
const FunctionQueue = require('./util/FunctionQueue.js');

module.exports =
class Traverse extends EventEmitter {

    constructor(path, options = {}){
        super();

        assert(typeof path, 'string', "Path must be a string.");
        assert(typeof options, 'object', 'Options must be an object.');

        this._options = {
            'followLinks': (options.followLinks || false ),
            'maxDepth': (options.maxDepth || 0),
            'retryAttempts': (options.retryAttempts || 1),
            'numJobs': (options.maxPending || 32)
        };

        this._path = path;
        this._queue = new FunctionQueue(this._options.numJobs);

        this._resetStats();
    }

    _resetStats(){
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
        this._endTime = null;
    }

    stats() {
        return {
            'running': (this._startTime !== null) && (this._endTime === null),
            'finished': (this._startTime !== null) && (this._endTime !== null),
            'files': this._numFiles,
            'directories': this._numDirectories,
            'softLinks': this._numSoftLinks,
            'hardLinks': this._numHardLinks,
            'ignored': this._numIgnored,
            'errors': this._errors,
            'totalSize': this._numBytes,
            'scanDateTime': this._startDate,
            'duration': (this._endTime - this._startTime)
        };
    }

    traverse(){
        const root = path.normalize(this._path);
        var self = this;

        // Reset stats to zero values.
        this._resetStats();

        // Record start date, and high precision timestamp.
        this._startDate = Date();
        this._startTime = performance.now();

        // Enqueue the root directory.
        this._queue.enqueue(getContents, root, 0);

        // Return a promise for when the traversal is complete.
        return new Promise((resolve, reject) => {
            this._queue.run().then(() => {
                this._endTime = performance.now();
                resolve();
            });
        });

        function getContents(root, depth, done){
            fs.readdir(root, {}, (err, children) => {
                if(!err){
                    children.forEach((child) => { self._queue.enqueue(getStat, path.join(root, child), depth); });
                }
                else {
                    debug(`Failed enumerate path ${path} with error: ${err.code}.`);
                    self._errors++;
                }
                done();
            });
        };

        function getStat(path, depth, done){
            fs.lstat(path, (err, stat) => {
                if(!err){
                    self._queue.enqueue(applyFilter, path, stat, depth);
                }
                else {
                    debug(`Failed to stat path ${path} with error: ${err.code}.`);
                    self._errors++;
                }
                done();
            });
        };

        function applyFilter(path, stat, depth, done){
            publish(path, stat, depth, done);
        };

        function publish(path, stat, depth, done){
            if(stat.isFile()) {
                self._numFiles++;
                self.emit('file', path, stat);
            }
            else if(stat.isDirectory()){
                self._queue.enqueue(getContents, path, depth + 1);
                self._numDirectories++;
                self.emit('directory', path, stat);
            }
            else if(stat.isSymbolicLink()){
                self._numSoftLinks++;

                if(self._options.followLinks){
                    self._queue.enqueue(followLink, path, depth);
                }

                self.emit('link', path, stat);
            }
            else {
                debug(`Ignoring the path ${path} which is neither a file nor directory.`);
                self._numIgnored++;
            }
            done();
        };

        function followLink(linkPath, depth, done){
            fs.readlink(linkPath, (err, linkedPath) => {
                if(!err){
                    // Do not recurse down a link if it resolves to a path that is
                    // a child of the root path.
                    var resolvedPath = path.resolve(path.dirname(linkPath), linkedPath);
                    if (!resolvedPath.startsWith(root)){
                        self._queue.enqueue(getStat, linkedPath, depth);
                    }
                    else {
                        debug(`Link at: ${linkPath} resolves to ${resolvedPath} which is a child of the root path.`);
                    }
                }
                else {
                    debug(`Cannot follow link at path ${resolvedPath} due to error: ${err.code}.`);
                    self._errors++;
                }
                done();
            });
        }

    }

    pause(){
        return this._queue.pause();
    }

    resume() {
        return this._queue.resume();
    }

    cancel(){
        return this._queue.cancel();
    }

}

// Traverse("/home/philip").on("path", (path, stat) => {}).on("file", (path, stat) => {})
