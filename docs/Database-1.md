# Database-1 Design

## Objects

| Object | Description |
|--------|-------------|
| FileStub | File metadata. |
| Blob | On-disk file data metadata/versioning object. |
| File | A FileStub with on-disk Blob metadata. |
| FileList | A list of Files. |
| Directory | Directory metadata. |
| DirectoryList | A list of directories. |
| Source | A Source of files and directories. |
| SourceList | A list of Sources. |

## Discrete Work Units:

| Unit | Description | Batchable |
|------|-------------|-----------|
| addFile | Adds a FileStub with a Blob to the database. | Yes |
| addFileStub | Adds a FileStub without a Blob to the database. | Yes |
| removeFile | Removes a FileStub and Blob. | Yes |
| getFile | Gets a FileStub with Blob metadata. | No |
| getFileStub | Gets a FileStub. | No |
| getFileBlob | Gets a Blob. | No |
| recordFileBlobChanged | Records a local modification to a file blob. | Yes |
| syncFileBlob | Records a blob has been changed due to a synchronization. | Yes |
| getDirectory | Gets Directory information metadata. | No |
| getDirectoryContents | Gets Directory contents. | No |
| addDirectory | Adds a Directory. | Yes |
| moveDirectory | Moves a Directory. | No |
| removeDirectory | Removes a Directory. | Yes |
| addSource | Adds a source. | No |
| removeSource | Removes a source. | No |
| getSources | Gets all sources. | No |
| updateSource | Updates a source. | No |


### Example Code:
```
db.run(new Database.Actions.AddFile('aghsd24Zx', 'Valse de Fantastica.flac', parentDir));
```

## Directory Structure:

```
db/
 files/
   AddFile.js
   AddFileStub.js
   RemoveFile.js
   GetFile.js
   GetFileStub.js
   GetFileBlob.js
   RecordFileBlobChange.js
   SynchronizeFileBlob.js
 dirs/
   AddDirectory.js
   RemoveDirectory.js
   MoveDirectory.js
   GetDirectory.js
   GetDirectoryContents.js
 sources/
 variants/
 ```
