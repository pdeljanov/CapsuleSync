class BlobEntry {

    constructor(byteLength, creationTime, modificationTime, inode, uid, gid, mode, sha1) {
        this._data = {
            sha1: sha1 || null,
            bl:   byteLength,
            ct:   creationTime,
            mt:   modificationTime,
            uid:  uid,
            gid:  gid,
            ino:  inode,
            mod:  mode,
        };
    }

    get sha1() {
        return this._data.sha1;
    }

    get byteLength() {
        return this._data.bl;
    }

    get creationTime() {
        return this._data.ct;
    }

    get modificationTime() {
        return this._data.mt;
    }

    get uid() {
        return this._data.uid;
    }

    get gid() {
        return this._data.gid;
    }

    get inode() {
        return this._data.ino;
    }

    get mode() {
        return this._data.mod;
    }

    _isContentIdentical(stat) {
        return (stat.size === this._data.bl) &&
            (stat.mtime.getTime() === this._data.mt.getTime()) &&
            (stat.birthtime.getTime() === this._data.ct.getTime());
    }

    isIdentical(stat) {
        if (this._isContentIdentical(stat) &&
            stat.uid === this._data.uid &&
            stat.gid === this._data.gid &&
            stat.mode === this._data.mod &&
            stat.ino === this._data.ino
        ) {
            return true;
        }
        return false;
    }

    update(stat) {
        if (!this._isContentIdentical(stat)) {
            this._data.sha1 = null;
            this._data.bl = stat.size;
            this._data.ct = new Date(stat.birthtime);
            this._data.mt = new Date(stat.mtime);
        }
        this._data.uid = stat.uid;
        this._data.gid = stat.gid;
        this._data.mod = stat.mode;
        this._data.ino = stat.ino;
    }

    serialize() {
        return this._data;
    }

    static deserialize(serialized) {
        const deserialized = new BlobEntry(
            serialized.bl,
            new Date(serialized.ct),
            new Date(serialized.mt),
            serialized.ino,
            serialized.uid,
            serialized.gid,
            serialized.mod,
            serialized.sha1);

        return deserialized;
    }

    static fromStat(path, stat) {
        return new BlobEntry(
            stat.size,
            stat.birthtime,
            stat.mtime,
            stat.ino,
            stat.uid,
            stat.gid,
            stat.mode);
    }
}

module.exports = BlobEntry;
