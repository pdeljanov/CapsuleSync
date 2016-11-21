'use strict';

const assert = require('assert');
const debug = require('debug')('capsule.core.capsule');

const EventEmitter = require('events')

module.exports =
class Capsule {

    constructor(){

    }

    get id();

    get name();
    set name(name);

    get sources();

    get filters();


}
