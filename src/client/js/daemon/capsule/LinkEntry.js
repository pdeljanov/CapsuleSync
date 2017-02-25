const FileEntry = require('./FileEntry.js');
const BlobEntry = require('./BlobEntry.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

class LinkEntry extends FileEntry {

    constructor(path, linkedPath, blob) {
        super(path, blob);
        this._linkedPath = linkedPath;
    }

    get type() {
        return LinkEntry.TYPE;
    }

    get linkedPath() {
        return this._data.lp;
    }

    serialize() {
        const serialization = super.serialize();
        serialization.t = 'l';
        serialization.lp = this._linkedPath;
        return serialization;
    }

    static deserialize(path, serialization) {
        const blob = serialization.b ? BlobEntry.deserialize(serialization.b) : null;
        const link = new LinkEntry(path, serialization.lp, blob);
        link._id = serialization.id;
        link._mediaType = serialization.typ;
        link._displayName = serialization.dn;
        link._fileName = serialization.fn;
        link._modVector = serialization.mv;
        link._syncVector = serialization.sv;
        return link;
    }

    static fromFileInfo(path, linkedPath, stat) {
        const link = new LinkEntry(path, linkedPath, BlobEntry.fromStat(path, stat));
        link._id = IdGenerator(LinkEntry.ID_LENGTH);
        link._mediaType = PathTools.extractMediaType(path);
        link._fileName = PathTools.extractFileName(path);
        return link;
    }
}

LinkEntry.ID_LENGTH = 12;
LinkEntry.TYPE = 3;

module.exports = LinkEntry;
