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

    static getTraversalPath(givenPath) {
        const parsed = path.parse(path.normalize(givenPath));
        const directories = parsed.dir.replace(parsed.root, '').split(path.sep);
        const traverse = [];
        while (directories.length > 0) {
            const previousPath = traverse[traverse.length - 1] || parsed.root;
            const nextPath = path.join(previousPath, directories.shift());
            traverse.push(nextPath);
        }
        return traverse;
    }

};
