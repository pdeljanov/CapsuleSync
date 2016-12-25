module.exports =
class RemoveFile {

    constructor(file){
        this._params = {
            content_id: file.id,
        };
    }

    execute(db, resolve, reject){
        const kRemoveFile = `DELETE FROM cs_content WHERE content_id = $content_id;`;

        db.run(kRemoveFile, this._params, (err) => {
            if(!err){
                resolve();
            }
            else {
                reject();
            }
        });
    }

};
