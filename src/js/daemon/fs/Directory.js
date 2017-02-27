const fs = require('original-fs');

class Directory {
    static getChildren(path) {
        return new Promise((resolve, reject) => {
            fs.readdir(path, (err, children) => {
                if (!err) {
                    resolve(children);
                }
                else {
                    reject(err);
                }
            });
        });
    }
}

module.exports = Directory;
