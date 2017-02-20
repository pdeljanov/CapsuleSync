// const assert = require('assert');
// const debug = require('debug')('Capsule.FSDB.TreeAdapter');

const xxhash = require('xxhash');
// const endStream = require('end-stream');
const through2 = require('through2');

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
    return node.d;
}

function getNodeDataKV(node) {
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
        return this._partition.index(`d.${indexName}`, node => reduceFunc(node.d));
    }

    drop(indexName) {
        return this._partition.drop(`d.${indexName}`);
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
        return this._partition.get(TreePath.normalizePath(path)).then(getNodeData);
    }

    tryGet(path) {
        return this._partition.get(TreePath.normalizePath(path)).then(getNodeData).catch(() => Promise.resolve(null));
    }

    getBy(indexName, value) {
        return this._partition.getBy(`d.${indexName}`, value).then(entries => entries.map(getNodeDataKV));
    }

    getChildren(path) {
        const parentHash = hash(TreePath.normalizePath(path));
        return this._partition.getBy('p', parentHash).then(entries => entries.map(getNodeDataKV));
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

            this._partition.createReadStream(options)
                .pipe(through2.obj((data, enc, next) => {
                    data.value = data.value.d;
                    cb(data, next);
                }))
                .on('finish', resolve);

            // this._partition.createReadStream(options)
            //     .pipe(endStream((data, next) => {
            //         data.value = data.value.d;
            //         cb(data, next);
            //     }))
            //     .on('finish', resolve);
        });
    }
}

module.exports = TreeAdapter;
