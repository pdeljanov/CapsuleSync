'use strict';

const assert = require('assert');
const debug = require('debug')('Capsule.FSDB.TreeAdapter');

const xxhash = require('xxhash');
const endStream = require('end-stream');

const { Buffer } = require('buffer');
const TreePath = require('./TreePath.js');

function hash(value) {
    const XXHASH_SEED = 0xFEED1075;
    return xxhash.hash(Buffer.from(value), XXHASH_SEED, 'hex');
}

function makeNode(path, value) {
    return {
        p: hash(TreePath.getParentPath(path)),
        d: value,
    };
}

function getNodeData(node) {
    return {
        path: node.key,
        data: node.value.d,
    };
}

class TreeAdapter {

    constructor(partition) {
        this._partition = partition;
        this._partition.index('p');
    }

    index(indexName, reduceFunc) {
        indexName = `d.${indexName}`;
        return this._partition.index(indexName, function(node){
            return reduceFunc(node.d);
        });
    }

    drop(indexName) {
        indexName = `d.${indexName}`;
        return this._partition.drop(indexName);
    }

    put(path, value) {
        return this._partition.put(path, makeNode(path, value));
    }

    putMany(pairs) {
        const batch = pairs.map((pair) => {
            return { type: 'put', key: pair.key, value: makeNode(pair.key, pair.value) };
        });
        return this._partition.batch(batch);
    }

    get(path) {
        return this._partition.get(path).then(getNodeData);
    }

    getBy(indexName, value) {
        indexName = `d.${indexName}`;
        return this._partition.getBy(indexName, value).then(entries => entries.map(getNodeData));
    }

    getChildren(path) {
        const parentHash = hash(path);
        return this._partition.getBy('p', parentHash).then(entries => entries.map(getNodeData));
    }

    getParent(path) {
        this.get(TreePath.getParentPath(path));
    }

    delSubTree(path) {
        const options = {
            start: path,
            end:   `${path}\xFF`,
        };
        return this._partition.delRange(options);
    }

    scanSubTree(path, cb) {
        return new Promise((resolve) => {
            const options = {
                start: path,
                end:   `${path}\xFF`,
            };

            return this._partition.createReadStream(options)
                .pipe(endStream((data, next) => {
                    data.value = data.value.d;
                    cb(data, next);
                }))
                .on('finish', resolve);
        });
    }
}

module.exports = TreeAdapter;
