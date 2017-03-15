#!/usr/bin/env node
'use strict';
var fs = require('fs');
var path = require('path');
var yargs = require('yargs');

// This NodeJS script imports the official glTF schema files from a
// folder, and transforms them to make them more functional with vscode's
// own JsonValidation.  For example, glTF enums are converted to "oneOf" arrays,
// such that tooltips and auto-complete suggestions are shown for each enum value.

function parseArguments(args) {
    var argv = yargs
        .usage('Usage: node $0 -i inputPath -o outputPath')
        .example('node $0 -i ../../gltf/specification/1.0/schema -o ../schemas/gltf-1.0')
        .help('h')
        .alias('h', 'help')
        .options({
            'input': {
                alias: 'i',
                describe: 'input=PATH, Read original glTF schema from this folder.',
                normalize: true,
                type: 'string'
            },
            'output': {
                alias: 'o',
                describe: 'output=PATH, Write transformed schema to this folder.',
                normalize: true,
                type: 'string'
            }
        }).parse(args);

    var schemaPath = argv.i;
    var outputPath = argv.o;

    if ((!schemaPath) || (!outputPath)) {
        yargs.showHelp();
        return;
    }

    return {
        schemaPath: schemaPath,
        outputPath: outputPath
    };
}

function transformFile(inputFile, outputFile) {
    var schema = JSON.parse(fs.readFileSync(inputFile));

    // TODO: Actually transform something!

    fs.writeFileSync(outputFile, JSON.stringify(schema, null, '    ').replace(/\"\:/g, '" :') + '\n');
}

function main() {
    var args = process.argv;
    args = args.slice(2, args.length);
    var options = parseArguments(args);

    if (!options) {
        return;
    }

    var schemaPath = options.schemaPath;
    var outputPath = options.outputPath;

    var files = fs.readdirSync(schemaPath);
    files.forEach(function(file) {
        if (file.endsWith('.schema.json')) {
            console.log(file);
            transformFile(path.join(schemaPath, file), path.join(outputPath, file));
        }
    });

    console.log('Done!');
}

main();
