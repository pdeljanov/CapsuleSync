const path = require('path');
const mime = require('mime-types');

module.exports =
class PathTools {
    static extractFileName(givenPath) {
        return path.basename(givenPath);
    }

    static extractMediaType(givenPath) {
        let ext = path.extname(givenPath);
        if (ext && ext[0] === '.') {
            ext = ext.substr(1);
        }
        return mime.contentType(ext);
    }
};
