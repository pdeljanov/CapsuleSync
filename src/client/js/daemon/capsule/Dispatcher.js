const debug = require('debug')('Capsule.Dispatcher');

class Dispatcher {

    constructor(sources, clock) {
        this.sources = sources || [];
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

            });
    }

    removeSource(partition, removedSource) {
        this.sources = this.sources.filter(source => source.id === removedSource.id);
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
            postOps:   [],
        });
        this._crankQueue();
    }

    _dispatchDeltaScan(partition, source) {
        this._queuedScans.push({
            source:    source,
            partition: partition,
            scanner:   Dispatcher._deltaScan.bind(null, partition, source),
            postOps:   [],
        });
        this._crankQueue();
    }

    _dispatchChangeNotification(partition, source, data) {
        if (this._activeScan && this._activeScan.source === source) {
            this._activeScan.postOps.append(data);
        }
        else {
            this._processChangeNotification(partition, source, data);
        }
    }

    _processChangeNotification(partition, source, data) {
        const time = this._clock.vector;
        this._clock.advance();

        data.modificationVector = time;
        partition.put(data.path, data.serialize());
    }

    static _initialScan(partition, source, time) {
        function commitFunc(object) {
            object.modificationVector = time;
            partition.put(object.path, object.serialize());
        }
        return new Promise((resolve, reject) => {
            source.traverse(commitFunc).then(resolve).catch(reject);
        });
    }

    static _deltaScan(partition, source, time) {

    }

}

Dispatcher.WAIT_BEFORE_SCAN = 5 * 1000;

Dispatcher.Events = {
    INITIAL_SCAN:        0,
    DELTA_SCAN:          1,
    CHANGE_NOTIFICATION: 2,
};

module.exports = Dispatcher;
