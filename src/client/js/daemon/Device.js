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

    static makeNew() {
        return new Promise((resolve, reject) => {
            var device = new Device();

            // Create private key.
            OpenSSL.createPrivateKey(Device.PRIVATE_KEY_SIZE)
                .then((data) => {
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
                    device.certificate = data.certificate;
                    device.signingRequest = data.csr;
                    device.privateKey = data.clientKey;
                    return OpenSSL.getFingerprint(data.certificate, 'sha256');
                })
                // Assign the fingerprint as the device ID.
                .then((data) => {
                    device.fingerprint = data.fingerprint;
                    device.id = data.fingerprint.replace(/:/g, '');
                    resolve(device);
                })
                // Error!
                .catch((err) => {
                    reject(Device.Errors.GENERATION_ERROR);
                });
        });
    }

    serialize() {
        return {
            id:          this.id,
            cert:        this.certificate,
            csr:         this.csr,
            privateKey:  this.privateKey,
            fingerprint: this.fingerprint,
        };
    }

    static makeFromSerialized(serialized) {
        const device = new Device();
        device.id = serialized.id;
        device.fingerprint = serialized.fingerprint;
        device.certificate = serialized.cert;
        device.signingRequest = serialized.csr;
        device.privateKey = serialized.privateKey;
        return device;
    }

}

Device.PRIVATE_KEY_SIZE = 2048;
Device.CERTIFICATE_LIFE = 365 * 15;

Device.Errors = {
    GENERATION_ERROR: 'GenerationError',
};

module.exports = Device;
