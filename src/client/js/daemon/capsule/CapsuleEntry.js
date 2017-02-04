const FileEntry = require('./FileEntry.js');
const LinkEntry = require('./LinkEntry.js');
const DirectoryEntry = require('./DirectoryEntry.js');

class CapsuleEntry {
    static deserialize(path, serialization) {
        const type = serialization.t || null;
        switch (type) {
        case 'f':
            return FileEntry.makeFromSerialization(path, serialization);
        case 'd':
            return DirectoryEntry.makeFromSerialization(path, serialization);
        case 'l':
            return LinkEntry.makeFromSerialization(path, serialization);
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
}

CapsuleEntry.Type = {
    UNKOWN:    0,
    FILE:      1,
    DIRECTORY: 2,
    LINK:      3,
};

module.exports = {
    FileEntry:      FileEntry,
    LinkEntry:      LinkEntry,
    DirectoryEntry: DirectoryEntry,
    CapsuleEntry:   CapsuleEntry,
};
