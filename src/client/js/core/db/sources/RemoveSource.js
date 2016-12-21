module.exports =
class RemoveSource {

    constructor(source){
        this._params = {
            source_id: source.id,
        };
    }

    execute(db, resolve, reject){

        const kRemoveSource = `DELETE FROM cs_sources WHERE source_id = $source_id;`

        db.run(kRemoveSource, this._params, function(err) {
            if(!err){
                resolve();
            }
            else {
                reject(err);
            }
        });
    }

}
