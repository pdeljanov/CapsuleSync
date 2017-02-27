const fs = require('original-fs');

class Link {

    constructor(path) {
        this._path = path;
    }

    get path() {
        return this._path;
    }

    resolve() {
        return new Promise((resolve, reject) => {
            // Read the link to get the linked path.
            fs.readlink(this._path, (readLinkErr, linkedPath) => {
                if (!readLinkErr) {
                    // Stat the link to get information about the file the link(s) points to.
                    fs.stat(this._path, (statErr, linkedStat) => {
                        if (!statErr) {
                            resolve(new ResolvedLink(this._path, linkedPath, linkedStat));
                        }
                        else {
                            reject(statErr);
                        }
                    });
                }
                else {
                    reject(readLinkErr);
                }
            });
        });
    }

    static resolve(path) {
        const link = new Link(path);
        return link.resolve();
    }

}

class ResolvedLink extends Link {
    constructor(path, linkedPath, linkedStat) {
        super(path);
        this._linkedPath = linkedPath;
        this._linkedStat = linkedStat;
    }

    get linkedPath() {
        return this._linkedPath;
    }

    get linkedStat() {
        return this._linkedStat;
    }
}

module.exports = Link;
