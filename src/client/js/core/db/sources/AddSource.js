module.exports =
class AddSource {

    constructor(displayName, rootPath){
        this._params = {
            root_path: rootPath,
            display_name: displayName,
            name: name,
        };
    }

    execute(db, resolve, reject){

        const kAddSource = `INSERT OR FAIL INTO cs_sources (root_path, display_name, num_files, num_directories, byte_length)
                            VALUES($root_path, $display_name, 0, 0, 0);`

        db.run(kAddSource, this._params, function (err) {
            if(!err){
                resolve();
            }
            else {
                reject(err);
            }
        });
    }

}
