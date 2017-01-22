const debug = require('debug')('Capsule.Dispatcher');

class Dispatcher {

    constructor(sources) {
        this.sources = sources || [];
    }

    addSource(partition, source) {
        // Load the source.
        source.load().then(() => {
            // Append the newly loaded source to the sources list.
            this.sources.push(source);
            // Attach event listeners.
            source.on('initialScan', Dispatcher.dispatch.bind(this, Dispatcher.Events.INITIAL_SCAN, partition, source));
            source.on('deltaScan', Dispatcher.dispatch.bind(this, Dispatcher.Events.DELTA_SCAN, partition, source));
            source.on('change', Dispatcher.dispatch.bind(this, Dispatcher.Events.CHANGE_NOTIFICATION, partition, source));
        })
        .catch((err) => {

        });
    }

    removeSource(partition, removedSource) {
        this.sources = this.sources.filter(source => source.id === removedSource.id);
    }

    dispatch(eventType, partition, source, data) {
        switch (eventType) {
        case Dispatcher.Events.INITIAL_SCAN:
            this._dispatchInitialScan(partition, source, data);
            break;
        case Dispatcher.Events.DELTA_SCAN:
            this._dispatchDeltaScan(partition, source, data);
            break;
        case Dispatcher.Events.CHANGE_NOTIFICATION:
            this._dispatchChangeNotification(partition, source, data);
            break;
        default:
            break;
        }
    }

    static _initialScan(partition, source) {

        return new Promise((resolve, reject) => {
            source.load().then(traverse).then(resolve).catch(reject);
        });

        function traverse(){
            source.traverse((object) => {
                t.put(path, object);
            });
        }
    }


}

Dispatcher.WAIT_BEFORE_SCAN = 5 * 1000;

Dispatcher.Events = {
    INITIAL_SCAN:        0,
    DELTA_SCAN:          1,
    CHANGE_NOTIFICATION: 2,
};

module.exports = Dispatcher;
