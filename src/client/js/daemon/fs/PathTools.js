const path = require('path');
const mime = require('mime-types');

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

    /* Normalize accepts a path string and returns a new path with a standardized format. The following rules apply.
     *  1) A normalized path shall be the shortest logical path. Therefore it must not contain any '.' or '..'
     *      characters.
     *  2) A normalized path shall not have any trailing path seperators.
     *  3) A normalized path, if absolute, shall always be prefixed by its root. Conversely, all relative paths must
     *     not begin with any prefixed characters. For example, './filename' is incorrect, but 'filename.txt' is.
     *  4) All paths must use the platform native path seperator.
     *
     * Windows rule(s):
     *  5) All paths must be encoded in the UNC format for local paths, that is, they must all contains a '\\?\' prefix.
     *
    */
    static normalize(givenPath) {
        return path.normalize(givenPath).replace(/\/$/, '') || path.sep;
    }

    static stripRoot(givenPath, root) {
        const striped = givenPath.replace(root, '');
        if (striped === '') {
            return path.sep;
        }
        return striped;
    }

    static appendRoot(root, givenPath) {
        if (givenPath === path.sep) {
            return root;
        }
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

    static getAbsoluteLinkPath(pathOfLink, linkedPath) {
        return path.resolve(path.getdirname(pathOfLink), linkedPath);
    }

}


module.exports = PathTools;
