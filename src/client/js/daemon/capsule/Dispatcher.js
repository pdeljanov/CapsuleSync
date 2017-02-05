const debug = require('debug')('Capsule.Dispatcher');

const ChangeLog = require('./ChangeLog.js');

class Dispatcher {

    constructor(clock) {
        this.sources = [];
        this._clock = clock;
        this._queuedScans = [];
        this._activeScan = null;
    }

    addSource(partition, source) {
        // Append the newly loaded source to the sources list.
        this.sources.push(source);

        // Attach event listeners.
        source.on('initialScan', this.dispatch.bind(this, Dispatcher.Events.INITIAL_SCAN, partition, source));
        source.on('deltaScan', this.dispatch.bind(this, Dispatcher.Events.DELTA_SCAN, partition, source));
        source.on('change', this.dispatch.bind(this, Dispatcher.Events.CHANGE_NOTIFICATION, partition, source));

        // Load the source.
        return source.load()
            .catch((err) => {
                // If there is an error loading the source, remove it and re-throw the error.
                this.removeSource(source);
                return Promise.reject(err);
            });
    }

    removeSource(removedSource) {
        this.sources = this.sources.filter((source) => {
            if (source.id === removedSource.id) {
                // TODO: Only remove the event listeners bound in addSource.
                source.removeListener('initialScan');
                source.removeListener('deltaScan');
                source.removeListener('change');
                return true;
            }
            return false;
        });
    }

    dispatch(eventType, partition, source, data) {
        switch (eventType) {
        case Dispatcher.Events.INITIAL_SCAN:
            this._dispatchInitialScan(partition, source);
            break;
        case Dispatcher.Events.DELTA_SCAN:
            this._dispatchDeltaScan(partition, source);
            break;
        case Dispatcher.Events.CHANGE_NOTIFICATION:
            this._dispatchChangeNotification(partition, source, data);
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
                this._activeScan.scanner(time).then(() => {
                    // Once complete, reset the active scan and crank the queue.
                    this._activeScan = null;
                    this._crankQueue();
                });
            });
        }
    }

    _dispatchInitialScan(partition, source) {
        this._queuedScans.push({
            source:    source,
            partition: partition,
            scanner:   Dispatcher._initialScan.bind(null, partition, source),
            changeLog: new ChangeLog(Dispatcher.CHANGELOG_MEMORY_LENGTH),
        });
        this._crankQueue();
    }

    _dispatchDeltaScan(partition, source) {
        this._queuedScans.push({
            source:    source,
            partition: partition,
            scanner:   Dispatcher._deltaScan.bind(null, partition, source),
            changeLog: new ChangeLog(Dispatcher.CHANGELOG_MEMORY_LENGTH),
        });
        this._crankQueue();
    }

    _dispatchChangeNotification(partition, source, data) {
        if (this._activeScan && this._activeScan.source === source) {
            this._activeScan.changeLog.append(data);
        }
        else {
            this._processChangeNotification(partition, source, data);
        }
    }

    _processChangeNotification(partition, source, data) {
        const time = this._clock.vector;
        this._clock.advance();
        data.modify(time);
        partition.put(data.path, data.serialize());
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
            if (batch.length >= Dispatcher.SCAN_COMMIT_QUEUE_LENGTH) {
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

        return new Promise((resolve, reject) => {
            debug(`\u222B-Scan [${source.id}] complete.`);
            source.integral(add, commit, progress).then(commit).then(resolve).catch(reject);
        });
    }

    static _deltaScan(tree, source, time) {
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
            // batch.push({ key: data.path, value: data.serialize() });
            // if (batch.length >= Dispatcher.SCAN_COMMIT_QUEUE_LENGTH) {
            //     commit();
            // }
            debug(`\u0394-Scan [${source.id}] upsert: ${data.path}`);
        }

        function remove(key) {
            // tree.delSubTree(key);
            debug(`\u0394-Scan [${source.id}] remove: ${key}`);
        }

        function progress(p) {
            const duration = Math.ceil(p.duration);
            if (p.finished) {
                const speed = Math.floor((1000 * p.files) / p.duration);
                debug(`\u0394-Scan [${source.id}] complete! Files: ${p.files}, Directories: ${p.directories}, Time: ${duration}ms, Avg. Speed: ${speed} files/s`);
            }
            else {
                debug(`\u0394-Scan [${source.id}] progress... Files: ${p.files}, Directories: ${p.directories}, Time: ${duration}ms`);
            }
        }

        return new Promise((resolve, reject) => {
            debug(`\u0394-Scan [${source.id}] started.`);
            source.delta(tree, upsert, remove, commit, progress)
                .then(commit)
                .then(resolve)
                .catch(reject);
        });
    }

}

Dispatcher.CHANGELOG_MEMORY_LENGTH = 128;
Dispatcher.SCAN_COMMIT_QUEUE_LENGTH = 96;

Dispatcher.WAIT_BEFORE_SCAN = 5 * 1000;

Dispatcher.Events = {
    INITIAL_SCAN:        0,
    DELTA_SCAN:          1,
    CHANGE_NOTIFICATION: 2,
};

module.exports = Dispatcher;
