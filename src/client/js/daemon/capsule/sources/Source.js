const EventEmitter = require('events');

class Source extends EventEmitter {

    constructor(id) {
        super();
        this._id = id;
    }

    get id() {
        return this._id;
    }

    serialize(type, derivedData) {
        const serialized = {
            type: type,
            data: {
                id:      this._id,
                derived: derivedData,
            },
        };
        return serialized;
    }
}

Source.ERRORS = {
    ACCESS_DENIED:  'AccessDenied',
    DOES_NOT_EXIST: 'DoesNotExist',
};

Source.Actions = {
    UPSERT:    0,
    SCAN_PATH: 1,
    REMOVE_IF: 2,
};

module.exports = Source;
