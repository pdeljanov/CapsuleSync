const electron = require('electron');
const app = electron.app || electron.remote.app;
const path = require('path');
const fs = require('fs');

class AppPaths {

    static _ensurePath(fullPath) {
        return new Promise((resolve, reject) => {
            fs.mkdir(fullPath, (err) => {
                if (!err || (err && err.code === 'EEXIST')) {
                    resolve();
                }
                else {
                    reject(err);
                }
            });
        });
    }

    static ensurePaths() {
        return AppPaths._ensurePath(AppPaths.configRoot())
            .then(() => AppPaths._ensurePath(AppPaths.capsuleRoot()))
            .then(() => AppPaths._ensurePath(AppPaths.transcodedRoot()));
    }

    static configRoot() {
        if (!AppPaths._configurationRoot) {
            AppPaths._configurationRoot = path.join(app.getPath('userData'), 'Capsule Sync');
        }
        return AppPaths._configurationRoot;
    }

    static capsuleRoot() {
        if (!AppPaths._capsuleRoot) {
            AppPaths._capsuleRoot = path.join(AppPaths.configRoot(), 'capsules');
        }
        return AppPaths._capsuleRoot;
    }

    static transcodedRoot() {
        if (!AppPaths._transcodedRoot) {
            AppPaths._transcodedRoot = path.join(AppPaths.configRoot(), 'transcoded');
        }
        return AppPaths._transcodedRoot;
    }

    static getPathAtLocation(location, fileName) {
        let root = '';

        switch (location) {
        case AppPaths.Locations.CONFIG_ROOT:
            root = AppPaths.configRoot();
            break;
        case AppPaths.Locations.CAPSULE_ROOT:
            root = AppPaths.capsuleRoot();
            break;
        case AppPaths.Locations.TRANSCODED_ROOT:
            root = AppPaths.transcodedRoot();
            break;
        default:
            return fileName;
        }

        return path.join(root, fileName);
    }

}

AppPaths.Locations = {
    CONFIG_ROOT:     0,
    CAPSULE_ROOT:    1,
    TRANSCODED_ROOT: 2,
};

module.exports = AppPaths;
