const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const debug = require('debug')('capsule.core.db.database');

// ** Table Creation **

const kCreateTagsTable =
    `CREATE TABLE IF NOT EXISTS cs_tags
    (
        tag_id INTEGER PRIMARY KEY ASC,
        key TEXT UNIQUE,
        value TEXT
    );`

const kCreateSourcesTable =
    `CREATE TABLE IF NOT EXISTS cs_sources
    (
        source_id INTEGER PRIMARY KEY ASC,
        root_path TEXT UNIQUE,
        display_name TEXT,
        num_files INTEGER,
        num_directories INTEGER,
        byte_length INTEGER
    );`

const kCreatePathTable =
    `CREATE TABLE IF NOT EXISTS cs_paths
    (
        path_id INTEGER PRIMARY KEY ASC,
        source_id INTEGER,
        path TEXT UNIQUE,
        storage_path TEXT UNIQUE,
        depth INTEGER,
        num_files INTEGER,
        num_directories INTEGER,
        FOREIGN KEY(source_id) REFERENCES cs_sources(source_id)
    );`

const kCreateContentTable =
    `CREATE TABLE IF NOT EXISTS cs_content
    (
        content_id INTEGER PRIMARY KEY ASC,
        path_id INTEGER,
        ident TEXT UNIQUE,
        name TEXT,
        storage_name TEXT,
        FOREIGN KEY(path_id) REFERENCES cs_paths(path_id)
    );`

const kCreateBlobTable =
    `CREATE TABLE IF NOT EXISTS cs_blobs
    (
        blob_id INTEGER PRIMARY KEY ASC,
        content_id INTEGER,
        hash_sha1 TEXT,
        media_type_pri TEXT,
        media_type_sec TEXT,
        is_variant INTEGER,
        byte_length INTEGER,
        ctime TEXT,
        mtime TEXT,
        uid INTEGER,
        gid INTEGER,
        ino INTEGER,
        mode INTEGER,
        FOREIGN KEY(content_id) REFERENCES cs_content(content_id) ON DELETE CASCADE
    );`

const kCreateVariantsTable =
    `CREATE TABLE IF NOT EXISTS cs_variants
    (
        variant_id INTEGER PRIMARY KEY ASC,
        blob_id INTEGER
        hash_sha1 TEXT,
        media_type_pri TEXT,
        media_type_sec TEXT,
        media_type_params TEXT,
        FOREIGN KEY(blob_id) REFERENCES cs_blobs(blob_id) ON DELETE CASCADE
    );`

const kSchemaVersion = 1;

module.exports =
class Database {

    constructor(path){
        this._path = path || ':memory:';
        this._db = null;
    }

    open(){
        return new Promise((resolve, reject) => {

            debug(`Opening Capsule database at: ${this._path}`);

            var db = new sqlite3.Database(this._path, (err) => {

                // Enable and check PRAGMAs serially.
                db.serialize(function(){
                    db.run('PRAGMA foreign_keys = 1;');
                    db.get('PRAGMA user_version;', function(err, row) {

                        // Determine if the SQLite database was just created.
                        const isNew = (row.user_version === 0);
                        const previousSchemaVersion = (row.user_version === 0 ? null : row.user_version);

                        debug(`Database version info.: New Database=${isNew}; App Schema=${kSchemaVersion}; Database Schema=${previousSchemaVersion}`);

                        // Serialize table creation.
                        db.serialize(function() {
                            db.run(kCreateTagsTable);
                            db.run(kCreateSourcesTable);
                            db.run(kCreatePathTable);
                            db.run(kCreateContentTable);
                            db.run(kCreateBlobTable);
                            db.run(kCreateVariantsTable);

                            // Set the current schema version.
                            db.run(`PRAGMA user_version = ${kSchemaVersion};`, function(err){

                                debug(`Database ready.`);

                                // Done opening the database.
                                resolve(isNew); //, kSchemaVersion, previousSchemaVersion);
                            });
                        });
                    });

                });
            });

            this._db = db;
        });
    }

    close(){
        return new new Promise((resolve, reject) => {
            this._db.close(function(err) {
                resolve();
            });
        });
    }

    setTag(key, value){
        const kSetTag = `INSERT OR REPLACE INTO cs_tags (key, value) VALUES (?, ?);`;

        return new Promise((resolve, reject) => {
            this._db.run(kSetTag, [ key, value ], (err) => {
                if(!err){
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

    getTag(key){
        const kGetTag = `SELECT t.value FROM cs_tags AS t WHERE t.key = ?;`;

        return new Promise((resolve, reject) => {
            this._db.get(kGetTag, [ key ], (err, value) => {
                if(!err){
                    resolve(value || null);
                }
                else {
                    reject(err);
                }
            });
        });
    }

    removeTag(key){
        const kRemoveTag = `DELETE FROM cs_tags AS t WHERE t.key = ?;`

        return new Promise((resolve, reject) => {
            this._db.run(kRemoveTag, [ key ], (err) => {
                if(!err){
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

    run(action){
        return new Promise((resolve, reject) => {
            action.execute(this._db, resolve, reject);
        });
    }

}
