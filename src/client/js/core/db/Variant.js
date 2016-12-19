const MediaType = require('../../util/MediaType.js');

module.exports =
class Variant {

    constructor(){
        this.mediaType = null;
        this.sha1 = null;
    }

    static fromCursor(cursor){
        let obj =  new Variant();
        //obj.mediaType = new MediaType(cursor.media_type_pri, cursor.media_type_sec, cursor.media_type_params);
        obj.sha1 = cursor.hash_sha1;
        return obj;
    }
};
