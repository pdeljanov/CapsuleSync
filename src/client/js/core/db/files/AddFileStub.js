module.exports =
class AddFileStub {

    constructor(uuid, displayName, isVariant, fileName, parentDirectory){
        this._params = {
            parent_id: parentDirectory.id,
            uuid: uuid,
            normalized_path: '',
            origin_path: '',
            origin_name: displayName,
            name: name,
        };
    }

    execute(db, resolve, reject){

        const kAddFileStub = `INSERT OR IGNORE INTO cs_paths (source_id, normalized_path, origin_path, depth, num_files, num_directories)
                              VALUES($source_id, $normalized_path, $origin_path, 1, 0, 0);
                              INSERT OR ROLLBACK INTO cs_content (path_id, ident, name, origin_name)
                        	  VALUES(
                                  (SELECT path_id FROM cs_paths WHERE normalized_path = $normalized_path),
                                  $uuid, $name, $origin_name
                              );`;

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




class CaseEncoder {

    static encode(caseyPath){

    }

}
