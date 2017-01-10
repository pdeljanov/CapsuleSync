const Blob = require('./Blob.js');

module.exports =
class FileStub {
    constructor(cursor){
        this.id = cursor.content_id;
        this.uuid = cursor.ident;
        this.displayName = cursor.display_name;
        this.filename = cursor.name;
    }
}

class File extends FileStub {
    constructor(cursor){
        super(cursor);

        this.blob = null;
        this.available = false;

        if(this.available){
            this.blob = new Blob(cursor);
        }
    }
}
