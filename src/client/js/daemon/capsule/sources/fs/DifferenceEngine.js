const debug = require('debug')('Capsule.Sources.FileSystem.DifferenceEngine');
const async = require('async');
const fs = require('original-fs');

const PathTools = require('../../../fs/PathTools.js');
const Directory = require('../../../fs/Directory.js');
const Link = require('../../../fs/Link.js');
const { FileEntry, LinkEntry, DirectoryEntry, CapsuleEntry } = require('../../CapsuleEntry.js');

// DifferenceEngine(database, diskRoot, options).entry(path, databaseItem, done)
//                                              .path(path, done)

class DifferenceEngine {

    constructor(tree, root, options) {
        this._tree = tree;
        this._root = root;

        this._options = {
            directoryAdds:    true,
            directoryRemoves: true,
            followLinks:      (options && options.followLinks) || (!options && true),
            concurrency:      (options && options.concurrency) || (!options && 8),
        };

        if (options && options.directoryCheck) {
            switch (options.directoryCheck) {
            case DifferenceEngine.DirectoryCheck.ADD:
                this._options.directoryRemoves = false;
                break;
            case DifferenceEngine.DirectoryCheck.REMOVE:
                this._options.directoryAdds = false;
                break;
            case DifferenceEngine.DirectoryCheck.NONE:
                this._options.directoryRemoves = false;
                this._options.directoryAdds = false;
                break;
            default:
                break;
            }
        }

        this._add = (options && options.add) ? options.add.bind(this) : (() => {});
        this._remove = (options && options.remove) ? options.remove.bind(this) : (() => {});
        this._update = (options && options.update) ? options.update.bind(this) : (() => {});
        this._error = (options && options.error) ? options.error.bind(this) : (() => {});
        this._ignore = (options && options.ignore) ? options.ignore.bind(this) : (() => {});
    }

    _addSymlink(path, relativePath, stat, done) {
        // Resolve the link.
        Link.resolve(path).then((link) => {
            // If following links, insert an entry appropriate for the linked type.
            if (this._options.followLinks) {
                // Following links makes us liable to creating infinite loops. Therefore, if for the given traversal
                // path we back track in such a way it'll lead us down the same path, create a link.
                const level = this._pathStack.attempt(link.linkedStat.ino, link.linkedStat.dev);

                if (level != null) {
                    debug(`Link cycle: '${path}' -> '${level.path}' detected. Ignoring further recursion.`);
                    const relativeLinkedPath = PathTools.stripRoot(level.path, this.root);
                    return this._addUnfollowedSymlink(relativePath, relativeLinkedPath, stat, done);
                }
                // File.
                else if (link.linkedStat.isFile()) {
                    return this._addFile(relativePath, link.linkedStat, done);
                }
                // Directory.
                else if (link.linkedStat.isDirectory()) {
                    return this._addDirectory(path, done);
                }

                // Neither a file nor directory, therefore ignore.
                debug(`Linked: '${link.linkedPath}' is neither a file, or directory. Ignoring.`);
                this._numIgnored += 1;
            }
            // If not following links, insert a link entry.
            else {
                return this._addUnfollowedSymlink(relativePath, link.linkedPath, stat, done);
            }

            return done();
        })
        .catch((resolveErr) => {
            debug(`Failed to resolve link: '${path}' due to error: ${resolveErr.code}.`);
            this._errors += 1;
            done();
        });
    }

    _processAddedPaths(paths, done) {
        async.eachLimit(paths, this._options.numJobs, (path, next) => {
            fs.lstat(path, (err, stat) => {
                if (!err) {
                    const relativePath = PathTools.stripRoot(path, this._root);

                    // File addition.
                    if (stat.isFile()) {
                        return this._addFile(relativePath, stat, next);
                    }
                    // Directory addition.
                    else if (stat.isDirectory()) {
                        return this._addDirectory(path, next);
                    }
                    // Link addition.
                    else if (stat.isSymbolicLink()) {
                        return this._addSymlink(path, relativePath, stat, next);
                    }

                    // Not a file, directory, or link.
                    debug(`Path: '${path}' is neither a file, directory, nor link. Ignoring.`);
                    this._errors += 1;
                }
                // Error in stating the path.
                else {
                    debug(`Failed to stat: '${path}' with error: ${err.code}.`);
                    this._errors += 1;
                }

                return next();
            });
        },
        () => {
            done();
        });
    }

    static _calculateDirectoryDeltaAdds(currentNames, previousNames) {
        const previous = new Set(previousNames);
        return currentNames.filter(item => !previous.has(item));
    }

    static _calculateDirectoryDeltaRemoves(currentNames, previousNames) {
        const current = new Set(currentNames);
        return previousNames.filter(item => !current.has(item));
    }

    _calculateDirectoryDelta(fullPath, relativePath, done) {
        const fsGet = Directory.getChildren(fullPath);
        const dbGet = this._tree.getChildren(relativePath);

        Promise.all([fsGet, dbGet]).then((values) => {
            let added = null;
            let removed = null;

            const previousNames = values[1].map(item => CapsuleEntry.getName(item.data));

            if (this._options.directoryAdds) {
                added = DifferenceEngine._calculateDirectoryDeltaAdds(values[0], previousNames)
                            .map(item => PathTools.appendRoot(fullPath, item));
            }

            if (this._options.directoryRemoves) {
                removed = DifferenceEngine._calculateDirectoryDeltaRemoves(values[0], previousNames)
                            .map(item => PathTools.appendRoot(fullPath, item));
            }

            done(added, removed);
        })
        .catch((err) => {
            debug(`Could not scan directory at: '${relativePath}' due to error: ${err.code}.`);
            done();
        });
    }

    _stat(path, cb) {
        const stat = this._options.followLinks ? fs.stat : fs.lstat;
        stat(path, cb);
    }

    entry(fullPath, entry, done) {
        const relativePath = PathTools.stripRoot(fullPath, this._root);

        // Get the stat information for the item being scanned.
        return this._stat(fullPath, (err, stat) => {
            // Removal due to deletion, or error.
            if (err) {
                if (err.code !== 'ENOENT') {
                    debug(`Unexpected error: ${err.code} at: '${relativePath}'.`);
                    this._error(err);
                }

                this._remove(relativePath, entry.type);
            }
            // Directory removal due to exclusion.
            else if (entry.type === CapsuleEntry.Type.DIRECTORY && this.exclude(fullPath)) {
                this._remove(relativePath, entry.type);
            }
            // File or link removal due to filter.
            else if (entry.type !== CapsuleEntry.Type.DIRECTORY && !this.filter(entry)) {
                this._remove(relativePath, entry.type);
            }
            // Update.
            else {
                // File update.
                if (stat.isFile() && entry.type === CapsuleEntry.Type.FILE) {
                    const file = FileEntry.makeFromSerialization(relativePath, entry);

                    if (!file.isIdentical(stat)) {
                        file.update(stat);
                        this._update(file);
                    }

                    return done();
                }
                // Directory update.
                else if (stat.isDirectory() && entry.type === CapsuleEntry.Type.DIRECTORY) {
                    const dir = DirectoryEntry.makeFromSerialization(relativePath, entry);

                    if (!dir.isIdentical(stat)) {
                        dir.update(stat);
                        this._update(dir);

                        if (this._options.directoryContents) {
                            return this._calculateDirectoryDelta(fullPath, relativePath, (additions) => {
                                this._processAddedPaths(additions, done);
                            });
                        }
                    }

                    return done();
                }
                // Weak link update.
                else if (entry.type === CapsuleEntry.Type.LINK && this._options.followLinks) {
                    // When following links, a Capsule link entry is a weak-link, a link to break cycles
                    // in the file system structure. The above getStat call is a stat in this case which gets us
                    // the metadata of the file or directory the link points to, not the link itself. So redo
                    // with an lstat.
                    return fs.lstat(fullPath, (linkErr, linkStat) => {
                        // Path does point to a link.
                        if (!linkErr && linkStat.isSymbolicLink()) {
                            const link = LinkEntry.makeFromSerialization(relativePath, entry);

                            // TODO: Do we have to check if the linked path changed? Symlinks have no atomic
                            // edit capability.
                            if (!link.isIdentical(linkStat)) {
                                link.update(linkStat);
                                this._update(link);
                            }
                        }
                        // Path is not actually a link.
                        else {
                            this._remove(relativePath, entry.type);
                        }

                        return done();
                    });
                }
                // Link update.
                else if (entry.type === CapsuleEntry.Type.LINK && !this._options.followLinks) {
                    // When not following links, a Capsule link entry should mirror an on-disk link entry. The
                    // getStat call above in this case is an lstat, meaning we can compare the database entry to
                    // the on-disk entry directly.
                    if (stat.isSymbolicLink()) {
                        const link = LinkEntry.makeFromSerialization(relativePath, entry);

                        if (!link.isIdentical(stat)) {
                            link.update(stat);
                            this._update(link);
                        }
                        return done();
                    }
                }

                // Type mismatch. Remove database entry.
                this._remove(relativePath, entry.type);
            }

            return done();
        });
    }

}

module.exports = DifferenceEngine;
