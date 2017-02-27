// For security, do not allow the OpenSSL temporary directory to be changed via environment
// variable.
if (process.env.PEMJS_TMPDIR) {
    delete process.env.PEMJS_TMPDIR;
}

// For security, do not allow the OpenSSL binary path to be changed via environment variable.
if (process.env.OPENSSL_BIN) {
    delete process.env.OPENSSL_BIN;
}

const pem = require('pem');

function wrap(func) {
    return function exec(...args) {
        return new Promise((resolve, reject) => {
            args.push((err, result) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            });
            func.apply(pem, args);
        });
    };
}

module.exports.createPrivateKey = wrap(pem.createPrivateKey);
module.exports.createDhparam = wrap(pem.createDhparam);
module.exports.createCSR = wrap(pem.createCSR);
module.exports.createCertificate = wrap(pem.createCertificate);
module.exports.readCertificateInfo = wrap(pem.readCertificateInfo);
module.exports.getPublicKey = wrap(pem.getPublicKey);
module.exports.getFingerprint = wrap(pem.getFingerprint);
module.exports.getModulus = wrap(pem.getModulus);
module.exports.getDhparamInfo = wrap(pem.getDhparamInfo);
module.exports.createPkcs12 = wrap(pem.createPkcs12);
module.exports.readPkcs12 = wrap(pem.readPkcs12);
module.exports.verifySigningChain = wrap(pem.verifySigningChain);
module.exports.config = pem.config;
