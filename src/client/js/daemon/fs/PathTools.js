const path = require('path');
const mime = require('mime-types');

module.exports =
class PathTools {
    static extractFileName(givenPath) {
        return path.basename(givenPath);
    }

    static extractExtension(givenPath) {
        let ext = path.extname(givenPath);
        if (ext && ext[0] === '.') {
            ext = ext.substr(1);
        }
        return ext;
    }

    static extractMediaType(givenPath) {
        return mime.contentType(PathTools.extractExtension(givenPath));
    }

    static stripRoot(givenPath, root) {
        const striped = givenPath.replace(root, '');
        if (striped === '') {
            return '/';
        }
        return striped;
    }

    static appendRoot(root, givenPath) {
        return path.join(root, givenPath);
    }

};
