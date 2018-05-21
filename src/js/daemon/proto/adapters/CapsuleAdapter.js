const Protocol = require('../Protocol1.js');
const Errors = require('../../Errors.js');

const { FileEntry, LinkEntry, DirectoryEntry } = require('../../capsule/CapsuleEntry.js');

const EntrySerializer = (e, m) => {
    switch (e.type) {
    case FileEntry.TYPE:
        return {
            type:        'file',
            path:        e.path,
            name:        e.fileName,
            displayName: e.displayName,
            modification:
        };
    case DirectoryEntry.TYPE:
        return {
            type:        'dir',
            path:        e.path,
            name:        e.directoryName,
            displayName: e.displayName,
            childCount:  0,
        };
    case LinkEntry.TYPE:
        return {
            type:        'link',
            path:        e.path,
            name:        e.fileName,
            displayName: e.displayName,
            linkedPath:  e.linkedPath,
        };
    default:
        return {};
    }
};

class CapsuleAdapter extends Protocol.Capsule {
    constructor(capsule) {
        super();
        this._capsule = capsule;
    }


    get(id) {
        return Promise.resolve(this._capsule);
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
        return this.get(id).then(capsule => Promise.all([
            capsule.browser(path).entry(),
            capsule.subscriberMap()
        ]))
        .then(results => EntrySerializer(results[1], results[2]));
    }

    data(id, path) {

    }
}

module.exports = CapsuleAdapter;
