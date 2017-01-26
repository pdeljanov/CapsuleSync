'use strict';

const debug = require('debug')('Capsule.Capsule');

const electron = require('electron')
const EventEmitter = require('events');

const Database = require('./fsdb/Database.js');
const TreeAdapter = require('./fsdb/TreeAdapter.js');
const SourceFactory = require('./sources/SourceFactory.js');
const IdGenerator = require('../util/IdGenerator.js');
const Dispatcher = require('./Dispatcher.js');
const VectorClock = require('./VectorClock.js');
const AppPaths = require('../util/AppPaths.js');

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

class Capsule extends EventEmitter {

    constructor(identifier) {
        super();
        const fileName = `${identifier}.db`;
        const filePath = AppPaths.getPathAtLocation(AppPaths.Locations.CAPSULE_ROOT, fileName);

        this._db = new Database(filePath);

        debug(`Loading Capsule database at: ${filePath}.`);
    }

    open(createInfo, device) {
        return new Promise((resolve, reject) => {
            debug('Opening Capsule database.');
            this._db.open()
                .then(() => checkDatabase(this._db))
                .then(() => loadSources(this._db))
                .then(sources => loadDispatcher(this._db, sources, 0))
                .then((dispatcher) => {
                    this._dispatcher = dispatcher;
                    return Promise.resolve();
                })
                .then(() => {
                    debug('Capsule database opened!');
                    resolve();
                })
                .catch((err) => {
                    debug(`Capsule database failed to open with error: ${err}`);
                    reject();
                });
        });

        // Create a new database from scratch.
        function createNewDatabase(db) {
            debug('Creating initial database...');

            return db.config('capsule.core.id').set(IdGenerator(Capsule.ID_LENGTH))
                .then(() => db.config('capsule.core.version').set(Capsule.DATABASE_VERSION))
                .then(() => db.config('capsule.core.name').set(createInfo.capsuleName))
                .then(() => db.config('capsule.core.desc').set(createInfo.capsuleDescription))
                .then(() => db.config('capsule.core.filters').set(null))
                .then(() => db.config('capsule.core.sources').set([]))
                .then(() => db.config('capsule.user.id').set(createInfo.userId))
                .then(() => db.config('capsule.user.name').set(createInfo.userName))
                .then(() => db.config('capsule.sync.clock').set(VectorClock.zero(0).vector))
                .then(() => db.config('capsule.sync.subscriber_count').set(1))
                .then(() => {
                    // The device the Capsule was created on is ALWAYS assigned a 0.
                    const subscribers = {};
                    subscribers[device.id] = 0;
                    return db.config('capusle.sync.subscribers').set(subscribers);
                });
        }

        // Upgrade an existing database to the latest version.
        function upgradeDatabase(db, version) {
            debug(`Upgrading database from version ${version} to ${Capsule.DATABASE_VERSION}...`);
            return db.config('capsule.core.version').set(Capsule.DATABASE_VERSION);
        }

        // Checks if the database was created, and that the version is up-to-date.
        function checkDatabase(db) {
            // A created data will contain a version number. If it does, check if the
            // schema needs to be upgraded. If the database does not exist, create it.
            return db.config('capsule.core.version').get()
                .then((version) => {
                    if (version < Capsule.DATABASE_VERSION) {
                        return upgradeDatabase(db, version);
                    }
                    return Promise.resolve();
                })
                .catch(() => createNewDatabase(db));
        }

        // Load sources.
        function loadSources(db) {
            return db.config('capsule.core.sources').get()
                .then(sources => sources.map(source => SourceFactory(source)));
        }

        // Load the dispatcher
        function loadDispatcher(db, sources, deviceNumericId) {
            return db.config('capsule.sync.clock').get()
                .then((currentVector) => {
                    const clock = new VectorClock(deviceNumericId, currentVector);
                    clock.on('tick', vector => db.config('capsule.sync.clock').set(vector));
                    return new Dispatcher(sources, clock);
                });
        }
    }

    get id() {
        return this._db.config('capsule.core.id').get();
    }

    get name() {
        return this._db.config('capsule.core.name').get();
    }

    set name(newName) {
        return this._db.config('capsule.core.name').set(newName);
    }

    get description() {
        return this._db.config('capsule.core.desc').get();
    }

    set description(newDescription) {
        return this._db.config('capsule.core.desc').set(newDescription);
    }

    get sources() {
        return this._dispatcher.sources;
    }

    _saveSources() {
        return new Promise((resolve, reject) => {
            const sources = this._dispatcher.sources.map(source => source.serialize());
            this._db.config('capsule.core.sources').set(sources)
                .then(resolve)
                .catch(err => reject());
        });
    }

    addSource(addedSource) {
        const prefix = pad(addedSource.id, 2);

        return this._db.getIndexedPartition(prefix)
            .then(partition => this._dispatcher.addSource(new TreeAdapter(partition), addedSource))
            .then(() => this._saveSources());
    }

    removeSource(removedSource) {
        return this._dispatcher.removeSource(removedSource)
            .then(() => this._saveSources());
    }

    browser() {

    }

    subscribe(device) {
        this._db.config('capusle.sync.subscribers').get()
            .then((existingSubs) => {
                if (!existingSubs[device.id]) {
                    const updatedSubs = Object.assign({}, existingSubs);

                    return this._db.config.get('capsule.sync.subscriber_count')
                        .then((nextSubId) => {
                            updatedSubs[device.id] = nextSubId;
                            this._db.config.set('capsule.sync.subscriber_count', nextSubId + 1);
                        })
                        .then(() => this._db.config.set('capsule.sync.subscribers').set(updatedSubs));
                }

                // Device is already subscribed.
                return Promise.reject(Capsule.Errors.ALREADY_SUBSCRIBED);
            });
    }

    unsubscribe(device) {
        this._db.config('capusle.sync.subscribers').get()
            .then((existingSubs) => {
                if (existingSubs[device.id]) {
                    const updatedSubs = Object.assign({}, existingSubs);
                    delete updatedSubs[device.id];
                    return this._db.config.set('capsule.sync.subscribers').set(updatedSubs);
                }
                return Promise.resolve();
            });
    }

    /*
        get filters() {

        }
    */
}

Capsule.DATABASE_VERSION = 1;
Capsule.ID_LENGTH = 64;

Capsule.Errors = {
    ALREADY_SUBSCRIBED: 'AlreadySubscribed',
};

module.exports = Capsule;
