'use strict';
import * as vscode from 'vscode';
import * as Url from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
let stringHash = require('string-hash');
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export function atob(str): string {
    return Buffer.from(str, 'base64').toString('binary');
}

export function btoa(str): string {
    return Buffer.from(str, 'binary').toString('base64');
}

export function getFromJsonPointer(glTF, jsonPointer : string) {
    const jsonPointerSplit = jsonPointer.split('/');
    const numPointerSegments = jsonPointerSplit.length;
    let result = glTF;
    const firstValidIndex = 1; // Because the path has a leading slash.
    for (let i = firstValidIndex; i < numPointerSegments; ++i) {
        result = result[jsonPointerSplit[i]];
    }
    return result;
}

const gltfMimeTypes = {
    'image/png' : ['png'],
    'image/jpeg' : ['jpg', 'jpeg'],
    'image/vnd-ms.dds' : ['dds'],
    'text/plain' : ['glsl', 'vert', 'vs', 'frag', 'fs', 'txt']
};

export function guessFileExtension(mimeType) {
    if (gltfMimeTypes.hasOwnProperty(mimeType)) {
        return '.' + gltfMimeTypes[mimeType][0];
    }
    return '.bin';
}

export function guessMimeType(filename : string): string {
    for (const mimeType in gltfMimeTypes) {
        for (const extensionIndex in gltfMimeTypes[mimeType]) {
            const extension = gltfMimeTypes[mimeType][extensionIndex];
            if (filename.toLowerCase().endsWith('.' + extension)) {
                return mimeType;
            }
        }
    }
    return 'application/octet-stream';
}

export class DataUriTextDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;
    private _tempFiles: Uri[] = [];
    private _tmpPathRoot: string;

    public UriPrefix = 'gltf-dataUri://';

    constructor(context: ExtensionContext) {
        this._context = context;
        this._tmpPathRoot = path.join(os.tmpdir(), 'gltf-vscode');
        try {
            fs.mkdirSync(this._tmpPathRoot);
        } catch (e) {}

        this._context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors((textEditors: vscode.TextEditor[]) => {
            let newTempList: Uri[] = [];
            for (let tempFile of this._tempFiles) {
                let found = false;
                for (let editor of textEditors) {
                    if (editor.document.uri == tempFile) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    try {
                        fs.unlinkSync(tempFile.fsPath);
                    } catch (ex) {
                        console.log(`Couldn't delete ${tempFile.fsPath} because ${ex.toString()}`);
                    }
                } else {
                    newTempList.push(tempFile);
                }
            }
            this._tempFiles = newTempList;
        }));
    }

    public uriIfNotDataUri(glTF, jsonPointer : string) : string {
        const data = getFromJsonPointer(glTF, jsonPointer);
        if ((typeof data === 'object') && data.hasOwnProperty('uri')) {
            const uri : string = data.uri;
            if (!uri.startsWith('data:')) {
                return uri;
            }
        }
        return null;
    }

    public isImage(jsonPointer : string) : boolean {
        return jsonPointer.startsWith('/images/');
    }

    public isShader(jsonPointer: string) : boolean {
        return jsonPointer.startsWith('/shaders/');
    }

    public async provideTextDocumentContent(uri: Uri): Promise<string> {
        const filename = decodeURIComponent(uri.authority);
        const document = vscode.workspace.textDocuments.find(e => e.fileName.toLowerCase() === filename.toLowerCase());
        if (!document) {
            return 'ERROR: Can no longer find document in editor: ' + filename;
        }
        const glTF = JSON.parse(document.getText());
        let jsonPointer = uri.path;
        if (this.isShader(jsonPointer) && jsonPointer.endsWith('.glsl')) {
            jsonPointer = jsonPointer.substring(0, jsonPointer.length - 5);
        }
        const data = getFromJsonPointer(glTF, jsonPointer);

        if (data && (typeof data === 'object') && data.hasOwnProperty('uri')) {
            let dataUri : string = data.uri;
            if (!dataUri.startsWith('data:')) {
                // Not a DataURI: Look up external reference.
                const name = Url.resolve(document.fileName, dataUri);
                const contents = fs.readFileSync(name);
                dataUri = 'data:image;base64,' + btoa(contents);
            }

            if (jsonPointer.startsWith('/images/')) {
                const mimeTypePos = dataUri.indexOf(';');
                let extension;
                if (mimeTypePos > 0) {
                    let mimeType = dataUri.substring(5, mimeTypePos)
                    extension = guessFileExtension(mimeType);

                    const posBase = dataUri.indexOf('base64,');
                    const body = dataUri.substring(posBase + 7);
                    let hash = stringHash(body);
                    let tmpFilePath = path.join(this._tmpPathRoot, hash.toString(16) + extension);
                    let tempUri = Uri.file(tmpFilePath);

                    let fileExisted = fs.existsSync(tmpFilePath);
                    if (!fileExisted) {
                        fs.writeFileSync(tmpFilePath, atob(body), {encoding: 'binary'});
                    }

                    // We'd like the image to open not using Html Preview but the image directly.
                    let viewColumn = parseInt(uri.query);
                    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    await vscode.commands.executeCommand('vscode.open', tempUri, viewColumn);
                    if (!fileExisted) {
                        this._tempFiles.push(tempUri);
                    }
                }
            } else {
                const posBase = dataUri.indexOf('base64,');
                const body = dataUri.substring(posBase + 7);
                return atob(body);
            }
        }

        return 'Unknown:\n' + uri.path;
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}
