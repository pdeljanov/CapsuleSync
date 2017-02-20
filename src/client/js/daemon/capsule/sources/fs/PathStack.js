const debug = require('debug')('Capsule.Sources.FileSystem.PathStack');
const fs = require('fs');

const PathTools = require('../../../fs/PathTools.js');

class PathStack {
    constructor() {
        this.reset();
    }

    reset() {
        this._stack = [];
    }

    push(path, id, deviceId) {
        this._stack.push({ path: path, id: id, deviceId: deviceId });
        // debug(`Pushed: ${path}`);
    }

    interogatePath(testPath) {
        while (this._stack.length > 0) {
            const current = this._stack[this._stack.length - 1];
            const currentPath = (current && current.path) || '';

            if (!testPath.startsWith(currentPath)) {
                this._stack.pop();
                // debug(`Popping: ${popped.path}`);
            }
            else {
                break;
            }
        }
    }

    attempt(targetId, targetDeviceId) {
        return this._stack.find(level => (level.id === targetId) && (level.deviceId === targetDeviceId));
    }

    navigateTo(fullPath, fromPath, options) {
        return new Promise((resolve, reject) => {
            // Reset the path stack.
            this.reset();

            // Expand the subtree path into a list of all directories we must enter.
            const traverse = PathTools.getTraversalPath(fullPath);

            // Remove paths that prefix the root 'fromPath' path.
            while (traverse.length > 0) {
                // The head of the traverse array fully prefixes fromPath, this may be removed.
                if (fromPath.startsWith(traverse[0])) {
                    traverse.shift();
                }
                // The head of the traverse array is the same as from, or is completely different than from.
                else {
                    break;
                }
            }

            // Nothing to traverse...
            if (traverse.length === 0) {
                return resolve();
            }

            // Stat function to use depeding on if links are to be followed.
            const getStat = (options && options.followLinks) ? fs.stat : fs.lstat;

            // Navigation function.
            const doNavigate = (path) => {
                getStat(path, (err, stat) => {
                    if (!err) {
                        this.push(path, stat.ino, stat.dev);
                        if (traverse.length > 0) {
                            doNavigate(traverse.shift());
                        }
                        else {
                            resolve();
                        }
                    }
                    else {
                        debug(`Could not seek to directory: '${fullPath}' due to error: ${err.code} at '${path}'.`);
                        reject(err);
                    }
                });
            };

            return doNavigate(traverse.shift());
        });
    }

}

module.exports = PathStack;
