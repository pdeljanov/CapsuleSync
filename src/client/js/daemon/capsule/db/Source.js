module.exports =
class Source {

    constructor(){
        this.id = 0;
        this.byteLength = 0;
        this.files = 0;
        this.directories = 0;
        this.displayName = '';
        this.rootPath = '';
    }

    static fromCursor(cursor){
        let obj =  new Source();
        obj.id = cursor.source_id;
        obj.rootPath = cursor.root_path;
        obj.files = cursor.num_files;
        obj.directories = cursor.num_directories;
        obj.byteLength = cursor.byte_length;
        return obj;
    }
};
