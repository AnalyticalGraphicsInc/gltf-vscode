'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export function atob(str): string {
    return new Buffer(str, 'base64').toString('binary');
}

export function btoa(str): string {
    return new Buffer(str, 'binary').toString('base64');
}

export function getFromPath(glTF, path : string) {
    const pathSplit = path.split('/');
    const numPathSegments = pathSplit.length;
    let result = glTF;
    const firstValidIndex = 1; // Because the path has a leading slash.
    for (let i = firstValidIndex; i < numPathSegments; ++i) {
        result = result[pathSplit[i]];
    }
    return result;
}

export function guessMimeType(filename : string): string {
    if (/\.png$/i.test(filename)) {
        return 'image/png';
    }
    if (/\.jpe?g$/i.test(filename)) {
        return 'image/jpeg';
    }
    if (/\.glsl$/i.test(filename) || /\.vert$/i.test(filename) || /\.frag$/i.test(filename)) {
        return 'text/plain';
    }
    return 'application/octet-stream';
}

export class DataUriTextDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    public UriPrefix = 'gltf-dataUri://';

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    public shouldOpenDocument(glTF, path : string) : string {
        const data = getFromPath(glTF, path);
        if ((typeof data === 'object') && data.hasOwnProperty('uri')) {
            const uri : string = data.uri;
            if (!uri.startsWith('data:')) {
                return uri;
            }
        }
        return null;
    }

    public shouldUseHtmlPreview(path : string) : boolean {
        if (path.startsWith('/images/')) {
            return true;
        }
        return false;
    }

    public isShader(path: string) : boolean {
        return path.startsWith('/shaders/');
    }

    public provideTextDocumentContent(uri: Uri): string {
        const filename = decodeURIComponent(uri.authority);
        const document = vscode.workspace.textDocuments.find(e => e.fileName.toLowerCase() === filename.toLowerCase());
        if (!document) {
            vscode.window.showErrorMessage('Can no longer find document in editor: ' + filename);
            return undefined;
        }
        const glTF = JSON.parse(document.getText());
        let path = uri.path;
        if (this.isShader(path) && path.endsWith('.glsl')) {
            path = path.substring(0, path.length - 5);
        }
        const data = getFromPath(glTF, path);

        if (data && (typeof data === 'object') && data.hasOwnProperty('uri')) {
            let dataUri : string = data.uri;
            if (!dataUri.startsWith('data:')) {
                // Not a DataURI: Look up external reference.
                const name = Url.resolve(document.fileName, dataUri);
                const contents = fs.readFileSync(name);
                dataUri = 'data:image;base64,' + btoa(contents);
            }

            if (path.startsWith('/images/')) {
                return '<img src="' + dataUri + '" />';
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
