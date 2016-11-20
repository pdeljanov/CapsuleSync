'use strict';

const assert = require('assert');

class OperatorAST {
    constructor(operator){
        this._operator = operator;
    }

    test(input){
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

class Expression {
    constructor(){}
    run(){}
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
    constructor(expression){
        assert.strictEqual(typeof expression, 'object', "Expression must be an object");

        super(null, null);
        this._expression = expression;
    }

    evaluate(input){
        return this._expression.run(input);
    }

    serialize(){
        return { 'null': this._expression.serialize() };
    }
}

class NotOperator extends Operator {
    constructor(expression){
        assert.strictEqual(typeof expression, 'object', "Expression must be an object");

        super(null, null);
        this._expression = expression;
    }

    evaluate(input){
        return !this._expression.run(input);
    }

    serialize(){
        return { 'not': this._expression.serialize() };
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
    'AST': OperatorAST,
    'Null': NullOperator,
    'Not': NotOperator,
    'And': AndOperator,
    'Or': OrOperator,
    'Expr': Expression
};
