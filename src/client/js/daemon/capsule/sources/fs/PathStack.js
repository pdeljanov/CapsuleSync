const debug = require('debug')('Capsule.Sources.FileSystem.PathStack');

class PathStack {
    constructor() {
        this._stack = [];
    }

    push(path, id) {
        this._stack.push({ path: path, id: id });
        debug(`Pushed: ${path}`);
    }

    interogatePath(fullPath) {
        while (this._stack.length > 0) {
            const current = this._stack[this._stack.length - 1];
            const currentPath = (current && current.path) || '';

            if (!fullPath.startsWith(currentPath)) {
                const popped = this._stack.pop();
                debug(`Popping: ${popped.path}`);
            }
            else {
                break;
            }
        }
    }

    attempt(toId) {
        return this._stack.find(level => level.id === toId);
    }
}

module.exports = PathStack;
