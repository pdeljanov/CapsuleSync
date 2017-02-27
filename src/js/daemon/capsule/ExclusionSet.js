class ExclusionSet {
    constructor(paths) {
        this._exclusions = paths || [];
    }

    evaluate(path) {
        for (let i = 0; i < this._exclusions.length; i += 1) {
            if (path.startsWith(this._exclusions[i])) {
                return true;
            }
        }
        return false;
    }

    serialize() {
        return this._exclusions;
    }

    static deserialize(serialization) {
        return new ExclusionSet(serialization);
    }

    static empty() {
        return new ExclusionSet();
    }
}

module.exports = ExclusionSet;
