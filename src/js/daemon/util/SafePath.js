const os = require('os');

class SafePath {

    static isSafe() {
        return false;
    }

}

// Select illegal name and character bindings based on platform.
switch (os.platform()) {
case 'darwin':
case 'linux':
    SafePath.ILLEGAL_CHARS = '<>:"\\|?*';
    SafePath.ILLEGAL_NAMES = ['CON', 'PRN', 'AUX', 'CLOCK$', 'NUL', 'COM[1-9]', 'LPT[1-9]'];
    break;
case 'win32':
default:
    SafePath.ILLEGAL_CHARS = '';
    SafePath.ILLEGAL_NAMES = [];
}

// Path max is constrained to 260 characters maximum.
SafePath.MAX_LENGTH = 260;

module.exports = SafePath;
