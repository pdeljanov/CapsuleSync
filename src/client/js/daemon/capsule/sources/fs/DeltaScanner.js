const debug = require('debug')('Capsule.Sources.FileSystem.DeltaScanner');

const Errors = require('../../../Errors.js');
const PathTools = require('../../../fs/PathTools.js');
const PathStack = require('./PathStack.js');
const IntegralScanner = require('./IntegralScanner.js');
const DifferenceEngine = require('./DifferenceEngine.js');
const { CapsuleEntry } = require('../../CapsuleEntry.js');

/* global performance:true */

class DeltaScanner {
    constructor(root, tree, options) {
        this._root = root;
        this._tree = tree;
        this._isRunning = false;
        this._isCancelled = false;

        this._options = {
            forceDirectoryContents: (options.forceDirectoryContents || false),
            followLinks:            (options.followLinks || false),
            concurrency:            (options.concurrency || 8),
            progressInterval:       (options.progressInterval || 0),
            junctionDetection:      false,
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

    _error() {
        this._errors += 1;
    }

    _ignore() {
        this._numIgnored += 1;
    }

    _update(fullPath, entry, done) {
        this.upsert(entry);
        return done();
    }

    _removeCount(type) {
        switch (type) {
        case CapsuleEntry.Type.FILE:
            this._removedFiles += 1;
            break;
        case CapsuleEntry.Type.DIRECTORY:
            this._removedDirectories += 1;
            break;
        case CapsuleEntry.Type.LINK:
            this._removedSoftLinks += 1;
            break;
        default:
            break;
        }
    }

    _remove(fullPath, relativePath, type, done) {
        this._removeCount(type);
        this.remove(relativePath);
        return done();
    }

    _add(path, entry, done) {
        switch (entry.type) {
        case CapsuleEntry.Type.FILE:
            return this._addFile(entry, done);
        case CapsuleEntry.Type.DIRECTORY:
            return this._addDirectory(path, entry, done);
        case CapsuleEntry.Type.LINK:
            return this._addUnfollowedSymlink(entry, done);
        default:
            return done();
        }
    }

    _addFile(entry, done) {
        this._addedFiles += 1;
        this.upsert(entry);
        done();
    }

    _addDirectory(path, entry, done) {
        const adjustedRoot = PathTools.stripRoot(path, this._root);

        const scanner = new IntegralScanner(path, this._options);

        scanner.insert = (scannedEntry) => {
            scannedEntry.path = PathTools.appendRoot(adjustedRoot, scannedEntry.path);
            this.upsert(scannedEntry);
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

        return scanner.run(this._stack)
            .then(done)
            .catch(() => {
                debug(`Failed to scan: '${path}'.`);
                done();
            });
    }

    _addUnfollowedSymlink(entry, done) {
        this._addedSoftLinks += 1;
        this.upsert(entry);
        return done();
    }

    _initialScan(fullPath) {
        return new Promise(resolve => this._addDirectory(fullPath, null, resolve));
    }

    _scanSubTree(subTreePath) {
        // Setup DifferenceEngine options.
        const options = {
            forceDirectoryContents: this._options.forceDirectoryContents,
            directoryContents:      DifferenceEngine.DirectoryContents.ADDED,
            followLinks:            this._options.followLinks,
            concurrency:            this._options.concurrency,
            exclude:                this.exclude.bind(this),
            filter:                 this.filter.bind(this),
            add:                    this._add.bind(this),
            remove:                 this._remove.bind(this),
            update:                 this._update.bind(this),
            error:                  this._error.bind(this),
            ignore:                 this._ignore.bind(this),
        };

        const diff = new DifferenceEngine(this._tree, this._root, options);

        const relativeSubTreePath = PathTools.stripRoot(subTreePath, this._root);

        // Scan the tree out of the database and perform the difference operation.
        return this._tree.scanSubTree(relativeSubTreePath, (data, next) => {
            if (this._isCancelled) {
                return next(Errors.CANCELLED);
            }

            const relativePath = data.key;
            const fullPath = PathTools.appendRoot(this._root, relativePath);
            const entry = CapsuleEntry.deserialize(relativePath, data.value);

            this._scanned += 1;

            // If the current path is prefixed with the last previously deleted directory path,
            // may be safely skipped as it would be considered deleted.
            if (this._lastRemovedPrefix && fullPath.startsWith(this._lastRemovedPrefix)) {
                this._removeCount(entry.type);
                return next();
            }

            // Run the difference engine on the entry.
            return diff.entry(this._stack, fullPath, entry, next);
        })
        // Database scanning complete. If nothing was scanned out, that means the database wasn't populated.
        // Manually add the root directory in that case which will trigger a full scan.
        .then(() => (this._scanned === 0 ? this._initialScan(subTreePath) : Promise.resolve()));
    }

    get isRunning() {
        return this._isRunning;
    }

    get wasCancelled() {
        return this._isCancelled;
    }

    cancel() {
        this._isCancelled = true;
    }

    run(fullPath) {
        const subTreePath = fullPath || this._root;

        this._stack = new PathStack();
        this._startStats();

        return this._stack.navigateTo(subTreePath, this._root)
            .then(() => this._scanSubTree(subTreePath))
            .catch((err) => {
                this._endStats();
                this._stack = null;
                return Promise.reject(err);
            })
            .then(() => {
                this._endStats();
                this._stack = null;
                return Promise.resolve();
            });
    }

}

module.exports = DeltaScanner;
