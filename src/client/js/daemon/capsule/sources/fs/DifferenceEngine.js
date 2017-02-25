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
//     _add(fullPath,, entry, done)
//     _remove(fullPath, relativePath, entryType, done)
//     _update(fullPath, entry, done)
//     _error(fullPath, error)
//     _ignore(fullPath)

class DifferenceEngine {

    constructor(tree, root, options) {
        this._tree = tree;
        this._root = root;

        this._options = {
            forceDirectoryContents: (options && options.forceDirectoryContents) ? options.forceDirectoryContents : false,
            directoryAdds:          true,
            directoryRemoves:       true,
            followLinks:            (options && options.followLinks) ? options.followLinks : true,
            concurrency:            (options && options.concurrency) ? options.concurrency : 8,
        };

        if (Object.prototype.hasOwnProperty.call(options, 'directoryContents')) {
            switch (options.directoryContents) {
            case DifferenceEngine.DirectoryContents.ADDED:
                this._options.directoryRemoves = false;
                break;
            case DifferenceEngine.DirectoryContents.REMOVED:
                this._options.directoryAdds = false;
                break;
            case DifferenceEngine.DirectoryContents.NONE:
                this._options.directoryRemoves = false;
                this._options.directoryAdds = false;
                break;
            default:
                break;
            }
        }

        // Overwrite default filter and exclusion functions if handles exist.
        if (options && options.filter) {
            this._filter = options.filter.bind(this);
        }

        if (options && options.exclude) {
            this._exclude = options.exclude.bind(this);
        }

        // Overwrite default handlers if custom handlers exist.
        if (options && options.add) {
            this._add = options.add.bind(this);
        }

        if (options && options.remove) {
            this._remove = options.remove.bind(this);
        }

        if (options && options.update) {
            this._update = options.update.bind(this);
        }

        if (!options || (options && !options.add && !options.remove && !options.update)) {
            this._changes = [];
        }

        this._error = Object.prototype.hasOwnProperty.call(options, 'error') ? options.error.bind(this) : (() => {});
        this._ignore = Object.prototype.hasOwnProperty.call(options, 'ignore') ? options.ignore.bind(this) : (() => {});
    }

    _filter() {
        return true;
    }

    _exclude() {
        return false;
    }

    _add(fullPath, entry, done) {
        if (this._changes) {
            this._changes.push({ operation: DifferenceEngine.Change.ADD, fullPath: fullPath, entry: entry });
        }
        done();
    }

    _remove(fullPath, relativePath, type, done) {
        if (this._changes) {
            this._changes.push({
                operation:    DifferenceEngine.Change.REMOVE,
                fullPath:     fullPath,
                relativePath: relativePath,
                type:         type,
            });
        }
        done();
    }

    _update(fullPath, entry, done) {
        if (this._changes) {
            this._changes.push({ operation: DifferenceEngine.Change.UPDATE, fullPath: fullPath, entry: entry });
        }
        done();
    }

    _addFile(path, relativePath, stat, done) {
        const entry = FileEntry.fromFileInfo(relativePath, stat);
        if (this._filter(entry)) {
            return this._add(path, entry, done);
        }
        return done();
    }

    _addDirectory(path, relativePath, stat, done) {
        if (!this._exclude(path)) {
            return this._add(path, DirectoryEntry.fromDirectoryInfo(relativePath, stat), done);
        }
        return done();
    }

    _addUnfollowedSymlink(path, relativePath, linkedPath, stat, done) {
        const entry = LinkEntry.fromFileInfo(relativePath, linkedPath, stat);
        if (this._filter(entry)) {
            return this._add(path, entry, done);
        }
        return done();
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
            // If not following links, insert a link entry with the original linked path.
            else {
                return this._addUnfollowedSymlink(path, relativePath, link.linkedPath, stat, done);
            }

            return done();
        })
        .catch((resolveErr) => {
            debug(`Failed to resolve link: '${path}' due to error: ${resolveErr.code}.`);
            this._error(path, resolveErr);
            // TODO: Handle ELOOP errors. When not following symlinks, these
            // links should be faithfully represented.
            done();
        });
    }

    _processRemovedPaths(stack, entries, done) {
        async.eachLimit(entries, this._options.concurrency, (entry, next) => {
            this._remove(entry.fullPath, entry.relativePath, entry.type, next);
        },
        () => done());
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

    static _calculateDirectoryDeltaAdds(currentNames, previousEntries) {
        const previous = new Set(previousEntries.map(item => CapsuleEntry.getName(item.data)));
        return currentNames.filter(item => !previous.has(item));
    }

    static _calculateDirectoryDeltaRemoves(currentNames, previousEntries) {
        const current = new Set(currentNames);
        return previousEntries.filter(item => !current.has(CapsuleEntry.getName(item.data)));
    }

    _calculateDirectoryDelta(fullPath, relativePath, done) {
        const childrenInFs = Directory.getChildren(fullPath);
        const childrenInDb = this._tree.getChildren(relativePath);

        Promise.all([childrenInFs, childrenInDb]).then((values) => {
            let added = [];
            let removed = [];

            if (this._options.directoryAdds) {
                added = DifferenceEngine._calculateDirectoryDeltaAdds(values[0], values[1])
                            .map(item => PathTools.appendRoot(fullPath, item));
            }

            if (this._options.directoryRemoves) {
                removed = DifferenceEngine._calculateDirectoryDeltaRemoves(values[0], values[1])
                            .map(item => ({
                                fullPath:     PathTools.appendRoot(fullPath, item.path),
                                relativePath: PathTools.appendRoot(relativePath, item.path),
                                type:         CapsuleEntry.getType(item.data),
                            }));
            }

            done(added, removed);
        })
        .catch((err) => {
            debug(`Could not scan directory at: '${relativePath}' due to error: ${err.code}.`);
            done();
        });
    }

    _inspectDirectoryContents(stack, fullPath, relativePath, done) {
        if (this._options.directoryAdds || this._options.directoryRemoves) {
            return this._calculateDirectoryDelta(fullPath, relativePath, (additions, removals) => {
                this._processAddedPaths(stack, additions, () => {
                    this._processRemovedPaths(stack, removals, done);
                });
            });
        }
        return done();
    }

    changes() {
        return this._changes || [];
    }

    clear() {
        if (this._changes) {
            this._changes = [];
        }
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
            // Directory removal due to exclusion.
            if (entry && (entry.type === CapsuleEntry.Type.DIRECTORY) && this._exclude(fullPath)) {
                return this._remove(fullPath, relativePath, entry.type, done);
            }
            // File or link removal due to filter.
            else if (entry && (entry.type !== CapsuleEntry.Type.DIRECTORY) && !this._filter(entry)) {
                return this._remove(fullPath, relativePath, entry.type, done);
            }

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
                    return this._remove(fullPath, relativePath, entry.type, done);
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
                        return this._update(fullPath, entry, done);
                    }

                    return done();
                }
                // Directory update.
                else if (stat.isDirectory() && entry.type === CapsuleEntry.Type.DIRECTORY) {
                    // Check if the directory metadata has changed.
                    const isIdentical = entry.isIdentical(stat);

                    // If the directory metadata changed, deeply inspect the directory contents.
                    if (!isIdentical) {
                        entry.update(stat);
                        return this._update(fullPath, entry, () =>
                            this._inspectDirectoryContents(stack, fullPath, relativePath, done));
                    }
                    // Deeply inspect the directory contents if the deep option is set.
                    else if (this._options.forceDirectoryContents) {
                        return this._inspectDirectoryContents(stack, fullPath, relativePath, done);
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
                                entry.update(linkStat);
                                return this._update(fullPath, entry, done);
                            }

                            // Link is identical.
                            return done();
                        }

                        // Path is not actually a link.
                        return this._remove(fullPath, relativePath, entry.type, done);
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
                            return this._update(fullPath, entry, done);
                        }
                        return done();
                    }
                }

                // Type mismatch or irregular filesystem object. Remove database entry.
                return this._remove(fullPath, relativePath, entry.type, done);
            }

            return done();
        });
    }

}

DifferenceEngine.DirectoryContents = {
    NONE:    0,
    ADDED:   1,
    REMOVED: 2,
    BOTH:    3,
};

DifferenceEngine.Change = {
    ADD:    0,
    REMOVE: 1,
    UPDATE: 2,
};

module.exports = DifferenceEngine;
