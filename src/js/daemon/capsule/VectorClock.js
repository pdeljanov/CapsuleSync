const EventEmitter = require('events');

class VectorClock extends EventEmitter {

    constructor(deviceId, initialVector) {
        super();
        this.vector = initialVector;
        this.deviceId = deviceId;
    }

    advance() {
        this.vector[this.deviceId] += 1;
        this.emit('tick', this.vector);
    }

    static zero(initialDeviceId) {
        const v = {};
        v[initialDeviceId] = 0;
        return new VectorClock(initialDeviceId, v);
    }

}

module.exports = VectorClock;
