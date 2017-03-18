'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

function atob(str): string {
    return new Buffer(str, 'base64').toString('binary');
}

export class DataUriTextDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    public provideTextDocumentContent(uri: Uri): string {
        const glTF = vscode.window.activeTextEditor.document.getText().split('\n');
        const lineNum = vscode.window.activeTextEditor.selection.active.line;
        const line = glTF[lineNum];
        const pos = line.indexOf('data:');
        if (pos < 0) {
            return 'No dataURI on this line.';
        }

        const posHalfMime = line.indexOf('/', pos);
        const posBase = line.indexOf('base64,', pos);
        const posEnd = line.indexOf('"', pos);
        if ((posHalfMime < 0) || (posBase < 0) || (posEnd < 0)) {
            return 'Can\'t parse dataURI on this line.';
        }

        const halfMime = line.substring(pos + 5, posHalfMime);
        const body = line.substring(posBase + 7, posEnd);

        if (halfMime === 'text') {
            return atob(body);
        }

        if (halfMime === 'image') {
            // TODO: The parent command needs to know if this doc is for an editor or an HTML preview.
            return '<img src="' + line.substring(pos, posEnd) + '" />';
        }

        return 'Unknown MIME type, starts with: ' + halfMime;
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}
