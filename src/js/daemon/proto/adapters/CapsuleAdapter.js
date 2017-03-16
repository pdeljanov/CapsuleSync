const Protocol = require('../Protocol1.js');
const Errors = require('../../Errors.js');

class CapsuleAdapter extends Protocol.Capsule {
    constructor(capsule) {
        super();
        this._capsule = capsule;
    }


    get(id) {
        return Promise.reject(Errors.NOT_SUPPORTED);
    }

    /* Protocol1/Capsule/List - Returns a list of all loaded Capsules.
     * Returns:
     *     {
     *        id :int,
     *        friendlyName :string,
     *        description :string,
     *        active :boolean,
     *    }
     */
    listAll() {
        return Promise.all([
            this._capsule.id(),
            this._capsule.name(),
            this._capsule.description()
        ])
        .then(results => ([{
            id:           results[0],
            friendlyName: results[1],
            description:  results[2],
            active:       true,
        }]));
    }

    subscribeTo(deviceId, capsuleId) {

    }

    unsubscribeFrom(deviceId, capsuleId) {

    }

    entry(id, path) {

    }

    data(id, path) {

    }
}

module.exports = CapsuleAdapter;
