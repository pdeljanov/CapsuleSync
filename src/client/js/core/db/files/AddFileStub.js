module.exports =
class AddFileStub {

    constructor(uuid, displayName, isVariant, fileName, parentDirectory){
        this._params = {
            parent_id: parentDirectory.id(),
            uuid: uuid,
            display_name: displayName,
            name: name,
        };
    }

    execute(db, resolve, reject){

        const kAddFileStub = `INSERT OR ROLLBACK INTO cs_content (parent_id, uuid, display_name, name)
                              VALUES($parent_id, $uuid, display_name, $name);`;

        db.run(kAddFileStub, this._params, (err) => {
            if(!err){
                resolve();
            }
            else {
                reject();
            }
        });
    }

};
