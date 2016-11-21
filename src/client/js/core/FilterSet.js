'use strict';

const ExpressionTree = require('../util/ExpressionTree.js');

class FilterSet extends ExpressionTree.Tree {
    constructor(root){
        super(root);
    }

    static deserialize(serialized){
        return new FilterSet(super.deserialize(serialized, filterFactory));

        function filterFactory(name, args){
            switch(name){
                case 'type':  return TypeFilter.deserialize(args);
                case 'ext':   return ExtensionFilter.deserialize(args);
                case 'name':  return FileNameFilter.deserialize(args);
                case 'size':  return SizeFilter.deserialize(args);
                case 'ctime': return CreationTimeFilter.deserialize(args);
                default:
                    assert(true, `${name} does not name a valid filter.`);
            }
        }
    }
}

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

class SizeFilter extends ExpressionTree.Operand {
    constructor(inequality. size){
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
