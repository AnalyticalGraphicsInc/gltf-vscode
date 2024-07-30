#!/usr/bin/env node
/*eslint-env node*/
'use strict';
let fs = require('fs');
let path = require('path');
let yargs = require('yargs');

// This NodeJS script checks all references to external schema files.

let checkedFiles = [];

function parseArguments(args) {
    let argv = yargs
        .usage('Usage: node $0 -p path')
        .example('node $0 -p ../schemas/gltf-2.0')
        .help('h')
        .alias('h', 'help')
        .options({
            'schema': {
                alias: 's',
                describe: 'schema=PATH, The root file of the schema to validate.',
                normalize: true,
                type: 'string'
            }
        }).parse(args);

    let schemaPath = argv.s;

    if (!schemaPath) {
        yargs.showHelp();
        return;
    }

    return {
        schemaPath: schemaPath
    };
}

function ensureFileExists(parentFile, folder, name, options) {
    let fullPath = path.normalize(path.join(folder, name));
    if (!fs.existsSync(fullPath)) {
        console.error('*** Broken file reference in: ' + parentFile);
        console.error('****** File not found: ' + name);

        // Set the NodeJS process exit code, to tell the outer shell script we failed.
        process.exitCode = 1;
    } else if (!checkedFiles.includes(fullPath)) {
        validateFile(fullPath, options);
    }
}

function validateArray(parentFile, folder, arr, options) {
    let len = arr.length;
    for (let i = 0; i < len && !process.exitCode; ++i) {
        let val = arr[i];
        if (typeof (val) === 'object') {
            validateObject(parentFile, folder, val, options);
        }
    }
}

function validateObject(parentFile, folder, data, options) {
    for (let key in data) {
        if (data.hasOwnProperty(key)) {
            let val = data[key];
            if (key === '$ref') {
                if (val && val[0] !== '#') {
                    ensureFileExists(parentFile, folder, val, options);
                }
            } else if (Array.isArray(val)) {
                validateArray(parentFile, folder, val, options);
            } else if (typeof (val) === 'object') {
                validateObject(parentFile, folder, val, options);
            }
        }
        if (process.exitCode) {
            break;
        }
    }
}

function validateFile(fullPath, options) {
    checkedFiles.push(fullPath);
    let file = path.basename(fullPath);
    let folder = path.dirname(fullPath);

    console.log(fullPath);
    let schema = JSON.parse(fs.readFileSync(fullPath));

    validateObject(file, folder, schema, options);
}

function main() {
    let args = process.argv;
    args = args.slice(2, args.length);
    let options = parseArguments(args);

    if (!options) {
        return;
    }

    validateFile(options.schemaPath, options);

    if (!process.exitCode) {
        console.log('Done!');
    }
}

main();
