const debug = require('debug')('Protocol.Protocol1');

const Errors = require('../Errors.js');

/* eslint class-methods-use-this: "off" */

class CapsuleProtocol {
    type() {
        return 'capsule';
    }

    get() {
        return Promise.reject(Errors.NOT_SUPPORTED);
    }

    list() {
        return Promise.reject(Errors.NOT_SUPPORTED);
    }
}

class UserProtocol {
    type() {
        return 'user';
    }

    userInfo() {
        return Promise.reject(Errors.NOT_SUPPORTED);
    }
}

class DeviceProtocol {
    type() {
        return 'device';
    }

    deviceInfo() {
        return Promise.reject(Errors.NOT_SUPPORTED);
    }
}

class NetworkProtocol {
    type() {
        return 'network';
    }

    announce() {
        return Promise.reject(Errors.NOT_SUPPORTED);
    }
}

class Protocol {

    constructor() {
        this._capsule = new Protocol.Capsule();
        this._user = new Protocol.User();
        this._device = new Protocol.Device();
        this._network = new Protocol.Network();
    }

    install(handler) {
        switch (handler.type()) {
        case 'capsule':
            this._capsule = handler;
            break;
        case 'user':
            this._user = handler;
            break;
        case 'device':
            this._device = handler;
            break;
        case 'network':
            this._network = handler;
            break;
        default:
            debug(`Invalid protocol handler type '${handler.type()}'.`);
        }
    }

    get capsules() {
        return this._capsule;
    }

    get user() {
        return this._user;
    }

    get device() {
        return this._device;
    }

    get network() {
        return this._network;
    }

    status() {
        return Promise.resolve({
            status: 'OK',
        });
    }

}

Protocol.Capsule = CapsuleProtocol;
Protocol.User = UserProtocol;
Protocol.Device = DeviceProtocol;
Protocol.Network = NetworkProtocol;

module.exports = Protocol;
