'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export class GltfPreviewDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    private getFilePath(file : string) : string {
        return 'file://' + this._context.asAbsolutePath(file);
    }

    public provideTextDocumentContent(uri: Uri): string {
        const glTF = vscode.window.activeTextEditor.document.getText();

        // The "uri" property within a glTF file provides the reference to the binary content needed
        // for the glTF to be processed.  The content of that property is likely to fall into one of
        // four categories:
        // 1. Just the binary filename
        // 2. A partial path to the file.
        // 3. A full path (or full Uri reference)
        // 4. The full binary content base-64 encoded with a content-type header.
        //    a full path specified for their uri.  If they don't have a full path specified,
        // If we reference
        const glTFRootPath = path.dirname(vscode.window.activeTextEditor.document.fileName);
        const glTFWithUpdatedPaths = glTF.replace(/^(\s*"uri"\s*:\s*")([^/\\\s]*)(".*)$/igm, "$1" + glTFRootPath.replace(/\\/g,"\\\\") + "\\\\$2$3");

        const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    <title>glTF Preview</title>
    <link rel="stylesheet" href="${this.getFilePath('pages/previewModel.css')}">
    <script src="${this.getFilePath('Cesium/Cesium.js')}"></script>
    <script id="glTF" type="text/plain">${glTFWithUpdatedPaths}</script>
</head>
<body>
    <div id="cesiumContainer">
        <canvas id="mainCanvas"></canvas>
        <div id="cesiumCreditContainer"></div>
    </div>
    <div id="errorContainer"></div>
    <script src="${this.getFilePath('pages/previewModel.js')}"></script>
</body>
</html>
`;
        return content;
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}
