const FileSystemSource = require('./FileSystemSource.js');

module.exports =
function SourceFactory(source) {
    switch (source.type) {
    case FileSystemSource.TYPE_IDENTIFIER:
        return FileSystemSource.deserialize(source.data);
    default:
        return null;
    }
};
