const debug = require('debug')('Capsule.ChangeLog');

class ChangeLog {
    constructor(memorySize) {
        this._size = memorySize;
        this._changes = [];
    }

    append(change) {
        debug(`Appending ${change} to change log.`);
        this._changes.push(change);
    }

    commit(func) {

    }
}

module.exports = ChangeLog;
