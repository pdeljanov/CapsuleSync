const assert = require('assert');
const mediaType = require('media-type');

const PathTools = require('../fs/PathTools.js');
const ExpressionTree = require('../util/ExpressionTree.js');

class FilterSet extends ExpressionTree.Tree {

    static deserialize(serialized) {
        assert.strictEqual(typeof serialized, 'object', 'Serialized must be an object.');
        return new FilterSet(super.deserialize(serialized, filterFactory));

        function filterFactory(name, args) {
            const deserializer = FilterSet.Deserializers[name];
            assert(deserializer, `No deserializer found for filter named: ${name}.`);
            return deserializer(args);
        }
    }

    static empty() {
        return new FilterSet(null);
    }
}
FilterSet.Deserializers = {};

class TypeFilter extends ExpressionTree.Operand {

    constructor(type) {
        super();
        this._mediaType = mediaType.fromString(type);
    }

    evaluate(file) {
        const fileMediaType = mediaType.fromString(PathTools.extractMediaType(file.path));

        if (this._mediaType.type === fileMediaType.type) {
            return (this._mediaType.subtype === '*') || (this._mediaType.subtype === fileMediaType.subtype);
        }

        return false;
    }

    serialize() {
        return { type: { mediaType: this._mediaType.asString() } };
    }

    static deserialize(options) {
        return new TypeFilter(options.mediaType);
    }
}
FilterSet.Deserializers['type'] = TypeFilter.deserialize;

class ExtensionFilter extends ExpressionTree.Operand {

    constructor(extension) {
        super();
        this._ext = extension;
    }

    evaluate(file) {
        const extension = PathTools.extractExtension(file.path);
        return extension === this._ext;
    }

    serialize() {
        return { ext: { ext: this._ext } };
    }

    static deserialize(options) {
        return new ExtensionFilter(options.ext);
    }
}
FilterSet.Deserializers['ext'] = ExtensionFilter.deserialize;

class FileNameFilter extends ExpressionTree.Operand {

    constructor(string, test) {
        super();
        this._string = string;
        this._test = test;
    }

    serialize() {
        return { name: { string: this._string, test: this._test } };
    }

    evaluate(file) {
        const fileName = PathTools.extractFileName(file.path);
        switch (this._test) {
        case FileNameFilter.Test.Contains:
            return fileName.indexOf(this._string) !== -1;
        case FileNameFilter.Test.StartsWith:
            return fileName.startsWith(this._string);
        case FileNameFilter.Test.EndsWith:
            return fileName.endsWith(this._string);
        case FileNameFilter.Test.Exactly:
            return fileName === this._string;
        default:
            return false;
        }
    }

    static deserialize(options) {
        return new FileNameFilter(options.string, options.test);
    }
}

FileNameFilter.Test = {
    StartsWith: 'start',
    EndsWith:   'end',
    Contains:   'has',
    Exactly:    'is',
};

FilterSet.Deserializers['name'] = FileNameFilter.deserialize;


class SizeFilter extends ExpressionTree.Operand {
    constructor(inequality, size) {
        super();
        this._size = size;
        this._inequality = inequality;
    }

    evaluate(file) {
        switch (this._inequality) {
        case SizeFilter.Inequality.GreaterThan:
            return file.blob.byteLength > this._value;
        case SizeFilter.Inequality.GreaterThanOrEqual:
            return file.blob.byteLength >= this._value;
        case SizeFilter.Inequality.LessThan:
            return file.blob.byteLength < this._value;
        case SizeFilter.Inequality.LessThanOrEqual:
            return file.blob.byteLength <= this._value;
        default:
            return false;
        }
    }

    serialize() {
        return { size: { size: this._size, inequality: this._inequality } };
    }

    static deserialize(options) {
        return new SizeFilter(options.size, options.inequality);
    }
}

SizeFilter.Inequality = {
    GreaterThan:        '>',
    GreaterThanOrEqual: '>=',
    LessThan:           '<',
    LessThanOrEqual:    '<=',
};

FilterSet.Deserializers['size'] = SizeFilter.deserialize;


class CreationTimeFilter extends ExpressionTree.Operand {

    constructor(date) {
        super();
    }

    evaluate(file) {

    }

    serialize() {
        return { ctime: {} };
    }

    static deserialize(options) {
        return new CreationTimeFilter();
    }
}
FilterSet.Deserializers['ctime'] = CreationTimeFilter.deserialize;

module.exports = {
    FilterSet:          FilterSet,
    Equal:              ExpressionTree.Equal,
    NotEqual:           ExpressionTree.NotEqual,
    And:                ExpressionTree.And,
    Or:                 ExpressionTree.Or,
    TypeFilter:         TypeFilter,
    ExtensionFilter:    ExtensionFilter,
    FileNameFilter:     FileNameFilter,
    SizeFilter:         SizeFilter,
    CreationTimeFilter: CreationTimeFilter,
};
