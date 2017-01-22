const path = require('path');
const mime = require('mime-types');

module.exports =
class PathTools {
    static extractFileName(path){
        return path.basename(path);
    }

    static extractMediaType(path){
        mime.contentType(path.extname(path));
    }
};
