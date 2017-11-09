'use strict';

import {
    IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments, TextDocument,
    Diagnostic, DiagnosticSeverity, InitializeResult
} from 'vscode-languageserver';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import * as jsonMap from 'json-source-map';
import * as gltfValidator from 'gltf-validator';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let documentsToValidate: TextDocument[] = [];
let debounceValidateTimer: NodeJS.Timer;

function tryGetJsonMap(textDocument: TextDocument) {
    try {
        return jsonMap.parse(textDocument.getText());
    } catch (ex) {
        console.warn('Error parsing glTF document.  Please make sure it is valid JSON.');
    }
    return undefined;
}

function isLocalGltf(textDocument: TextDocument) {
    const lowerUri = textDocument.uri.toLowerCase();
    return (lowerUri.startsWith('file:///') && lowerUri.endsWith('.gltf'));
}

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
connection.onInitialize((): InitializeResult => {
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind
        }
    }
});

// The settings interface describe the server relevant settings part
interface GltfSettings {
    Validation: ValidatorSettings;
}

interface ValidatorSettings {
    enable: boolean;
    debounce: number;
    maxIssues: number;
    ignoredIssues: Array<string>;
    severityOverrides: object;
}

let currentSettings: GltfSettings;

//
// This is sent on server activation, and again for every configuration change.
//
connection.onDidChangeConfiguration((change) => {
    currentSettings = <GltfSettings>change.settings.glTF;
    if (currentSettings.Validation.enable) {
        // Schedule revalidation any open text documents
        documents.all().forEach(scheduleValidation);
    } else {
        if (debounceValidateTimer) {
            clearTimeout(debounceValidateTimer);
            debounceValidateTimer = undefined;
        }
        documents.all().forEach(clearValidationTextDocument);
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    if (currentSettings.Validation.enable) {
        scheduleValidation(change.document);
    }
});

// Turn off validation of closed documents.
documents.onDidClose(change => {
    if (currentSettings.Validation.enable) {
        unscheduleValidation(change.document);
    }
});

/**
 * Schedule a document for glTF validation after the debounce timeout.
 * @param textDocument The document to schedule validator for.
 */
function scheduleValidation(textDocument: TextDocument): void {
    if (isLocalGltf(textDocument)) {
        console.log('schedule ' + textDocument.uri);
        if (documentsToValidate.indexOf(textDocument) < 0) {
            documentsToValidate.push(textDocument);
        }
        if (debounceValidateTimer) {
            clearTimeout(debounceValidateTimer);
            debounceValidateTimer = undefined;
        }
        debounceValidateTimer = setTimeout(() => {
            documentsToValidate.forEach(validateTextDocument);
            documentsToValidate = [];
        }, currentSettings.Validation.debounce);
    }
}

function unscheduleValidation(textDocument: TextDocument): void {
    var index = documentsToValidate.indexOf(textDocument);
    if (index >= 0) {
        console.log('un-schedule ' + textDocument.uri);
        documentsToValidate.splice(index, 1);
    }
}

function clearValidationTextDocument(textDocument: TextDocument): void {
    if (isLocalGltf(textDocument)) {
        console.log('disable validation ' + textDocument.uri);
        const diagnostics: Diagnostic[] = [];
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }
}

const _driveLetterPath = /^\/[a-zA-Z]:/;

// From: https://github.com/Microsoft/vscode/blob/f2c2d9c65880e44b588a0e1916423b691fff01d3/src/vs/base/common/uri.ts#L357-L374
function getFsPath(uri) {
    const url = Url.parse(uri);
    const urlPath = decodeURIComponent(url.path);
    let value: string;
    if (url.auth && urlPath && url.protocol === 'file:') {
        // unc path: file://shares/c$/far/boo
        value = `//${url.auth}${urlPath}`;
    } else if (_driveLetterPath.test(urlPath)) {
        // windows drive letter: file:///c:/far/boo
        value = urlPath[1].toLowerCase() + urlPath.substr(2);
    } else {
        // other path
        value = urlPath;
    }
    return path.normalize(value);
}

function validateTextDocument(textDocument: TextDocument): void {
    console.log('validate ' + textDocument.uri);

    const fileName = getFsPath(textDocument.uri);
    const baseName = path.basename(fileName);

    const gltfText = textDocument.getText();
    const folderName = path.resolve(fileName, '..');

    const map = tryGetJsonMap(textDocument);
    if (!map) {
        let diagnostics: Diagnostic[] = [getDiagnostic({ message: 'Error parsing JSON document.' }, {})];
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        return;
    }

    gltfValidator.validateString(baseName, gltfText, (uri) =>
        new Promise((resolve, reject) => {
            uri = path.resolve(folderName, uri);
            fs.readFile(uri, (err, data) => {
                console.log("Loading external file: " + uri);
                if (err) {
                    console.warn("Error: " + err.toString());
                    reject(err.toString());
                    return;
                }
                resolve(data);
            });
        }),
        {
            maxIssues: currentSettings.Validation.maxIssues,
            ignoredIssues: currentSettings.Validation.ignoredIssues,
            severityOverrides: currentSettings.Validation.severityOverrides
        }
    ).then((result) => {
        let diagnostics: Diagnostic[] = [];
        if (result.issues && result.issues.messages) {
            const messages = result.issues.messages;
            const numMessages = messages.length;
            for (let i = 0; i < numMessages; ++i) {
                let info = messages[i];
                if (info.message) {
                    diagnostics.push(getDiagnostic(info, map));
                }
            }

            if (result.issues.truncated) {
                diagnostics.push(getDiagnostic({
                    message: 'VALIDATION ABORTED: Too many messages produced.'
                }, map));
            }
        }
        // Send the computed diagnostics to VSCode, clearing any old messages.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }, (result) => {
        // Validator's error
        console.warn('glTF Validator had problems.');
        console.warn(result);
        let diagnostics: Diagnostic[] = [getDiagnostic({ message: 'glTF Validator error: ' + result }, {})];
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}

function getDiagnostic(info: any, map: any) : Diagnostic {
    let range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: Number.MAX_VALUE }
    };

    let severity: DiagnosticSeverity = DiagnosticSeverity.Error;
    switch (info.severity) {
        case 1:
            severity = DiagnosticSeverity.Warning;
            break;
        case 2:
            severity = DiagnosticSeverity.Information;
            break;
        case 3:
            severity = DiagnosticSeverity.Hint;
            break;
        default:
            break;
    }

    if (info.pointer) {
        const pointerName = info.pointer;
        if (map.pointers.hasOwnProperty(pointerName)) {
            const pointer = map.pointers[pointerName];
            const start = pointer.key || pointer.value;
            range.start.line = start.line;
            range.start.character = start.column;

            const end = pointer.valueEnd;
            range.end.line = end.line;
            range.end.character = end.column;
        }
    }

    return {
        code: info.code,
        severity: severity,
        range,
        message: info.message,
        source: 'glTF Validator'
    };
}

// Listen on the connection
connection.listen();
