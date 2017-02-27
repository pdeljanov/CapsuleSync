const IdGenerator = require('./util/IdGenerator.js');

class User {

    constructor(id, name) {
        this._id = id;
        this._name = name;
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    serialize() {
        return { id: this._id, name: this._name };
    }

    static deserialize(serialized) {
        return new User(serialized.id, serialized.name);
    }

    static new() {
        return new User(IdGenerator(User.ID_LENGTH), User.DEFAULT_USER_NAME);
    }
}

User.ID_LENGTH = 64;
User.DEFAULT_USER_NAME = 'A Random User Appeared';

module.exports = User;
