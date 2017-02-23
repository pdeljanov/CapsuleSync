class ExclusionSet {
    constructor() {
        this._exclusions = [];
    }

    evaluate(path) {
        return false;
    }

    static empty() {
        return new ExclusionSet();
    }
}

module.exports = ExclusionSet;
