#!/usr/bin/env node
/*eslint-env node*/
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
            },
            'extensions': {
                alias: 'e',
                describe: 'Look for glTF extensions',
                type: 'boolean'
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
        outputPath: outputPath,
        shouldAddExtensions: argv.e
    };
}

function transformAnyOf(data, parentDescription) {
    if (!parentDescription) {
        console.warn('**** WARNING: anyOf without description.');
    } else {
        var numBlocks = data.length;
        for (var i = 0; i < numBlocks; ++i) {
            var block = data[i];
            if (block.hasOwnProperty('enum')) {
                if (block.hasOwnProperty('description')) {
                    block.description += ' - ' + parentDescription;
                }
            }
        }
    }
}

function transformEnums(data) {
    for (var key in data) {
        if (data.hasOwnProperty(key)) {
            var val = data[key];
            if (key === 'anyOf') {
                transformAnyOf(val, data.description);
            } else if (typeof(val) === 'object' && key !== 'not') {
                transformEnums(val);
            }
        }
    }

    // This transforms a "gltf_enumNames" array into a oneOf array, which allows vscode's jsonValidation
    // to provide hover tooltips and auto-complete descriptions for individual enum values.
    var hasEnum = data.hasOwnProperty('enum');
    var hasGltfEnum = data.hasOwnProperty('gltf_enumNames');
    if (hasEnum && hasGltfEnum) {
        var oneOf = [];
        var numEnums = data.enum.length;
        var numGltfEnums = data.gltf_enumNames.length;
        if ((numEnums === numGltfEnums) && (numEnums > 0)) {
            var description = '';
            if (data.hasOwnProperty('description') && data.description) {
                description = ' - ' + data.description;
            }
            for (var i = 0; i < numEnums; ++i) {
                oneOf.push({ 'enum': [data.enum[i]], 'description': data.gltf_enumNames[i] + description });
            }
            data.oneOf = oneOf;
            delete data.enum;
            delete data.gltf_enumNames;
            delete data.type;
        } else if (numEnums > 0) {
            console.warn('**** WARNING: enum count differs from gltf_enumNames count.');
        } else {
            console.warn('**** WARNING: enum count is zero.');
        }
    } else if (hasEnum) {
        console.log('NOTE: enum present without gltf_enumNames: ' + JSON.stringify(data.enum));
    } else if (hasGltfEnum) {
        console.warn('**** WARNING: gltf_enumNames present without enum.');
    }
}

function upgradeDescriptions(data) {
    for (var key in data) {
        if (data.hasOwnProperty(key)) {
            var val = data[key];
            if (typeof(val) === 'object') {
                upgradeDescriptions(val);
            }
        }
    }

    if (data.title && data.title === 'Texture Info' && data.description) {
        // textureInfo.schema.json has a vague description "Reference to a texture"
        // that overwrites more specific descriptions from the referring parents.
        // So, we remove that here, and VSCode picks up better descriptions.
        delete data.description;
    } else if (data.hasOwnProperty('gltf_detailedDescription')) {
        // Swap out 'description' for 'gltf_detailedDescription' as the latter
        // typically has more detailed information.
        if (data.hasOwnProperty('description')) {
            data.short_description = data.description;
        }
        data.description = data.gltf_detailedDescription;
        delete data.gltf_detailedDescription;
    }
}

function addExtensions(schema, file, options) {
    var extensionFile =  'extensions/' + file.replace('.schema.json', '.extensions.schema.json');

    if (fs.existsSync(path.join(options.outputPath, extensionFile))) {
        console.log('Adding extensions from: ' + extensionFile);
        if (!(schema.properties && schema.properties.extensions)) {
            console.log('ERROR: Can\'t find extensions property!');
        } else {
            schema.properties.extensions = {
                'allOf': [
                    {
                        '$ref': extensionFile
                    }
                ]
            };
        }
    }
}

function transformFile(file, options) {
    var inputFile = path.join(options.schemaPath, file);
    var outputFile = path.join(options.outputPath, file);
    var schema = JSON.parse(fs.readFileSync(inputFile));

    transformEnums(schema);
    upgradeDescriptions(schema);

    if (options.shouldAddExtensions) {
        addExtensions(schema, file, options);
    }

    fs.writeFileSync(outputFile, JSON.stringify(schema, null, '    ').replace(/\"\:/g, '" :') + '\n');
}

function main() {
    var args = process.argv;
    args = args.slice(2, args.length);
    var options = parseArguments(args);

    if (!options) {
        return;
    }

    var files = fs.readdirSync(options.schemaPath);
    files.forEach(function(file) {
        if (file.endsWith('.schema.json')) {
            console.log(file);
            transformFile(file, options);
        }
    });

    console.log('Done!');
}

main();
