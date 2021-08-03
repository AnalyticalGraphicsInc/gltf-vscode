#!/usr/bin/env node
/*eslint-env node*/
'use strict';
var fs = require('fs');
var path = require('path');

const fileNames = [
    'examples/jsm/loaders/GLTFLoader.js',
    'examples/jsm/loaders/RGBELoader.js',
    'examples/jsm/loaders/KTX2Loader.js',
    'examples/jsm/loaders/BasisTextureLoader.js',
    'examples/jsm/loaders/DRACOLoader.js',
    'examples/jsm/controls/OrbitControls.js'
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
            contents = contents.replace(
                '} from \'three\';',
                '} from \'../../../build/three.module.js\';');
            fs.writeFileSync(fileName, contents);
        });
    }
}

main();
