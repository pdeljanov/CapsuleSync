const debug = require('debug')('Capsule.ChangeLog');

class ChangeLog {
    constructor(memorySize) {
        this._size = memorySize;
    }

    append(change) {
        debug(`Appending ${change} to change log.`);
    }

    forEach() {

    }
}

module.exports = ChangeLog;
