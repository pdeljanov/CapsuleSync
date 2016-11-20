'use strict';

const assert = require('assert');

class ExpressionTree {
    constructor(operator){
        this._operator = operator;
    }

    evaluate(input){
        if(this._operator){
            return this._operator.evaluate(input);
        }
        else {
            return true;
        }
    }

    serialize(){
        return this._operator.serialize();
    }
}

class Operand {
    constructor(){}
    get(){}
    serialize(){
        return {};
    }
}

class Operator {

    constructor(left, right){
        assert.strictEqual(typeof left, 'object', 'Left must be an object.');
        assert.strictEqual(typeof right, 'object', 'Right must be an object.');

        this._left = left;
        this._right = right;
    }

    evaluate(input) {
        return true;
    }
}

class NullOperator extends Operator {
    constructor(operand){
        assert.strictEqual(typeof operand, 'object', "Operand must be an object");

        super(null, null);
        this._operand = operand;
    }

    evaluate(input){
        return this._operand.get(input);
    }

    serialize(){
        return { 'null': this._operand.serialize() };
    }
}

class NotOperator extends Operator {
    constructor(operand){
        assert.strictEqual(typeof operand, 'object', "Operand must be an object");

        super(null, null);
        this._operand = operand;
    }

    evaluate(input){
        return !this._operand.get(input);
    }

    serialize(){
        return { 'not': this._operand.serialize() };
    }
}

class AndOperator extends Operator {
    constructor(left, right){
        super(left, right);
    }

    evaluate(input){
        return this._left.evaluate(input) && this._right.evaluate(input);
    }

    serialize(){
        return { 'and': [ this._left.serialize(), this._right.serialize() ] };
    }
}

class OrOperator extends Operator {
    constructor(left, right){
        super(left, right);
    }

    evaluate(input){
        return this._left.evaluate(input) || this._right.evaluate(input);
    }

    serialize(){
        return { 'or': [ this._left.serialize(), this._right.serialize() ] };
    }
}


module.exports = {
    'Tree': ExpressionTree,
    'Operand': Operand,
    'Null': NullOperator,
    'Not': NotOperator,
    'And': AndOperator,
    'Or': OrOperator
};
