'use strict';

const Blob = require('./Blob.js');
const IdGenerator = require('../util/IdGenerator.js');
const PathTools = require('../fs/PathTools.js');

module.exports =
class Directory {

    constructor(id, path, displayName, dirName) {
        this._data = {
            id:          id,
            path:        path,
            displayName: displayName,
            dirName:     dirName,
        };
    }

}
