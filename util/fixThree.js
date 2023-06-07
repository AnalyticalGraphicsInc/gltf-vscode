#!/usr/bin/env node
/*eslint-env node*/
'use strict';
var fs = require('fs');
var path = require('path');

const fileNames = [
    'examples/jsm/loaders/GLTFLoader.js',
    'examples/jsm/loaders/RGBELoader.js',
    'examples/jsm/loaders/KTX2Loader.js',
    'examples/jsm/loaders/DRACOLoader.js',
    'examples/jsm/controls/OrbitControls.js',
    'examples/jsm/utils/BufferGeometryUtils.js'
];

function main() {
    var args = process.argv;
    if (args.length !== 3) {
        console.log('Please enter the path as the only argument.');
    } else {
        var basePath = args[2];
        fileNames.forEach(name => {
            var fileName = path.join(basePath, name);
            var contents = fs.readFileSync(fileName).toString();
            var updated = contents.replace(
                '} from \'three\';',
                '} from \'../../../build/three.module.js\';');
            if (updated !== contents) {
                fs.writeFileSync(fileName, updated);
                console.log('Patched ' + fileName);
            }
        });
    }
}

main();
