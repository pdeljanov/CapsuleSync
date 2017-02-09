const debug = require('debug')('Capsule.Sources.FileSystem.Watcher');
const nsfw = require('nsfw');
const fs = require('original-fs');
const path = require('path');

const PathTools = require('../../../fs/PathTools.js');
const Link = require('../../../fs/Link.js');
const { FileEntry, LinkEntry } = require('../../CapsuleEntry.js');

class Watcher {

    constructor(root, options) {
        this.change = () => {};
        this._root = root;

        this._options = {
            followLinks: (options.followLinks || false),
        };
    }

    _handleError(errors) {
        debug('Error received.');
        console.log(errors);
    }

    static _handleAddedLink(linkPath, relativeLinkPath, linkStat) {
        return Link.resolve(linkPath).then((link) => {
            // If following links...
            if (this._options.followLinks) {
                // If the link points to a directory, the directory should scanned.
                if (link.linkedStat.isDirectory()) {
                    return { action: Watcher.Actions.SCAN_PATH, path: linkPath };
                }
                // If the link points to a file, the file should be added.
                else if (link.linkedStat.isFile()) {
                    const fileEntry = FileEntry.makeFromStat(relativeLinkPath, link.linkedStat);
                    return { action: Watcher.Actions.ADD_ENTRY, entry: fileEntry };
                }

                // Neither a file or directory, the entry will be ignored.
                debug(`Link at: ${linkPath} resolves to neither a file or directory. Ignoring.`);
                return null;
            }

            // If not following links, just create the link itself.
            const linkEntry = LinkEntry.makeFromStat(relativeLinkPath, link.linkedPath, linkStat);
            return { action: Watcher.Actions.ADD_ENTRY, entry: linkEntry };
        });
    }

    static _processCreatedEvent(event) {
        return new Promise((resolve) => {
            const changedPath = path.join(event.directory, event.file);
            const relativePath = PathTools.stripRoot(changedPath, this._root);

            fs.lstat(changedPath, (err, stat) => {
                if (!err) {
                    if (stat.isFile()) {
                        const file = FileEntry.makeFromStat(relativePath, stat);
                        resolve({ action: Watcher.Actions.ADD_ENTRY, entry: file });
                    }
                    else if (stat.isDirectory()) {
                        resolve({ action: Watcher.Actions.SCAN_PATH, path: changedPath });
                    }
                    else if (stat.isSymbolicLink()) {
                        Watcher._handleAddedLink(changedPath, stat)
                            .then(resolve)
                            .catch(() => {
                                debug(`Failed to resolve link at: ${changedPath} due to error: ${err.code}.`);
                                resolve(null);
                            });
                    }
                    else {
                        debug(`Path: '${changedPath}' is neither a file, directory, nor link. Ignoring.`);
                        resolve(null);
                    }
                }
                else {
                    resolve(null);
                }
            });
        });
    }

    static _processDeletedEvent(event) {
        return new Promise((resolve) => {
            const changedPath = path.join(event.directory, event.file);
            resolve({ action: Watcher.Actions.REMOVE, path: changedPath });
        });
    }

    static _processModifiedEvent(event) {
        return new Promise((resolve) => {
            const changedPath = path.join(event.directory, event.file);
            resolve({ action: Watcher.Actions.UPDATE, path: changedPath });
        });
    }

    static _processRenamedEvent(event) {
        return new Promise((resolve) => {
            const oldPath = path.join(event.directory, event.oldFile);
            const newPath = path.join(event.directory, event.newFile);
            resolve({ action: Watcher.Actions.MOVE, from: oldPath, to: newPath });
        });
    }

    static _processEvent(event) {
        switch (event.action) {
        case nsfw.actions.CREATED:
            return Watcher._processCreatedEvent(event);
        case nsfw.actions.DELETED:
            return Watcher._processDeletedEvent(event);
        case nsfw.actions.MODIFIED:
            return Watcher._processModifiedEvent(event);
        case nsfw.actions.RENAMED:
            return Watcher._processRenamedEvent(event);
        default:
            return null;
        }
    }

    static _compactEvents(events) {
        return events;
    }

    _handleEvents(events) {
        const eventDigest = Watcher._compactEvents(events);
        debug(`Notified of ${events.length} event(s), compacting to ${eventDigest.length}.`);

        const promises = eventDigest.map(Watcher._processEvent);
        Promise.all(promises).then((changes) => {
            this.change(changes.filter(event => event != null));
        });
    }

    load() {
        return new Promise((resolve, reject) => {
            const options = {
                debounceMS:    500,
                errorCallback: this._handleError.bind(this),
            };

            nsfw(this._root, this._handleEvents.bind(this), options).then((watcher) => {
                this._watcher = watcher;
                return watcher.start();
            })
            .then(() => {
                resolve();
            })
            .catch(() => {
                reject();
            });
        });
    }

}

Watcher.Actions = {
    ADD_ENTRY: 0,
    SCAN_PATH: 1,
    UPDATE:    2,
    MOVE:      3,
    REMOVE:    4,
};

module.exports = Watcher;
