const Source = require('../Source.js');

module.exports =
class GetSources {

    constructor(){
    }

    execute(db, resolve, reject){

        const kGetSource = `SELECT * FROM cs_sources;`;

        db.all(kGetSource, function (err, rows) {
            if(!err){
                resolve(rows.map(Source.fromCursor));
            }
            else {
                reject(err);
            }
        });
    }

}
