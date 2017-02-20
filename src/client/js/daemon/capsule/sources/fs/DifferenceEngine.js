const debug = require('debug')('Capsule.Sources.FileSystem.DifferenceEngine');
const async = require('async');
const fs = require('original-fs');

const PathTools = require('../../../fs/PathTools.js');
const Directory = require('../../../fs/Directory.js');
const Link = require('../../../fs/Link.js');
const { FileEntry, LinkEntry, DirectoryEntry, CapsuleEntry } = require('../../CapsuleEntry.js');

// DifferenceEngine(database, diskRoot, options).entry(path, databaseItem, done)
//                                              .path(path, done)
//
//  Callbacks:
//     _add(path, entry, done)
//     _remove(relativePath, entryType)
//     _update(entry)
//     _error(path, error)
//     _ignore(path)

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
            case DifferenceEngine.DirectoryCheck.ADDED:
                this._options.directoryRemoves = false;
                break;
            case DifferenceEngine.DirectoryCheck.REMOVED:
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

        this._add = (options && options.add) ? options.add.bind(this) : (d => d());
        this._remove = (options && options.remove) ? options.remove.bind(this) : (() => {});
        this._update = (options && options.update) ? options.update.bind(this) : (() => {});
        this._error = (options && options.error) ? options.error.bind(this) : (() => {});
        this._ignore = (options && options.ignore) ? options.ignore.bind(this) : (() => {});
    }

    _addFile(path, relativePath, stat, done) {
        this._add(path, FileEntry.makeFromStat(relativePath, stat), done);
    }

    _addDirectory(path, relativePath, stat, done) {
        this._add(path, DirectoryEntry.makeFromStat(relativePath, stat), done);
    }

    _addUnfollowedSymlink(path, relativePath, linkedPath, stat, done) {
        this._add(path, LinkEntry.makeFromStat(relativePath, linkedPath, stat), done);
    }

    _addSymlink(stack, path, relativePath, stat, done) {
        // Resolve the link.
        Link.resolve(path).then((link) => {
            // If following links, insert an entry appropriate for the linked type.
            if (this._options.followLinks) {
                // Following links makes us liable to creating infinite loops. Therefore, if for the given traversal
                // path we back track in such a way it'll lead us down the same path, create a link.
                const level = stack.attempt(link.linkedStat.ino, link.linkedStat.dev);

                if (level != null) {
                    debug(`Link cycle: '${path}' -> '${level.path}' detected. Ignoring further recursion.`);
                    const relativeLinkedPath = PathTools.stripRoot(level.path, this.root);
                    return this._addUnfollowedSymlink(path, relativePath, relativeLinkedPath, stat, done);
                }
                // File.
                else if (link.linkedStat.isFile()) {
                    return this._addFile(path, relativePath, link.linkedStat, done);
                }
                // Directory.
                else if (link.linkedStat.isDirectory()) {
                    return this._addDirectory(path, relativePath, link.linkedStat, done);
                }

                // Neither a file nor directory, therefore ignore.
                debug(`Linked: '${link.linkedPath}' is neither a file, or directory. Ignoring.`);
                this._ignore(link.linkedPath);
            }
            // If not following links, insert a link entry.
            else {
                // Get the absolute path of the item being linked to, then strip off the root to make it relative to the
                // tree.
                const absoluteLinkedPath = PathTools.getAbsoluteLinkPath(path, link.linkedPath);
                const relativeLinkedPath = PathTools.stripRoot(absoluteLinkedPath, this._root);
                return this._addUnfollowedSymlink(path, relativePath, relativeLinkedPath, stat, done);
            }

            return done();
        })
        .catch((resolveErr) => {
            debug(`Failed to resolve link: '${path}' due to error: ${resolveErr.code}.`);
            this._error(path, resolveErr);
            done();
        });
    }

    _processRemovedPaths(stack, fullPaths, done) {
        if (fullPaths.length > 0) {
            debug(`WARNING: Implement path removals in DifferenceEngine! Ignoring ${fullPaths.length} removals!`);
            /*
            fullPaths.forEach((fullPath) => {
                const relativePath = PathTools.stripRoot(fullPath, this._root);
                this._remove(relativePath, ...);
            });
            */
        }
        done();
    }

    _processAddedPath(stack, fullPath, stat, done) {
        const relativePath = PathTools.stripRoot(fullPath, this._root);

        // File addition.
        if (stat.isFile()) {
            return this._addFile(fullPath, relativePath, stat, done);
        }
        // Directory addition.
        else if (stat.isDirectory()) {
            return this._addDirectory(fullPath, relativePath, stat, done);
        }
        // Link addition.
        else if (stat.isSymbolicLink()) {
            return this._addSymlink(stack, fullPath, relativePath, stat, done);
        }

        // Not a file, directory, or link.
        debug(`Path: '${fullPath}' is neither a file, directory, nor link. Ignoring.`);
        this._ignore(fullPath);

        return done();
    }

    _processAddedPaths(stack, fullPaths, done) {
        async.eachLimit(fullPaths, this._options.concurrency, (fullPath, next) => {
            // Stat the path without following it, then process it.
            fs.lstat(fullPath, (err, stat) => {
                if (!err) {
                    return this._processAddedPath(stack, fullPath, stat, next);
                }

                // Error in stating the path.
                debug(`Failed to stat: '${fullPath}' with error: ${err.code}.`);
                this._error(fullPath, err);

                return next();
            });
        },
        () => done());
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
        const childrenInFs = Directory.getChildren(fullPath);
        const childrenInDb = this._tree.getChildren(relativePath);

        Promise.all([childrenInFs, childrenInDb]).then((values) => {
            let added = [];
            let removed = [];

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

    getStat(path, cb) {
        const stat = this._options.followLinks ? fs.stat : fs.lstat;
        return stat(path, cb);
    }

    path(stack, fullPath, done) {
        const relativePath = PathTools.stripRoot(fullPath, this._root);

        stack.navigateTo(fullPath, this._root)
            .then(() => this._tree.tryGet(relativePath))
            .then((data) => {
                const entry = data ? CapsuleEntry.deserialize(relativePath, data) : null;
                return this.entry(stack, fullPath, entry, done);
            })
            .catch(() => {
                debug(`Could not get entry at: '${relativePath}' due to error.`);
                done();
            });
    }

    entry(stack, fullPath, entry, done) {
        const relativePath = PathTools.stripRoot(fullPath, this._root);

        // Get the stat information for the item being scanned.
        return this.getStat(fullPath, (err, stat) => {
            // Update the traversal stack.
            if (!err && stat.isDirectory()) {
                stack.interogatePath(fullPath);
                stack.push(fullPath, stat.ino, stat.dev);
            }

            // Removal.
            if (err) {
                if (err.code !== 'ENOENT') {
                    debug(`Unexpected error: ${err.code} at: '${relativePath}'.`);
                    this._error(fullPath, err);
                }

                if (entry) {
                    this._remove(relativePath, entry.type);
                }
            }
            // Addition.
            else if (!entry) {
                return this._processAddedPath(stack, fullPath, stat, done);
            }
            // Update.
            else {
                // File update.
                if (stat.isFile() && entry.type === CapsuleEntry.Type.FILE) {
                    // Check if the file metadata has changed.
                    if (!entry.isIdentical(stat)) {
                        entry.update(stat);
                        this._update(entry);
                    }

                    return done();
                }
                // Directory update.
                else if (stat.isDirectory() && entry.type === CapsuleEntry.Type.DIRECTORY) {
                    // Check if the directory metadata has changed.
                    if (!entry.isIdentical(stat)) {
                        entry.update(stat);
                        this._update(entry);

                        // Check for modifications to the directory contents if requested.
                        if (this._options.directoryAdds || this._options.directoryRemoves) {
                            return this._calculateDirectoryDelta(fullPath, relativePath, (additions, removals) => {
                                this._processAddedPaths(stack, additions, () => {
                                    this._processRemovedPaths(stack, removals, done);
                                });
                            });
                        }
                    }

                    return done();
                }
                // When following links, a Capsule link entry is a weak-link, a link to break cycles
                // in the file system structure. The above getStat call is a stat in this case which gets us
                // the metadata of the file or directory the link points to, not the link itself. So redo
                // with an lstat.
                else if (entry.type === CapsuleEntry.Type.LINK && this._options.followLinks) {
                    // Get stat information of link itself.
                    return fs.lstat(fullPath, (linkErr, linkStat) => {
                        // Path does point to a link.
                        if (!linkErr && linkStat.isSymbolicLink()) {
                            // Check if the link metadata has changed.
                            if (!entry.isIdentical(linkStat)) {
                                // TODO: Do we have to check if the linked path changed? Symlinks have no atomic
                                // edit capability.
                                entry.update(linkStat);
                                this._update(entry);
                            }
                        }
                        // Path is not actually a link.
                        else {
                            this._remove(relativePath, entry.type);
                        }

                        return done();
                    });
                }
                // When not following links, a Capsule link entry should mirror an on-disk link entry. The
                // getStat call above in this case is an lstat, meaning we can compare the database entry to
                // the on-disk entry directly.
                else if (entry.type === CapsuleEntry.Type.LINK && !this._options.followLinks) {
                    // Check if symlink metadata has changed.
                    if (stat.isSymbolicLink()) {
                        if (!entry.isIdentical(stat)) {
                            entry.update(stat);
                            this._update(entry);
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

DifferenceEngine.DirectoryCheck = {
    NONE:    0,
    ADDED:   1,
    REMOVED: 2,
    BOTH:    3,
};

module.exports = DifferenceEngine;
