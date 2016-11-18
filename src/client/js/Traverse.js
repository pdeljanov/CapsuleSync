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
            'followLinks': (options.followLinks || false );
            'maxDepth': (options.maxDepth || 0),
            'retryAttempts': (options.retryAttempts || 1);
            'numJobs': (option.maxPending || 16);
        };

        this._path = path;

        // Traversal statistics.
        this._numPaths = 0;
        this._numFiles = 0;
        this._numDirectories = 0;
        this._numSoftLinks = 0;
        this._numHardLinks = 0;
        this._numIgnored = 0;
        this._numBytes = 0;
        this._errors = 0;

        this._startTime = null;
        this._endTime = null;

        this._queue = new FunctionQueue(this._options.numJobs);
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
            'totalSize': this._numBytes
        };
    }

    traverse(){
        const root = path.normalize(this._path);
        var depth = 0;

        enqueue(getContents, [root, depth]);

        return this._queue.run();

        getContents(path, depth, done){
            fs.readdir(path, {}, (err, paths) => {
                if(!err){
                    paths.forEach((path) => { enqueue(getStat, [path, depth]); });
                }
                else {
                    debug(`Failed enumerate path ${path} with error: ${err.code}.`);
                    this._errors++;
                }
                done();
            });
        };

        getStat(path, depth, done){
            fs.lstat(path, (err, stat) = {
                if(!err){
                    enqueue(applyFilter, [path, stat, depth]);
                }
                else {
                    debug(`Failed to stat path ${path} with error: ${err.code}.`);
                    this._errors++;
                }
                done();
            });
        };

        applyFilter(path, stat, depth, done){
            enqueue(publish, [path, stat, depth]);
            done();
        };

        publish(path, stat, depth, done){
            if(stat.isFile()) {
                this._numFiles++;
                this.emit('file', path, stat);
            }
            else if(stat.isDirectory()){
                enqueue(getContents, [path], depth + 1);
                this._numDirectories++;
                this.emit('directory', path, stat);
            }
            else if(stat.isSymbolicLink()){
                this._numSoftLinks++;

                if(this._options.followLinks){
                    enqueue(followLink, [path, depth]);
                }

                this.emit('link', path, stat);
            }
            else {
                debug(`Ignoring the path ${path} which is neither a file nor directory.`);
                this._numIgnored++;
            }
            done();
        };

        followLink(path, depth, done){
            fs.readlink(path, (err, linkPath) => {
                if(!err){
                    // Do not recurse down a link if it resolves to a path that is
                    // a child of the root path.
                    var resolvedPath = path.normalize(path.resolve(root, linkPath));
                    if (!resolvedPath.startsWith(root)){
                        enqueue(getStat, [linkPath, depth]);
                    }
                    else {
                        debug(`Link at: ${path} resolves to ${linkPath} which is a child of the root path.`);
                    }
                }
                else {
                    debug(`Cannot follow link at path ${path} due to error: ${err.code}.`);
                    this._errors++;
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
