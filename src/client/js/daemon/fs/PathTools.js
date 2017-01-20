const path = require('path');

module.exports =
class PathTools {
    static extractFileName(path){
        return path.basename(path);
    }
};
