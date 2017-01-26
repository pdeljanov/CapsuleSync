const debug = require('debug')('Device');
const OpenSSL = require('./crypto/openssl/OpenSSL.js');

class Device {
    constructor() {
        this.id = '';
        this.fingerprint = '';
        this.certificate = '';
        this.signingRequest = '';
        this.privateKey = '';
        this.name = '';
        this.description = '';
        this.icon = '';
    }

    static makeNew(options) {
        debug('Creating new Device.');
        return new Promise((resolve, reject) => {
            var device = new Device();

            device.name = (options && options.name) || Device.DEFAULT_DEVICE_NAME;
            device.description = (options && options.description) || Device.DEFAULT_DEVICE_DESCRIPTION;

            // Create private key.
            OpenSSL.createPrivateKey(Device.PRIVATE_KEY_SIZE)
                .then((data) => {
                    debug('Created private key');
                    // Create a certificate.
                    return OpenSSL.createCertificate({
                        clientKey:  data.key,
                        selfSigned: true,
                        hash:       'sha256',
                        commonName: 'CapsuleSync',
                        days:       Device.CERTIFICATE_LIFE,
                    });
                })
                // Get the certificate fingerprint.
                .then((data) => {
                    debug('Created certificate with private key.');
                    device.certificate = data.certificate;
                    // device.signingRequest = data.csr;
                    device.privateKey = data.clientKey;
                    return OpenSSL.getFingerprint(data.certificate, 'sha256');
                })
                // Assign the fingerprint as the device ID.
                .then((data) => {
                    debug(`Device created with certificate fingerprint ${data.fingerprint}`);
                    device.fingerprint = data.fingerprint;
                    device.id = data.fingerprint.replace(/:/g, '');
                    resolve(device);
                })
                // Error!
                .catch((err) => {
                    debug(`Failed to generate device certificate with error: ${err}`);
                    reject(Device.Errors.GENERATION_ERROR);
                });
        });
    }

    serialize() {
        return {
            id:          this.id,
            cert:        this.certificate,
            // csr:         this.signingRequest,
            privateKey:  this.privateKey,
            fingerprint: this.fingerprint,
            name:        this.name,
            description: this.description,
            icon:        this.icon,
        };
    }

    static makeFromSerialized(serialized) {
        const device = new Device();
        device.id = serialized.id;
        device.fingerprint = serialized.fingerprint;
        device.certificate = serialized.cert;
        // device.signingRequest = serialized.csr;
        device.privateKey = serialized.privateKey;
        device.name = serialized.name;
        device.description = serialized.description;
        device.icon = serialized.icon;
        return device;
    }

}

Device.PRIVATE_KEY_SIZE = 2048;
Device.CERTIFICATE_LIFE = 365 * 15;
Device.DEFAULT_DEVICE_NAME = 'Kawaii Device';
Device.DEFAULT_DEVICE_DESCRIPTION = 'Senpai, notice me~';

Device.Errors = {
    GENERATION_ERROR: 'GenerationError',
};

module.exports = Device;
