#!/usr/bin/env node
/*eslint-env node*/
'use strict';
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

const messageSummary = {};

function parseArguments(args) {
    var argv = yargs
        .usage('Usage: node $0 -i inputPath -o outputFile.csv')
        .help('h')
        .alias('h', 'help')
        .options({
            'input': {
                alias: 'i',
                describe: 'input=PATH, Read *.report.json validation files from here.',
                normalize: true,
                type: 'string'
            },
            'output': {
                alias: 'o',
                describe: 'output=FILE, Write summary here as *.csv.',
                normalize: true,
                type: 'string'
            }
        }).parse(args);

    var inputPath = argv.i;
    var outputFile = argv.o;

    if ((!inputPath) || (!outputFile)) {
        yargs.showHelp();
        return;
    }

    return {
        inputPath,
        outputFile
    };
}

function processFile(inputFile, options) {
    const report = JSON.parse(fs.readFileSync(inputFile));
    const messages = report.issues?.messages;
    let fileUri = report.uri;
    const lastSlash = fileUri.lastIndexOf('/');
    if (lastSlash >= 0) {
        fileUri = fileUri.substring(lastSlash + 1);
    }

    if (messages !== undefined && options !== undefined) {
        const numMsgs = messages.length;
        for (let i = 0; i < numMsgs; ++i) {
            const message = messages[i];
            const code = message.code;
            if (!Object.hasOwn(messageSummary, code))
            {
                messageSummary[code] = {
                    count: 0,
                    severity: message.severity,
                    files: []
                };
            }
            messageSummary[code].count++;
            if (messageSummary[code].files.indexOf(fileUri) < 0) {
                messageSummary[code].files.push(fileUri);
            }
        }
    }
}

function processFolder(inputPath, options) {
    var files = fs.readdirSync(inputPath);
    files.forEach(function(file) {
        var inputFile = path.join(inputPath, file);
        var st = fs.statSync(inputFile);
        if (st.isDirectory()) {
            processFolder(inputFile, options);
        } else if (st.isFile() && file.endsWith('.report.json')) {
            console.log(file);
            processFile(inputFile, options);
        }
    });
}

function main() {
    let args = process.argv;
    args = args.slice(2, args.length);
    const options = parseArguments(args);

    if (!options) {
        return;
    }

    processFolder(options.inputPath, options);

    console.log('Generating summary...');
    const codes = Object.keys(messageSummary).sort((a, b) =>
        messageSummary[a].severity - messageSummary[b].severity ||
        messageSummary[b].count - messageSummary[a].count);
    const legend = "Code,Severity,Count,FileCount,Files";
    const output = codes.map(code =>
        code + "," +
        messageSummary[code].severity + "," +
        messageSummary[code].count + "," +
        messageSummary[code].files.length + "," +
        messageSummary[code].files.sort().join(" ")
    );
    output.unshift(legend);

    fs.writeFileSync(options.outputFile, output.join("\n"));

    console.log('Done!');
}

main();
