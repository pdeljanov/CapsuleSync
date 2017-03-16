const debug = require('debug')('Daemon');

const AppPaths = require('./util/AppPaths.js');
const Config = require('./Config.js');
const User = require('./User.js');
const Device = require('./Device.js');
const Capsule = require('./capsule/Capsule.js');
const Protocol = require('./proto/Protocol1.js');
const CapsuleAdapter = require('./proto/adapters/CapsuleAdapter.js');
const HttpServer = require('./net/http/HttpServer.js');
const MDNSBroadcaster = require('./net/broadcast/MDNSBroadcaster.js');

const CONFIG_FILE = 'App.Settings';
const VERSION = '17.02.26.0';
const HTTPS_PORT = 53035;

// Daemon Service startup order.
//
// 0.  AppPaths
// 1.      Config
// 2.          UserService // DeviceService
// 3.              IpcService // CapsuleService    [Ipc/1, Protocol/1]
// 4.                  MDNSBroadcastService // GlobalDiscoveryService
// 5.                      RESTService // WebRTCService

class Daemon {

    constructor() {
        this.config = null;
        this.user = null;
        this.devices = null;
        this.capsules = [];
        this.mdns = null;
        this.http = null;
        this.remoteBroadcast = null;
    }

    _loadConfig() {
        this.config = new Config(CONFIG_FILE);
        this.config.defaults({
            user:     User.new().serialize(),
            capsules: {},
            devices:  [],
            setupRun: false,
        });
        return this.config.get('setupRun');
    }

    _loadUser() {
        this.config.get('user').then((user) => {
            this.user = User.deserialize(user);
        });
    }

    _runSetup(isSetup) {
        // If setup has not been run before, run it now.
        if (!isSetup) {
            debug('Running first time setup.');
            return Device.makeNew()
                .then(device => this.config.set('devices', [device.serialize()]))
                .then(() => this.config.set('setupRun', true));
        }
        return Promise.resolve();
    }

    _loadDevices() {
        return this.config.get('devices').then((devices) => {
            this.devices = devices.map(device => Device.makeFromSerialized(device));
        });
    }

    // TODO: IPC service.

    _loadCapsule(id) {
        const capsule = new Capsule(id);
        const createInfo = {
            capsuleName: `${this.user.name}'s Capsule'`,
            userName:    this.user.name,
            userId:      this.user.id,
        };
        return capsule.open(createInfo, this.devices[0])
            .then(() => Promise.resolve(capsule));
    }

    _loadCapsules() {
        // this.config.get('capsules').then((capsuleIds) => {
        return this._loadCapsule('test').then((capsule) => {
            this.capsules.push(capsule);
        });
        // });
    }

    _createProtocol() {
        const proto = new Protocol();
        proto.install(new CapsuleAdapter(this.capsules[0]));
        return Promise.resolve(proto);
    }

    _loadRESTService(protocol) {
        const server = new HttpServer(protocol);
        this.http = server;
        return server.start(HTTPS_PORT);
    }

    _loadMDNSBroadcastService() {
        const broadcast = new MDNSBroadcaster(HTTPS_PORT, this.user.id, `${this.devices[0].name}'s Capsules`);
        this.mdns = broadcast;
        return broadcast.start();
    }

    run() {
        const startedAt = performance.now();

        debug('Welcome to Capsule Sync!');
        debug(`Version ${VERSION}`);
        debug(`Started at ${Date()}`);

        AppPaths.ensurePaths()
            .then(() => this._loadConfig())
            .then(isSetup => this._runSetup(isSetup))
            .then(() => this._loadUser())
            .then(() => this._loadDevices())
            .then(() => this._loadCapsules())
            .then(() => this._createProtocol())
            .then(protocol => this._loadRESTService(protocol))
            .then(() => this._loadMDNSBroadcastService())
            .then(() => {
                const startupTime = Math.floor(performance.now() - startedAt);
                debug(`Capsule Sync loaded (${startupTime}ms).`);
            });
    }

}

module.exports = Daemon;
