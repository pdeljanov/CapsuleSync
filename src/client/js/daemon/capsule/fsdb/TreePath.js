'use strict';

const assert = require('assert');

function getParentPath(path){
    const offset = (path[path.length - 1] === '/') ? 1 : 0;
    return path.substr(0, path.lastIndexOf('/', path.length - offset - 1)) + '/';
}

function normalizePath(path){
    assert.strictEqual(typeof path, 'string', 'Path must be a string.');
    assert((path === '' || path[0] === '/'), 'Path must start with a "/".');

    // If there are no '/./' or '/../' path strings in the path, it can' be simplified.
    if(path.indexOf('/./') === -1 && path.indexOf('/../') === -1){
        return path;
    }
    // Otherwise, simplify it.
    else {
        let originalComponents = path.split('/');
        let simplifiedComponents = [];

        // Loop through each of the original path components.
        for(let i = 0; i < originalComponents.length; ++i){
            const component = originalComponents[i];

            // Pop off a path component if a '..' is present.
            if(component === '..'){
                // Maintain the first simplified component which is empty to maintain the
                // leading slash when the simplified components are joined at the end.
                if(simplifiedComponents.length > 1){
                    simplifiedComponents.pop();
                }
            }
            // Add a path component so long as it's now a '.'.
            else if (component !== '.'){
                simplifiedComponents.push(component);
            }
        }

        // Join the simplified path components with forward slashes to get the final path string.
        return simplifiedComponents.join('/');
    }
}

function normalizeAsNode(path){
    path = normalizePath(path) + '/';
    if(path[path.length - 1] !== '/'){
        return path + '/';
    }
}

function normalizeAsLeaf(path){
    return normalizePath(path);
}

module.exports = {
    getParentPath: getParentPath,
    normalizePath: normalizePath,
    normalizeAsNode: normalizeAsNode,
    normalizeAsLeaf: normalizeAsLeaf
};
