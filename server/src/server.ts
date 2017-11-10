'use strict';

import {
    IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments, TextDocument,
    Diagnostic, DiagnosticSeverity, InitializeResult, Range
} from 'vscode-languageserver';
import Uri from 'vscode-uri';
import * as path from 'path';
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

/**
 * Attempt to parse a JSON document into a map of JSON pointers.
 * Catch and report any parsing errors encountered.
 *
 * @param textDocument The document to parse
 * @return A map of JSON pointers to document text locations, or `undefined`
 */
function tryGetJsonMap(textDocument: TextDocument) {
    try {
        return jsonMap.parse(textDocument.getText());
    } catch (ex) {
        console.warn('Error parsing glTF JSON document: ' + textDocument.uri);
    }
    return undefined;
}

/**
 * Evaluate whether a given document URI should be passed to the glTF Validator
 * for further processing.
 *
 * @param textDocument The document to evaluate
 * @return True if the URI appears to be a local `.gltf` file.
 */
function isLocalGltf(textDocument: TextDocument): boolean {
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
        // Schedule revalidation of all open text documents using the new settings.
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
 *
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

/**
 * Remove a glTF document from scheduled validation, possibly because
 * the document has closed or is no longer available to validate.
 *
 * @param textDocument The document to un-schedule
 */
function unscheduleValidation(textDocument: TextDocument): void {
    var index = documentsToValidate.indexOf(textDocument);
    if (index >= 0) {
        console.log('un-schedule ' + textDocument.uri);
        documentsToValidate.splice(index, 1);
    }
}

/**
 * Clear any previous validation output messages from a particular document,
 * likely because glTF validation has been disabled.
 *
 * @param textDocument The document to clear
 */
function clearValidationTextDocument(textDocument: TextDocument): void {
    if (isLocalGltf(textDocument)) {
        console.log('disable validation ' + textDocument.uri);
        const diagnostics: Diagnostic[] = [];
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }
}

/**
 * Immediately launch the glTF Validator on a .gltf JSON document.
 *
 * @param textDocument The document to validate
 */
function validateTextDocument(textDocument: TextDocument): void {
    console.log('validate ' + textDocument.uri);

    const fileName = Uri.parse(textDocument.uri).fsPath;
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
        if (diagnostics.length === 0) {
            console.log('Validation passed: ' + fileName);
        } else {
            console.log(diagnostics.length.toFixed() + ' validation messages for ' + fileName);
        }
    }, (result) => {
        // Validator's error
        console.warn('glTF Validator failed on: ' + fileName);
        console.warn(result);
        let diagnostics: Diagnostic[] = [getDiagnostic({ message: 'glTF Validator error: ' + result }, {})];
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}

/**
 * Convert an individual glTF Validator messgae to a Language Server Diagnostic.
 *
 * @param info An object containing a message from the glTF Validator's output messages
 * @param map A map of JSON pointers to document text locations
 * @return A `Diagnostic` to send back to the client
 */
function getDiagnostic(info: any, map: any): Diagnostic {
    let range: Range = {
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
