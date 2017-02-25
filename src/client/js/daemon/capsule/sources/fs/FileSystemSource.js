const debug = require('debug')('Capsule.Sources.FileSystem.FileSystemSource');
const fs = require('original-fs');

const Errors = require('../../../Errors.js');
const Source = require('../Source.js');
const PathTools = require('../../../fs/PathTools.js');
const PathStack = require('./PathStack.js');
const IntegralScanner = require('./IntegralScanner.js');
const DeltaScanner = require('./DeltaScanner.js');
const DifferenceEngine = require('./DifferenceEngine.js');
const Watcher = require('./Watcher.js');
const ExclusionSet = require('../../ExclusionSet.js');
const { FilterSet } = require('../../FilterSet.js');
const { CapsuleEntry } = require('../../CapsuleEntry.js');

class FileSystemSource extends Source {

    constructor(id, root, options) {
        super(id);

        this._root = PathTools.normalize(root);
        this._watcher = null;
        this._lastScan = null;
        this._runningScans = [];

        this._options = {
            followLinks: (options && Object.prototype.hasOwnProperty.call(options, 'followLinks')) ?
                options.followLinks : true,
        };

        this._filters = FilterSet.empty();
        this._exclusions = ExclusionSet.empty();
    }

    load() {
        debug(`[${this._id}] Loading FileSystemSource`);

        return new Promise((resolve, reject) => {
            debug(`[${this._id}] Checking source path '${this._root}' exists...`);

            // Check to see if the directory exists.
            fs.stat(this._root, (err) => {
                // Error if the root does not exist.
                if (err && err.code === 'ENOENT') {
                    debug(`[${this._id}] Source path does not exist.`);
                    reject(Errors.PATH_DOES_NOT_EXIST);
                }
                // Error if the permissions prevent access to the root.
                else if (err && err.code === 'EACCES') {
                    debug(`[${this._id}] Access denied to source path.`);
                    reject(Errors.ACCESS_DENIED);
                }
                // Loaded successfully.
                else {
                    debug(`[${this._id}] Source path exists!`);
                    debug(`[${this._id}] FileSystemSource loaded successfully!`);

                    // Complete the load.
                    resolve();

                    // Check if there was an initial scan in a new thread to allow the load thread
                    // to complete.
                    process.nextTick(() => {
                        if (this._lastScan === null) {
                            debug(`[${this._id}] Source has never been scanned before.`);
                            this.emit('initialScan');
                        }
                        else {
                            debug(`[${this._id}] Source was last scanned ${this._lastScan}.`);
                            this.emit('deltaScan');
                        }
                    });
                }
            });
        });
    }

    unload() {
        debug(`[${this._id}] Unloading FileSystemSource...`);
        return this.cancelAllScans()
            .then(() => this.stopWatch())
            .then(() => {
                debug(`[${this._id}] FileSystemSource unloaded successfully!`);
            });
    }

    get lastScan() {
        return this._lastScan;
    }

    get filters() {
        return this._filters;
    }

    filter(filters) {
        this._filters = filters;
        this.emit('deltaScan', { forceDirectoryContents: true });
    }

    get exclusions() {
        return this._exclusions;
    }

    exclude(exclusions) {
        this._exclusions = exclusions;
        this.emit('deltaScan', { forceDirectoryContents: true });
    }

    startWatch(tree) {
        debug(`[${this._id}] Starting notification service...`);

        // Create a watcher to monitor for change events.
        this._watcher = new Watcher(this._root);

        // On-change notification, run the difference engine on each changed path.
        this._watcher.change = (fullPaths) => {
            const options = {
                directoryContents: DifferenceEngine.DirectoryContents.BOTH,
                followLinks:       this._options.followLinks,
                filter:            entry => this._filters.evaluate(entry),
                exclude:           fullPath => this._exclusions.evaluate(fullPath),
            };

            // Create a difference engine that will be used for all watch notifications.
            const diff = new DifferenceEngine(tree, this._root, options);

            function removePrefixed(prefix) {
                while (fullPaths.length > 0 && fullPaths[0].startsWith(prefix)) {
                    fullPaths.shift();
                }
            }

            // Hacky, hack...
            function removeIfNext(fullPath) {
                while (fullPaths.length > 0 && fullPaths[0] === fullPath) {
                    fullPaths.shift();
                }
            }

            function executeDiff(fullPath, done) {
                // Run the difference engine on the path.
                diff.path(new PathStack(), fullPath, () => {
                    // Convert the changes from watcher changes to source changes. Prune the list is required.
                    const changes = diff.changes().map((change) => {
                        // Updates become an upsert.
                        if (change.operation === DifferenceEngine.Change.UPDATE) {
                            removeIfNext(change.fullPath);
                            return { action: Source.Actions.UPSERT, entry: change.entry };
                        }
                        // Remove is recursive, so skip paths that are prefixed with the removed path.
                        else if (change.operation === DifferenceEngine.Change.REMOVE) {
                            removePrefixed(change.fullPath);
                            return { action: Source.Actions.REMOVE, path: change.relativePath };
                        }
                        // Add is an upser for files and links, but recursive for directories.
                        else if (change.operation === DifferenceEngine.Change.ADD) {
                            removePrefixed(change.fullPath);
                            // Since directory adds are recursive, skip paths that are prefixed with the added path.
                            if (change.entry.type === CapsuleEntry.Type.DIRECTORY) {
                                return { action: Source.Actions.SCAN, at: change.fullPath };
                            }
                            return { action: Source.Actions.UPSERT, entry: change.entry };
                        }
                        return {};
                    });
                    // Clear the difference engine's change list.
                    diff.clear();
                    // Return the changes.
                    done(changes);
                });
            }

            function processPaths(done) {
                const changes = [];
                (function iteration() {
                    const fullPath = fullPaths.shift();
                    if (fullPath) {
                        executeDiff(fullPath, (additionalChanges) => {
                            changes.push(additionalChanges);
                            iteration();
                        });
                    }
                    else {
                        done([].concat(...changes));
                    }
                }());
            }

            processPaths(this.emit.bind(this, 'change'));
        };

        // Load the watcher.
        this._watcher.load()
            .then(() => {
                debug(`[${this._id}] Notification service started!`);
            })
            .catch(() => {
                debug(`[${this._id}] Notification service failed to start. Falling back to periodic scanning.`);
                this._watcher = null;
            });
    }

    stopWatch() {
        if (this._watcher) {
            debug(`[${this._id}] Stopping notification service...`);
            return this._watcher.unload().then(() => {
                this.watcher = null;
                debug(`[${this._id}] Stopped notification service!`);
            });
        }
        return Promise.resolve();
    }

    _scanStarted(scanner, coverage) {
        this._runningScans.push(scanner);
        this.emit('scanStarted', coverage);
    }

    _scanFinished(scanner, coverage) {
        this._runningScans.splice(this._runningScans.indexOf(scanner), 1);
        if (coverage === Source.ScanCoverage.FULL) {
            const currentDate = Date();
            this._lastScan = currentDate;
        }
        this.emit('scanFinished', coverage);
    }

    cancelAllScans() {
        return new Promise((resolve) => {
            const listener = () => {
                if (this._runningScans.length === 0) {
                    this.removeListener('scanFinished', listener);
                    debug(`[${this._id}] Scan(s) successfully cancelled!`);
                    resolve();
                }
            };

            if (this._runningScans.length === 0) {
                resolve();
            }
            else {
                debug(`[${this._id}] Cancelling all (${this._runningScans.length}) running scan(s)...`);
                this._runningScans.forEach(scanner => scanner.cancel());
                this.on('scanFinished', listener);
            }
        });
    }

    integral(insert, commit, progress) {
        // Options for the Integral scanner.
        const options = {
            followLinks:      this._options.followLinks,
            progressInterval: 500,
        };

        const integral = new IntegralScanner(this._root, options);

        integral.progress = progress || (() => {});
        integral.insert = insert;
        integral.commit = commit;
        integral.filter = entry => this._filters.evaluate(entry);
        integral.exclude = fullPath => this._exclusions.evaluate(fullPath);

        this._scanStarted(integral, Source.ScanCoverage.FULL);
        return integral.run()
            .then(() => {
                this._scanFinished(integral, Source.ScanCoverage.FULL);
            })
            .catch((err) => {
                this._scanFinished(integral, Source.ScanCoverage.PARTIAL);
                return Promise.reject(err);
            });
    }

    delta(tree, options, upsert, remove, commit, progress) {
        // Options for the Delta scanner.
        const deltaOptions = {
            forceDirectoryContents: (options && options.forceDirectoryContents) || false,
            followLinks:            this._options.followLinks,
            progressInterval:       500,
        };

        const delta = new DeltaScanner(this._root, tree, deltaOptions);

        delta.progress = progress || (() => {});
        delta.upsert = upsert;
        delta.remove = remove;
        delta.commit = commit;
        delta.filter = entry => this._filters.evaluate(entry);
        delta.exclude = fullPath => this._exclusions.evaluate(fullPath);

        const path = (options && options.at) || null;
        const type = (!path || path === this._root) ? Source.ScanCoverage.FULL : Source.ScanCoverage.PARTIAL;

        this._scanStarted(delta, type);
        return delta.run(path)
            .then(() => {
                this._scanFinished(delta, type);
            })
            .catch((err) => {
                this._scanFinished(delta, Source.ScanCoverage.PARTIAL);
                return Promise.reject(err);
            });
    }

    serialize() {
        return super.serialize(FileSystemSource.TYPE_IDENTIFIER, {
            root:     this._root,
            lastScan: this._lastScan || null,
            options:  { followLinks: this._options.followLinks },
        });
    }

    static deserialize(serialized) {
        const source = new FileSystemSource(serialized.id, serialized.derived.root, serialized.derived.options);
        source._lastScan = serialized.derived.lastScan || null;
        return source;
    }
}

FileSystemSource.TYPE_IDENTIFIER = 'fs-1';

module.exports = FileSystemSource;
