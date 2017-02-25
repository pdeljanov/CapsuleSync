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
                id:   this._id,
                inst: derivedData,
            },
        };
        return serialized;
    }
}

// The coverage of a scan over a source.
Source.ScanCoverage = {
    // The entire source was scanned.
    FULL:    0,
    // The source was only partially scanned.
    PARTIAL: 1,
};

// Watch notification actions.
Source.Actions = {
    // An update or insertion of an entry.
    UPSERT: 0,
    // A remove of an entry.
    REMOVE: 1,
    // Recursive addition at the path of an entry.
    SCAN:   2,
};

module.exports = Source;
