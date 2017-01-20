'use strict';

const assert = require('assert');
const debug = require('debug')('Capsule.FSDB.TreeAdapter');

const xxhash = require('xxhashjs');
const TreePath = require('./TreePath.js');

function makeNode(path, value){
    return {
        p: hash(TreePath.getParentPath(path)),
        d: value
    };
}

function getNodeData(node){
    return {
        path: node.key,
        data: node.value.d
    };
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
        indexName = `d.${indexName}`;
        return this._partition.index(indexName, function(node){
            return reduceFunc(node.d);
        });
    }

    drop(indexName){
        indexName = `d.${indexName}`;
        return this._partition.drop(indexName);
    }

    put(path, value){
        return this._partition.put(path, makeNode(path, value));
    }

    get(path){
        return this._partition.get(path).then(getNodeData);
    }

    getBy(indexName, value){
        indexName = `d.${indexName}`;
        return this._partition.getBy(indexName, value).then(entries => entries.map(getNodeData));
    }

    getChildren(path){
        const parentHash = hash(path);
        return this._partition.getBy('p', parentHash).then(entries => entries.map(getNodeData));
    }

    getParent(path){
        this.get(TreePath.getParentPath(path));
    }

    delSubTree(path){
        const options = {
            start: path,
            end: `${path}\xFF`
        };
        return this._partition.delRange(options);
    }
}

module.exports = TreeAdapter;
