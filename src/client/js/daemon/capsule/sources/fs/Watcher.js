const debug = require('debug')('Capsule.Sources.FileSystem.Watcher');
const nsfw = require('nsfw');
const path = require('path');

class Watcher {

    constructor(root) {
        this.change = () => {};
        this._root = root;
    }

    _handleError(errors) {
        debug('Error received.');
        console.log(errors);
    }

    static _getAffectedPaths(events) {
        const paths = [].concat(...events.map((event) => {
            if (event.oldFile && event.newFile) {
                return [path.join(event.directory, event.oldFile), path.join(event.directory, event.newFile)];
            }
            else if (event.file || event.oldFile || event.newFile) {
                return [path.join(event.directory, event.file || event.oldFile || event.newFile)];
            }
            return [];
        }));
        return paths.filter((value, index) => paths.indexOf(value) === index);
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

}

module.exports = Watcher;
