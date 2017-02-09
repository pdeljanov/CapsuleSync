// const debug = require('debug')('Capsule.Sources.FileSystem.PathStack');

class PathStack {
    constructor() {
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
}

module.exports = PathStack;
