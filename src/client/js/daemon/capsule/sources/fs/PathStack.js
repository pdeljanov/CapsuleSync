class PathStack {
    constructor() {
        this._stack = [];
    }

    push(fullPath, id) {
        this._stack.push({ path: fullPath, id: id });
    }

    interogatePath(fullPath) {
        while (this._stack.length > 0) {
            const current = this._stack[this._stack.length - 1];
            const currentPath = (current && current.path) || '';

            if (!fullPath.startsWith(currentPath)) {
                this._stack.pop();
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
