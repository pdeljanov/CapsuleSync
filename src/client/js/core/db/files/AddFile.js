module.exports =
class AddFile {

    constructor(uuid, displayName, isVariant, fileName, parentDirectory, blob){
        this._params = {
            parent_id: parentDirectory.id,
            uuid: uuid,
            display_name: displayName,
            name: name,
            // Blob Info
            hash_sha1: blob.sha1 || null,
            media_type_pri: '',
            media_type_sec: '',
            is_variant: (isVariant ? 1 : 0),
            byte_length: blob.byteLength,
            ctime: blob.creationTime,
            mtime: blob.modificationTimetime,
            uid: blob.uid,
            gid: blob.gid,
            ino: blob.inode,
            mode: blob.mode
        };
    }

    execute(db, resolve, reject){

        const kAddFile = `INSERT OR ROLLBACK INTO cs_content (parent_id, uuid, display_name, name)
                          VALUES($parent_id, $uuid, display_name, $name);
                          INSERT OR ROLLBACK INTO cs_blobs (content_id, hash_sha1, media_type_pri, media_type_sec, is_variant, byte_length, ctime, mtime, uid, gid, ino, mode)
                          VALUES(
                              (SELECT content_id FROM cs_content where uuid = $uuid),
                              $hash_sha1, $media_type_pri, $media_type_sec, $is_variant, $byte_length, $ctime, $mtime, $uid, $gid, $ino, $mode
                          );`;

        db.run(kAddFile, this._params, (err) => {
            if(!err){
                resolve();
            }
            else {
                reject();
            }
        });
    }

};
