const debug = require('debug')('Capsule.Capsule');

const EventEmitter = require('events');
const Database = require('./fsdb/Database.js');
const TreeAdapter = require('./fsdb/TreeAdapter.js');
const SourceFactory = require('./sources/SourceFactory.js');
const IdGenerator = require('../util/IdGenerator.js');
const Dispatcher = require('./Dispatcher.js');
const VectorClock = require('./VectorClock.js');
const { FilterSet } = require('./FilterSet.js');
const ExclusionSet = require('./ExclusionSet.js');
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
        this._filters = FilterSet.empty();
        this._exclusions = ExclusionSet.empty();

        debug(`Loading Capsule database at: ${filePath}.`);
    }

    open(createInfo, device) {
        // Create a new database from scratch.
        const createNewDatabase = (db) => {
            debug('Creating initial database...');

            return db.config('capsule.core.id').set(IdGenerator(Capsule.ID_LENGTH))
                .then(() => db.config('capsule.core.version').set(Capsule.DATABASE_VERSION))
                .then(() => db.config('capsule.core.name').set(createInfo.capsuleName || ''))
                .then(() => db.config('capsule.core.desc').set(createInfo.capsuleDescription || ''))
                .then(() => db.config('capsule.core.filters').set(FilterSet.empty().serialize()))
                .then(() => db.config('capsule.core.exclusions').set(ExclusionSet.empty().serialize()))
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
        };

        // Upgrade an existing database to the latest version.
        const upgradeDatabase = (db, version) => {
            debug(`Upgrading database from version ${version} to ${Capsule.DATABASE_VERSION}...`);
            return db.config('capsule.core.version').set(Capsule.DATABASE_VERSION);
        };

        // Checks if the database was created, and that the version is up-to-date.
        const checkDatabase = db =>
            // A created data will contain a version number. If it does, check if the
            // schema needs to be upgraded. If the database does not exist, create it.
            db.config('capsule.core.version').get()
                .then((version) => {
                    if (version < Capsule.DATABASE_VERSION) {
                        return upgradeDatabase(db, version);
                    }
                    return Promise.resolve();
                })
                .catch(() => createNewDatabase(db));

        // Load filter set.
        const loadFilters = db =>
            db.config('capsule.core.filters').get()
                .then((filters) => {
                    this._filters = FilterSet.deserialize(filters);
                    return Promise.resolve();
                });

        // Load exclusion set.
        const loadExclusions = db =>
            db.config('capsule.core.exclusions').get()
                .then((exclusions) => {
                    this._exclusions = ExclusionSet.deserialize(exclusions);
                    return Promise.resolve();
                });

        // Load sources.
        const loadSources = db =>
            db.config('capsule.core.sources').get()
                .then(sources => sources.map(source => SourceFactory(source)));

        // Load the dispatcher
        const loadDispatcher = (db, deviceNumericId) =>
            db.config('capsule.sync.clock').get()
                .then((currentVector) => {
                    const clock = new VectorClock(deviceNumericId, currentVector);
                    clock.on('tick', vector => db.config('capsule.sync.clock').set(vector));
                    this._dispatcher = new Dispatcher(clock);
                    return Promise.resolve();
                });

        // Open the database now.
        return new Promise((resolve, reject) => {
            debug('Opening Capsule database.');
            this._db.open()
                .then(() => checkDatabase(this._db))
                .then(() => loadDispatcher(this._db, 0))
                .then(() => loadFilters(this._db))
                .then(() => loadExclusions(this._db))
                .then(() => loadSources(this._db))
                .then(sources => Promise.all(sources.map(source => this._addSource(source))))
                .then(() => {
                    debug('Capsule database opened!');
                    resolve();
                })
                .catch((err) => {
                    debug(`Capsule database failed to open with error: ${err}`);
                    reject();
                });
        });
    }

    close() {
        return new Promise((resolve) => {
            debug('Closing Capsule database.');
            this._saveSources()
                .then(() => this._db.close())
                .then(resolve);
        });
    }

    id() {
        return this._db.config('capsule.core.id').get();
    }

    name() {
        return this._db.config('capsule.core.name').get();
    }

    setName(newName) {
        return this._db.config('capsule.core.name').set(newName);
    }

    description() {
        return this._db.config('capsule.core.desc').get();
    }

    setDescription(newDescription) {
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

    _addSource(addedSource) {
        const prefix = pad(addedSource.id, 2);

        return this._db.getIndexedPartition(prefix)
            .then((partition) => {
                addedSource.filter(this._filters);
                addedSource.exclude(this._exclusions);
                return this._dispatcher.addSource(new TreeAdapter(partition), addedSource);
            });
    }

    addSource(addedSource) {
        return this._addSource(addedSource).then(() => this._saveSources());
    }

    removeSource(removedSource) {
        return this._dispatcher.removeSource(removedSource)
            .then(() => this._saveSources());
    }

    subscriberMap() {
        return this._db.config('capusle.sync.subscribers').get()
            .then((subscribers) => {
                const map = [];
                Object.keys(subscribers).forEach((k) => { map[subscribers[k]] = k; });
                return map;
            });
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

    get filters() {
        return this._filters;
    }

    filter(filterSet) {
        return this._db.config('capsule.core.filters').set(filterSet.serialize())
            .then(() => {
                this._filters = filterSet;
                this._dispatcher.sources.forEach(source => source.filter(filterSet));
                return Promise.resolve();
            });
    }

    get exclusions() {
        return this._exclusions;
    }

    exclude(exclusions) {
        return this._db.config('capsule.core.exclusions').set(exclusions.serialize())
            .then(() => {
                this._exclusions = exclusions;
                this._dispatcher.sources.forEach(source => source.exclude(exclusions));
                return Promise.resolve();
            });
    }

    browser(at) {
        const sourceRegex = /^\/([0-9]+)(\/.*)$/;
        const match = sourceRegex.exec(at);
        if (match && match.length === 3) {
            const sourceIdx = parseInt(match[1], 10);
            if (sourceIdx < this._dispatcher.sources.length) {
                const browseAt = match[2];
                return this._dispatcher.sources[sourceIdx].browser(browseAt);
            }
            debug(`Browse path '${at}' specifies an out-of-bounds source index of ${sourceIdx}.`);
        }
        else {
            debug(`Browse path '${at}' is malformed. No source prefix.`);
        }
        return null;
    }

}

Capsule.DATABASE_VERSION = 1;
Capsule.ID_LENGTH = 64;

Capsule.Errors = {
    ALREADY_SUBSCRIBED: 'AlreadySubscribed',
};

module.exports = Capsule;
