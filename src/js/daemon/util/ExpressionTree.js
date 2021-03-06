const assert = require('assert');

class ExpressionTree {
    constructor(operator) {
        this._operator = operator;
    }

    evaluate(input) {
        if (this._operator) {
            return this._operator.evaluate(input);
        }
        return true;
    }

    serialize() {
        return (this._operator && this._operator.serialize()) || {};
    }

    static deserialize(serialized, operandFactory) {
        const nodeKey = Object.keys(serialized);

        // If there is no nodeKeys, the ExpressionTree is empty.
        if (nodeKey.length === 0) {
            return null;
        }

        // If there is a nodeKey, there should be only one.
        assert(nodeKey.length === 1, 'FilterSet parent nodes should only contain one key.');

        const nodeName = nodeKey[0];
        const nodeChildren = serialized[nodeName];

        if (ExpressionTree.Deserializers[nodeName]) {
            // TODO: Assert nodeChildren is an array.
            // assert.strictEqual(typeof nodeChildren, 'array', 'Operator nodes require an array of child nodes.');
            return ExpressionTree.Deserializers[nodeName](nodeChildren, operandFactory);
        }

        assert.strictEqual(typeof nodeChildren, 'object', 'Operand node requires an object as a child node.');
        return operandFactory(nodeName, nodeChildren);
    }

}
ExpressionTree.Deserializers = {};

class Operand {
    evaluate() {
        return false;
    }

    serialize() {
        return {};
    }
}

class Operator {

    constructor(left, right) {
        assert.strictEqual(typeof left, 'object', 'Left must be an object.');
        assert.strictEqual(typeof right, 'object', 'Right must be an object.');

        this._left = left;
        this._right = right;
    }

    evaluate() {
        return true;
    }
}

class EqualOperator extends Operator {
    constructor(operand) {
        assert.strictEqual(typeof operand, 'object', 'Operand must be an object');

        super(null, null);
        this._operand = operand;
    }

    evaluate(input) {
        return this._operand.get(input);
    }

    serialize() {
        return { eq: [this._operand.serialize()] };
    }

    static deserialize(nodes, operandFactory) {
        assert(nodes.length === 1, 'EqualOperator requires 1 node.');
        return new EqualOperator(ExpressionTree.deserialize(nodes[0], operandFactory));
    }
}
ExpressionTree.Deserializers.eq = EqualOperator.deserialize;


class NotEqualOperator extends Operator {
    constructor(operand) {
        assert.strictEqual(typeof operand, 'object', 'Operand must be an object');

        super(null, null);
        this._operand = operand;
    }

    evaluate(input) {
        return !this._operand.get(input);
    }

    serialize() {
        return { not: [this._operand.serialize()] };
    }

    static deserialize(nodes, operandFactory) {
        assert(nodes.length === 1, 'NotEqualOperator requires 1 node.');
        return new NotEqualOperator(ExpressionTree.deserialize(nodes[0], operandFactory));
    }
}
ExpressionTree.Deserializers.not = NotEqualOperator.deserialize;


class AndOperator extends Operator {
    evaluate(input) {
        return this._left.evaluate(input) && this._right.evaluate(input);
    }

    serialize() {
        return { and: [this._left.serialize(), this._right.serialize()] };
    }

    static deserialize(nodes, operandFactory) {
        assert(nodes.length === 2, 'AndOperator requires 2 nodes.');
        return new AndOperator(
            ExpressionTree.deserialize(nodes[0], operandFactory),
            ExpressionTree.deserialize(nodes[1], operandFactory)
        );
    }
}
ExpressionTree.Deserializers.and = AndOperator.deserialize;


class OrOperator extends Operator {
    evaluate(input) {
        return this._left.evaluate(input) || this._right.evaluate(input);
    }

    serialize() {
        return { or: [this._left.serialize(), this._right.serialize()] };
    }

    static deserialize(nodes, operandFactory) {
        assert(nodes.length === 2, 'OrOperator requires 2 nodes.');
        return new OrOperator(
            ExpressionTree.deserialize(nodes[0], operandFactory),
            ExpressionTree.deserialize(nodes[1], operandFactory)
        );
    }
}
ExpressionTree.Deserializers.or = OrOperator.deserialize;


module.exports = {
    Tree:     ExpressionTree,
    Operand:  Operand,
    Equal:    EqualOperator,
    NotEqual: NotEqualOperator,
    And:      AndOperator,
    Or:       OrOperator,
};
