'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

function atob(str): string {
    return new Buffer(str, 'base64').toString('binary');
}

function getFromPath(glTF, path : string) {
    const pathSplit = path.split('/');
    const numPathSegments = pathSplit.length;
    let result = glTF;
    const firstValidIndex = 1; // Because the path has a leading slash.
    for (let i = firstValidIndex; i < numPathSegments; ++i) {
        result = result[pathSplit[i]];
    }
    return result;
}

export class DataUriTextDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    public UriPrefix = 'gltf-dataUri://';

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    public shouldUseHtmlPreview(glTF, path : string) : boolean {
        if (path.startsWith('/images/')) {
            return true;
        }
        //const data = getFromPath(glTF, path);
        //if ((typeof data === 'object') && data.hasOwnProperty('uri')) {
        //    const uri = data.uri;

        //}
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
            const dataUri = data.uri;

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
