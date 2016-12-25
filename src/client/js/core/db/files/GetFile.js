const NormalizedPath = require('../../../util/NormalizedPath.js');

module.exports =
class GetFile {

    constructor(path){
        const components = NormalizedPath.splitLast(path);
        this._params = {
            name: components[1],
            path: components[0]
        };
    }

    execute(db, resolve, reject){

        db.get(kGetFile, this._params, (err) => {
            if(!err){
                resolve();
            }
            else {
                reject();
            }
        });
    }

};
