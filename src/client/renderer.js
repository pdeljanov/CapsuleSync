const debug = require('debug')('Main');

const AppPaths = require('./js/daemon/util/AppPaths.js');
const Config = require('./js/daemon/Config.js');
const Device = require('./js/daemon/Device.js');
const Capsule = require('./js/daemon/capsule/Capsule.js');
const IdGenerator = require('./js/daemon/util/IdGenerator.js');

const VERSION = '17.01.25.0';
const USER_ID_LENGTH = 64;

function setup() {
    const config = new Config('App.Settings');

    const deviceName = 'Shingeki-No-Desktop PC';
    const userId = IdGenerator(USER_ID_LENGTH);
    const userName = 'Test User';

    config.defaults({
        user:     { id: userId, name: userName },
        capsules: { },
        devices:  [],
        setupRun: false,
    });

    debug('Welcome to Capsule Sync!');
    debug(`Version ${VERSION}`);
    debug(`Started at ${Date()}`);

    AppPaths.ensurePaths()
        .then(() => config.get('setupRun'))
        .then((setupRun) => {
            if (!setupRun) {
                debug('Running first time setup.');
                return Device.makeNew()
                    .then(device => config.set('devices', [device.serialize()]))
                    .then(() => config.set('setupRun', true))
                    .then(() => config.get('devices'));
            }
            return config.get('devices');
        })
        .then((devices) => {
            const capsule = new Capsule('test');
            const createInfo = {
                capsuleName: deviceName,
                userName:    userName,
                userId:      userId,
            };
            return capsule.open(createInfo, Device.makeFromSerialized(devices[0]))
                .then(() => Promise.resolve(capsule));
        })
        .then((capsule) => {
            window.capsule = {};
            window.capsule.config = config;
            window.capsule.test = capsule;
        });
}

setup();
