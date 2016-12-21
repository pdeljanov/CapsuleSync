module.exports =
class UpdateSource {

    constructor(source){
        this._params = {
            source_id: source.id,
            root_path: source.rootPath,
            display_name: source.displayName,
            num_files: source.files,
            num_directories: source.directories,
            byte_length: source.byteLength
        };
    }

    execute(db, resolve, reject){

        const kUpdateSource = `UPDATE OR FAIL cs_sources
                                          SET root_path = $root_path,
                                              display_name = $display_name,
                                              num_files = $num_files,
                                              num_directories = $num_directories,
                                              byte_length = $byte_length
                                        WHERE source_id = $source_id;`;

        db.run(kUpdateSource, this._params, function (err) {
            if(!err){
                resolve();
            }
            else {
                reject(err);
            }
        });
    }

}
