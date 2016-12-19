const sqlite3 = require('sqlite3').verbose();

// ** Table Creation **

const kCreateTagsTable =
    `CREATE TABLE IF NOT EXISTS cs_tags
    (
        tag_id INTEGER PRIMARY KEY ASC,
        key TEXT UNIQUE,
        value TEXT OR NULL
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
        parent_id INTEGER,
        name TEXT,
        display_name TEXT,
        FOREIGN KEY(parent_id) REFERENCES cs_paths(path_id)
    );`

const kCreateContentTable =
    `CREATE TABLE IF NOT EXISTS cs_content
    (
        content_id INTEGER PRIMARY KEY ASC,
        parent_id INTEGER,
        ident TEXT UNIQUE,
        name TEXT,
        display_name TEXT,
        FOREIGN KEY(parent_id) REFERENCES cs_paths(path_id)
    );`

const kCreateBlobTable =
    `CREATE TABLE IF NOT EXISTS cs_blobs
    (
        blob_id INTEGER PRIMARY KEY ASC,
        content_id INTEGER,
        hash_sha1 TEXT OR NULL,
        media_type_pri TEXT,
        media_type_sec TEXT,
        is_variant INTEGER,
        byte_length INTEGER,
        ctime TEXT,
        mtime TEXT,
        uid INTEGER OR NULL,
        gid INTEGER OR NULL,
        ino INTEGER OR NULL,
        mode INTEGER OR NULL,
        FOREIGN KEY(content_id) REFERENCES cs_content(content_id)
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
        FOREIGN KEY(blob_id) REFERENCES cs_blobs(blob_id)
    );`

class Database {

    constructor(path){
        this._path = path;//':memory:';
        this._db = null;
    }

    open(){
        return new Promise((accept, reject) => {
            var db = new sqlite3.Database(this._path, (err) => {
                db.serialize(function(){
                    db.run('PRAGMA foreign_keys = 1;');
                    db.run(kCreateTagsTable);
                    db.run(kCreateSourcesTable);
                    db.run(kCreatePathTable);
                    db.run(kCreateContentTable);
                    db.run(kCreateBlobTable);
                    db.run(kCreateVariantsTable, [], (err) => {
                        accept();
                    });
                });
            });

            this._db = db;
        });
    }

    close(){

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

module.exports = {
    'Database': Database
};
