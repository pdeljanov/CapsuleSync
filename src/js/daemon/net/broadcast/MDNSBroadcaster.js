const mdns = require('mdns');

class IBroadcaster {

}

class MDNSBroadcaster extends IBroadcaster {

    constructor(port, userId, friendlyName) {
        super();

        // The TXT record contains supplementary data required for a connection.
        const txtRecord = {
            fn:  friendlyName,
            uid: userId,
        };

        // Options specifies the Service Name, and TXT record filled out above.
        const options = {
            name:      'Capsule Sync',
            txtRecord: txtRecord,
        };

        this._ad = null;
        this._port = port;
        this._options = options;
    }

    start() {
        return new Promise((resolve) => {
            // Create the advertisement.
            if (!this._ad) {
                this._ad = mdns.createAdvertisement(mdns.makeServiceType('cs', 'tcp'), this._port, this._options);
                this._ad.start();
            }
            process.nextTick(resolve);
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this._ad) {
                this._ad.stop();
                this._ad = null;
            }
            process.nextTick(resolve);
        });
    }

}

module.exports = MDNSBroadcaster;
