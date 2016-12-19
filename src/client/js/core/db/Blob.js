module.exports = 
class Blob {
    constructor(cursor){
        this.sha1 = cursor.hash_sha1;
        //this.mediaType = new MediaType(cursor.media_type_pri, cursor.media_type_sec, cursor.is_variant);
        this.byteLength = cursor.byte_length;
        this.creationTime = cursor.ctime;
        this.modificationTime = cursor.mtime;
        this.uid = cursor.uid;
        this.gid = cursor.gid;
        this.inode = cursor.ino;
        this.mode = cursor.mode;
    }
}
