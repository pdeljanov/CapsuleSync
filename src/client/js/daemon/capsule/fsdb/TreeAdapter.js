'use strict';

const assert = require('assert');
const debug = require('debug')('Capsule.FSDB.TreeAdapter');

const xxhash = require('xxhashjs')

function makeNode(value){
    return {
        p: hash(getParentPath(path)),
        data: value
    };
}

function getData(node){
    return node.data;
}

function getParentPath(path){
    /*
        home                 -> /
        home/                -> /
        home/user            -> home/
        home/user/           -> home/
        home/user/file.dat   -> home/user/
    */
    const offset = (path[path.length - 1] === '/') ? 1 : 0;
    return path.substr(0, path.lastIndexOf('/', path.length - offset - 1)) + '/';
}

function hash(value){
    const XXHASH_SEED = 0xFEED1075;
    return xxhash.h32(value, XXHASH_SEED).toString(16);
}

class TreeAdapter {

    constructor(partition){
        this._partition = partition;
        this._partition.index('p');
    }

    index(indexName, reduceFunc){
        indexName = `data.${indexName}`;
        return this._partition.index(indexName, reduceFunc);
    }

    drop(indexName){
        indexName = `data.${indexName}`;
        return this._partition.drop(indexName, reduceFunc);
    }

    put(path, value){
        return this._partition.put(path, makeNode(value));
    }

    get(path){
        return this._partition.get(path).then(getData);
    }

    getBy(indexName, value){
        indexName = `data.${indexName}`;
        return this._partition.getBy(indexName, reduceFunc);
    }

    getChildren(path){
        const parentHash = hash(getParentPath(path));
        return this._partition.getBy('parent', parentHash).then(entries => entries.map(getData));
    }

    getDescendants(path){

    }

    getParent(path){
        this.get(getParentPath(path));
    }

}
