const os = require('os');

module.export =
class NormalizedPath {

    constructor(root, path, name){
        this.root = root;
        this.path = path;
        this.name = name;
    }

    static fromNativePath(nativePath){
        // Normalize the host path first. This should be skipped if the path is
        // already normalized.
        nativePath = path.normalize(nativePath);
        let components = path.parse(nativePath);

        

    }

    get path(){
        return root + path + name;
    }

}

// Select illegal name and character bindings based on platform.
switch(os.platform()){
    case 'darwin':
    case 'linux':
        NormalizedPath.kIllegalChars = '<>:"\\|?*'
        NormalizedPath.kIllegalNames = [ 'CON', 'PRN', 'AUX', 'CLOCK$', 'NUL', 'COM[1-9]', 'LPT[1-9]' ];
    case 'win32':
    default:
        NormalizedPath.kIllegalChars = '';
        NormalizedPath.kIllegalNames = [];
}

// Path max is constrained to 255 characters maximum.
NormalizedPath.kMaxPathLength = 255;
