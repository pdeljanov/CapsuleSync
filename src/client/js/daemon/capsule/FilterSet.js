'use strict';

const assert = require('assert');
const ExpressionTree = require('../util/ExpressionTree.js');

class FilterSet extends ExpressionTree.Tree {

    constructor(root){
        super(root);
    }

    static deserialize(serialized){
        assert.strictEqual(typeof serialized, 'object', 'Serialized must be an object.');
        return new FilterSet(super.deserialize(serialized, filterFactory));

        function filterFactory(name, args){
            const deserializer = FilterSet.Deserializers[name];
            assert(deserializer, `No deserializer found for filter named: ${name}.`);
            return deserializer(args);
        }
    }
}
FilterSet.Deserializers = {};

class TypeFilter extends ExpressionTree.Operand {
    constructor(){
        super();
    }

    serialize(){
        return { 'type': { } };
    }

    static deserialize(options){
        return new TypeFilter();
    }
}
FilterSet.Deserializers['type'] = TypeFilter.deserialize;

class ExtensionFilter extends ExpressionTree.Operand {
    constructor(){
        super();
    }

    serialize(){
        return { 'ext': { } };
    }

    static deserialize(options){
        return new ExtensionFilter();
    }
}
FilterSet.Deserializers['ext'] = ExtensionFilter.deserialize;


class FileNameFilter extends ExpressionTree.Operand {
    constructor(){
        super();
    }

    serialize(){
        return { 'name': { } };
    }

    static deserialize(options){
        return new FileNameFilter();
    }
}
FilterSet.Deserializers['name'] = FileNameFilter.deserialize;


class SizeFilter extends ExpressionTree.Operand {
    constructor(inequality, size){
        super();
        this._size = size;
        this._inequality = inequality;
    }

    get(file){
        switch(inequality){
            case ">":
                return file.stat.size > this._value;
            case ">=":
                return file.stat.size >= this._value;
            case "<":
                return file.stat.size < this._value;
            case "<=":
                return file.stat.size <= this._value;
            default:
                return false;
        }
    }

    serialize(){
        return { 'size': { 'size': this._size, 'inequality': this._inequality } };
    }

    static deserialize(options){
        return new SizeFilter(options.size, options.inequality);
    }
}
FilterSet.Deserializers['size'] = SizeFilter.deserialize;


class CreationTimeFilter extends ExpressionTree.Operand {

    constructor(date){
        super();
    }

    get(file){

    }

    serialize(){
        return { 'ctime': {} };
    }

    static deserialize(options){
        return new CreationTimeFilter();
    }
}
FilterSet.Deserializers['ctime'] = CreationTimeFilter.deserialize;


module.exports = {
    'FilterSet': FilterSet,
    'Equal': ExpressionTree.Equal,
    'NotEqual': ExpressionTree.NotEqual,
    'And': ExpressionTree.And,
    'Or': ExpressionTree.Or,
    'TypeFilter': TypeFilter,
    'ExtensionFilter': ExtensionFilter,
    'FileNameFilter': FileNameFilter,
    'SizeFilter': SizeFilter,
    'CreationTimeFilter': CreationTimeFilter
};
