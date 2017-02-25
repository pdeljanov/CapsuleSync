const debug = require('debug')('Capsule.Sources.FileSystem.Watcher');
const nsfw = require('nsfw');
const path = require('path');

class Watcher {

    constructor(root) {
        this.change = () => {};
        this._root = root;
    }

    _handleError(error) {
        debug(`Notified of watch error: '${error}'.`);
    }

    static _getAffectedPaths(events) {
        const paths = events.map((event) => {
            if (event.action !== nsfw.actions.MODIFIED) {
                return event.directory;
            }
            return path.join(event.directory, event.file);
        });
        return paths.filter((value, index) => paths.indexOf(value) === index).sort();
    }

    _handleEvents(events) {
        const paths = Watcher._getAffectedPaths(events);
        debug(`Notified of ${events.length} event(s) affecting ${paths.length} path(s).`);
        this.change(paths);
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

    unload() {
        if (this._watcher) {
            const watcher = this._watcher;
            this._watcher = null;
            return watcher.stop();
        }
        return Promise.resolve();
    }

}

module.exports = Watcher;
