const FileEntry = require('./FileEntry.js');
const LinkEntry = require('./LinkEntry.js');
const DirectoryEntry = require('./DirectoryEntry.js');

class CapsuleEntry {
    static deserialize(path, serialization) {
        const type = serialization.t || null;
        switch (type) {
        case 'f':
            return FileEntry.deserialize(path, serialization);
        case 'd':
            return DirectoryEntry.deserialize(path, serialization);
        case 'l':
            return LinkEntry.deserialize(path, serialization);
        default:
            return null;
        }
    }

    static getType(serialization) {
        const type = serialization.t || null;
        switch (type) {
        case 'f':
            return CapsuleEntry.Type.FILE;
        case 'd':
            return CapsuleEntry.Type.DIRECTORY;
        case 'l':
            return CapsuleEntry.Type.LINK;
        default:
            return CapsuleEntry.Type.UNKNOWN;
        }
    }

    static getName(serialization) {
        return serialization.fn || serialization.din;
    }
}

CapsuleEntry.Type = {
    UNKNOWN:   0,
    FILE:      FileEntry.TYPE,
    DIRECTORY: DirectoryEntry.TYPE,
    LINK:      LinkEntry.TYPE,
};

module.exports = {
    FileEntry:      FileEntry,
    LinkEntry:      LinkEntry,
    DirectoryEntry: DirectoryEntry,
    CapsuleEntry:   CapsuleEntry,
};
