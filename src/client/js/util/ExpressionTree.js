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

    static deserialize(serialized, operandFactory){
        let node = Object.keys(serialized);
        assert(node.length === 1, 'FilterSet nodes should only contain one key.');

        let nodeContents = serialized[node[0]];

        switch(node[0]){
            case 'and':
                assert(nodeContents.length === 2, 'AndOperator requires 2 child nodes.');
                return new AndOperator(
                    ExpressionTree.deserialize(nodeContents[0], operandFactory),
                    ExpressionTree.deserialize(nodeContents[1], operandFactory)
                );

            case 'or':
                assert(nodeContents.length === 2, 'OrOperator requires 2 child nodes.');
                return new OrOperator(
                    ExpressionTree.deserialize(nodeContents[0], operandFactory),
                    ExpressionTree.deserialize(nodeContents[1], operandFactory)
                );

            case 'not':
                assert(nodeContents.length === 1, 'NotEqualOperator requires 1 child node.');
                return new NotEqualOperator(ExpressionTree.deserialize(nodeContents[0], operandFactory));

            case 'null':
                assert(nodeContents.length === 1, 'EqualOperator requires 1 child node.');
                return new EqualOperator(ExpressionTree.deserialize(nodeContents[0], operandFactory));

            default:
                assert.strictEqual(typeof nodeContents, 'object', 'Operand node requires object as child.');
                return operandFactory(node[0], nodeContents);
        }
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

class EqualOperator extends Operator {
    constructor(operand){
        assert.strictEqual(typeof operand, 'object', 'Operand must be an object');

        super(null, null);
        this._operand = operand;
    }

    evaluate(input){
        return this._operand.get(input);
    }

    serialize(){
        return { 'null': [ this._operand.serialize() ] };
    }
}

class NotEqualOperator extends Operator {
    constructor(operand){
        assert.strictEqual(typeof operand, 'object', 'Operand must be an object');

        super(null, null);
        this._operand = operand;
    }

    evaluate(input){
        return !this._operand.get(input);
    }

    serialize(){
        return { 'not': [ this._operand.serialize() ] };
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
    'Equal': EqualOperator,
    'NotEqual': NotEqualOperator,
    'And': AndOperator,
    'Or': OrOperator
};
