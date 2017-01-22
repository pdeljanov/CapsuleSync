const PathTools = require('../fs/PathTools.js');

module.exports =
class Blob {

    constructor(mediaType, byteLength, creationTime, modificationTime, inode, uid, gid, mode, sha1) {
        this._data = {
            sha1:             sha1 || null,
            mediaType:        mediaType,
            byteLength:       byteLength,
            creationTime:     creationTime,
            modificationTime: modificationTime,
            uid:              uid,
            gid:              gid,
            inode:            inode,
            mode:             mode,
        };
    }

    get sha1() {
        return this._data.sha1;
    }

    get mediaType() {
        return this._data.mediaType;
    }

    get byteLength() {
        return this._data.byteLength;
    }

    get creationTime() {
        return this._data.creationTime;
    }

    get modificationTime() {
        return this._data.modificationTime;
    }

    get uid() {
        return this._data.uid;
    }

    get gid() {
        return this._data.gid;
    }

    get inode() {
        return this._data.inode;
    }

    get mode() {
        return this._data.mode;
    }

    static deserialize(serialized) {
        const deserialized = new Blob(
            serialized.mediaType,
            serialized.byteLength,
            serialized.creationTime,
            serialized.modificationTime,
            serialized.inode,
            serialized.uid,
            serialized.gid,
            serialized.mode,
            serialized.sha1);

        return deserialized;
    }

    serialize() {
        return this._data;
    }

    static fromStat(path, stat) {
        const mediaType = PathTools.extractMediaType(path);

        return new Blob(mediaType,
            stat.size,
            stat.birthtime,
            stat.mtime,
            stat.ino,
            stat.uid,
            stat.gid,
            stat.mode);
    }

};
