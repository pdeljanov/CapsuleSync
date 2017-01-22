'use strict';

const debug = require('debug')('Capsule.Capsule');

const electron = require('electron')
const EventEmitter = require('events');

const Database = require('./fsdb/Database.js');
const SourceFactory = require('./sources/SourceFactory.js');
const IdGenerator = require('../util/IdGenerator.js');
const Dispatcher = require('./Dispatcher.js');
const AppPaths = require('../util/AppPaths.js');

class Capsule extends EventEmitter {

    constructor(identifier) {
        super();
        const fileName = `${identifier}.db`;
        const filePath = AppPaths.getPathAtLocation(AppPaths.CAPSULE_ROOT, fileName);

        this._db = new Database(filePath);

        debug(`Loaded Capsule database at: ${filePath}.`);
    }

    open(createInfo) {
        return new Promise((resolve, reject) => {
            debug('Opening Capsule database.');
            this._db.open()
                .then(() => checkDatabase(this._db))
                .then(() => loadSources(this._db))
                .then((sources) => {
                    this._dispatcher = new Dispatcher(this._db, sources);
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
                .then(() => db.config('capsule.core.filters').set(null))
                .then(() => db.config('capsule.core.sources').set([]))
                .then(() => db.config('capsule.user.id').set(createInfo.userId))
                .then(() => db.config('capsule.user.name').set(createInfo.userName));
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
                .catch(err => createNewDatabase(db));
        }

        // Load sources.
        function loadSources(db) {
            return db.config('capsule.core.sources').get()
                .then(sources => sources.map(source => SourceFactory(source)));
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
        this._dispatcher.addSource(addedSource);
        return this._saveSources();
    }

    removeSource(removedSource) {
        this._dispatcher.removeSource(removedSource);
        return this._saveSources();
    }

/*
    get filters() {

    }


    get subscribers() {

    }

    subscribe() {

    }

    unsubscribe() {

    }
*/

}

Capsule.DATABASE_VERSION = 1;
Capsule.ID_LENGTH = 64;

module.exports = Capsule;
