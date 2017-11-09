/* --------------------------------------------------------------------------------------------
 * Some portions copied from lsp-sample:
 * https://github.com/Microsoft/vscode-extension-samples/tree/master/lsp-sample
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments, TextDocument,
    Diagnostic, DiagnosticSeverity, InitializeResult, CompletionItem
    //TextDocumentPositionParams, CompletionItemKind
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

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
connection.onInitialize((): InitializeResult => {
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind
            // Tell the client that the server support code complete
            //completionProvider: {
            //    resolveProvider: true
            //}
        }
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    scheduleValidation(change.document);
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
    // Schedule revalidation any open text documents
    documents.all().forEach(scheduleValidation);
});

/**
 * Schedule a document for glTF validation after the debounce timeout.
 * @param textDocument The document to schedule validator for.
 */
function scheduleValidation(textDocument: TextDocument): void {
    const lowerUri = textDocument.uri.toLowerCase();
    if (lowerUri.startsWith('file:///') && lowerUri.endsWith('.gltf')) {
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

    const gltfData = Buffer.from(textDocument.getText());
    const folderName = path.resolve(fileName, '..');

    gltfValidator.validateBytes(baseName, new Uint8Array(gltfData), (uri) =>
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
        // TODO: Parse this before calling validator
        const map = tryGetJsonMap(textDocument);
        if (!map) {
            diagnostics.push(getDiagnostic({ message: 'Error parsing JSON document.' }, {}));
        } else if (result.issues && result.issues.messages) {
            const messages = result.issues.messages;
            convertErrorsToDiagnostics(diagnostics, map, messages);

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
    });
}

connection.onDidChangeWatchedFiles((_change) => {
    // Monitored files have change in VSCode
    connection.console.log('We recevied an file change event');
});


function convertErrorsToDiagnostics(diagnostics: Diagnostic[], map: any, messages: any) {
    let len = messages.length;
    for (let i = 0; i < len; ++i) {
        let info = messages[i];
        if (info.message) {
            diagnostics.push(getDiagnostic(info, map));
        }
    }
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

/*
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: 'TypeScript',
            kind: CompletionItemKind.Text,
            data: 1
        },
        {
            label: 'JavaScript',
            kind: CompletionItemKind.Text,
            data: 2
        }
    ]
});
*/

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
        item.detail = 'TypeScript details',
            item.documentation = 'TypeScript documentation'
    } else if (item.data === 2) {
        item.detail = 'JavaScript details',
            item.documentation = 'JavaScript documentation'
    }
    return item;
});

/*
connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VSCode.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.
    connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VSCode.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VSCode.
    // params.uri uniquely identifies the document.
    connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();
