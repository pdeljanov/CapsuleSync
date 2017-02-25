const debug = require('debug')('Capsule.Dispatcher');

const Source = require('./sources/Source.js');

class Dispatcher {

    constructor(clock) {
        this.sources = [];
        this._listeners = {};
        this._clock = clock;
        this._queuedScans = [];
        this._activeScan = null;
    }

    addSource(tree, source) {
        // Append the newly loaded source to the sources list.
        this.sources.push(source);

        this._listeners[source.id] = {
            initialScan: this.dispatch.bind(this, Dispatcher.Events.INITIAL_SCAN, tree, source),
            deltaScan:   this.dispatch.bind(this, Dispatcher.Events.DELTA_SCAN, tree, source),
            change:      this.dispatch.bind(this, Dispatcher.Events.CHANGE_NOTIFICATION, tree, source),
        };

        // Attach event listeners.
        source.on('initialScan', this._listeners[source.id].initialScan);
        source.on('deltaScan', this._listeners[source.id].deltaScan);
        source.on('change', this._listeners[source.id].change);

        // Load the source.
        return source.load()
            .then(() => source.startWatch(tree))
            .catch((err) => {
                // If there is an error loading the source, remove it and re-throw the error.
                this.removeSource(source);
                return Promise.reject(err);
            });
    }

    removeSource(removedSource) {
        let cancellation = Promise.resolve();

        this.sources = this.sources.filter((source) => {
            if (source.id === removedSource.id) {
                // Remove listeners from source.
                source.removeListener('initialScan', this._listeners[source.id].initialScan);
                source.removeListener('deltaScan', this._listeners[source.id].deltaScan);
                source.removeListener('change', this._listeners[source.id].change);
                // Remove queued scans.
                this._queuedScans = this._queuedScans.filter(scan => scan.source !== removedSource);
                // Remove listeners from registry.
                delete this._listeners[source.id];
                // Store the cancellation token;
                cancellation = removedSource.cancelAllScans();
                // Filtering out of source array.
                return false;
            }
            // Keep in source array.
            return true;
        });

        return cancellation.then(() => removedSource.unload());
    }

    dispatch(eventType, tree, source, data) {
        switch (eventType) {
        case Dispatcher.Events.INITIAL_SCAN:
            this._dispatchInitialScan(tree, source);
            break;
        case Dispatcher.Events.DELTA_SCAN:
            this._dispatchDeltaScan(tree, source, data);
            break;
        case Dispatcher.Events.CHANGE_NOTIFICATION:
            this._dispatchChangeNotification(tree, source, data);
            break;
        default:
            break;
        }
    }

    _crankQueue() {
        if (!this._activeScan && this._queuedScans.length > 0) {
            this._activeScan = this._queuedScans.pop();

            // Run scanner on new thread.
            process.nextTick(() => {
                const time = this._clock.vector;
                this._clock.advance();

                // Perform the scan.
                this._activeScan.scanner(time)
                    // Catch errors and print a message.
                    .catch((err) => {
                        debug(`Dispatch failed with error: ${err}.`);
                    })
                    // Once complete, reset the active scan and crank the queue.
                    .then(() => {
                        this._activeScan = null;
                        this._crankQueue();
                    });
            });
        }
    }

    _dispatchInitialScan(tree, source) {
        this._queuedScans.push({
            source:  source,
            tree:    tree,
            scanner: Dispatcher._initialScan.bind(null, tree, source),
        });
        this._crankQueue();
    }

    _dispatchDeltaScan(tree, source, options) {
        this._queuedScans.push({
            source:  source,
            tree:    tree,
            scanner: Dispatcher._deltaScan.bind(null, tree, source, options),
        });
        this._crankQueue();
    }

    _dispatchChangeNotification(tree, source, changes) {
        this._queuedScans.push({
            source:  source,
            tree:    tree,
            scanner: Dispatcher._change.bind(null, tree, source, changes),
        });
        this._crankQueue();
    }

    static _change(tree, source, changes, time) {
        const futures = changes.map((change) => {
            switch (change.action) {
            case Source.Actions.UPSERT:
                debug(`Change Notification: Upsert '${change.entry.path}'.`);
                change.entry.modify(time);
                return tree.put(change.entry.path, change.entry.serialize());
            case Source.Actions.REMOVE:
                debug(`Change Notification: Remove '${change.path}'.`);
                return tree.delSubTree(change.path);
            case Source.Actions.SCAN:
                debug(`Change Notification: Scan '${change.at}'.`);
                return Dispatcher._deltaScan(tree, source, change, time);
            default:
                debug(`Unknown change notification received. Action=${change.action}.`);
                return Promise.resolve();
            }
        });
        return Promise.all(futures);
    }

    static _initialScan(tree, source, time) {
        let batch = [];

        function commit() {
            if (batch.length > 0) {
                const toCommit = batch;
                batch = [];
                return tree.putMany(toCommit);
            }
            return Promise.resolve();
        }

        function add(data) {
            data.modify(time);
            batch.push({ key: data.path, value: data.serialize() });
            if (batch.length >= Dispatcher.COMMIT_QUEUE_LENGTH) {
                commit();
            }
            // debug(`\u222B-Scan [${source.id}] insert: ${data.path}`);
        }

        function progress(p) {
            const duration = Math.ceil(p.duration);
            if (p.finished) {
                const speed = Math.floor((1000 * p.files) / p.duration);
                debug(`\u222B-Scan [${source.id}] complete! Files: ${p.files}, Directories: ${p.directories}, Size: ${p.totalSize}, Time: ${duration}ms, Avg. Speed: ${speed} files/s`);
            }
            else {
                debug(`\u222B-Scan [${source.id}] progress... Files: ${p.files}, Directories: ${p.directories}, Size: ${p.totalSize}, Time: ${duration}ms`);
            }
        }

        debug(`\u222B-Scan [${source.id}] started.`);
        return source.integral(add, commit, progress).then(commit);
    }

    static _deltaScan(tree, source, options, time) {
        let batch = [];

        function commit() {
            if (batch.length > 0) {
                const toCommit = batch;
                batch = [];
                return tree.putMany(toCommit);
            }
            return Promise.resolve();
        }

        function upsert(data) {
            data.modify(time);
            batch.push({ key: data.path, value: data.serialize() });
            if (batch.length >= Dispatcher.COMMIT_QUEUE_LENGTH) {
                commit();
            }
            debug(`\u0394-Scan [${source.id}] upsert: ${data.path}`);
        }

        function remove(key) {
            tree.delSubTree(key);
            debug(`\u0394-Scan [${source.id}] remove: ${key}`);
        }

        function progress(p) {
            const duration = Math.ceil(p.duration);
            const deltaFiles = `${p.added.files - p.removed.files} (+${p.added.files}/-${p.removed.files})`;
            const deltaDirectories = `${p.added.directories - p.removed.directories} (+${p.added.directories}/-${p.removed.directories})`;
            if (p.finished) {
                const speed = Math.floor((1000 * p.entries) / p.duration);
                debug(`\u0394-Scan [${source.id}] complete! Files: ${deltaFiles}, Directories: ${deltaDirectories}, Time: ${duration}ms, Avg. Speed: ${speed} entries/s`);
            }
            else {
                debug(`\u0394-Scan [${source.id}] progress... Files: ${deltaFiles}, Directories: ${deltaDirectories}, Time: ${duration}ms`);
            }
        }

        const scanPath = (options && options.at) ? options.at : null;
        if (!scanPath) {
            debug(`\u0394-Scan [${source.id}] started.`);
        }
        else {
            debug(`\u0394-Scan [${source.id}] started at '${options.at}'.`);
        }
        return source.delta(tree, options, upsert, remove, commit, progress).then(commit);
    }

}

Dispatcher.COMMIT_QUEUE_LENGTH = 96;

Dispatcher.Events = {
    INITIAL_SCAN:        0,
    DELTA_SCAN:          1,
    CHANGE_NOTIFICATION: 2,
};

module.exports = Dispatcher;
