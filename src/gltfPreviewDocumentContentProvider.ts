'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export class GltfPreviewDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    public UriPrefix = 'gltf-preview://';

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    private getFilePath(file : string) : string {
        return 'file:///' + this._context.asAbsolutePath(file);
    }

    public provideTextDocumentContent(uri: Uri): string {
        const fileName = decodeURIComponent(uri.authority);
        const document = vscode.workspace.textDocuments.find(e => e.fileName.toLowerCase() === fileName.toLowerCase());
        if (!document) {
            vscode.window.showErrorMessage('Can no longer find document in editor: ' + fileName);
            return undefined;
        }

        const gltfContent = document.getText();
        let gltfRootPath = path.dirname(fileName).replace('\\', '/');
        if (!gltfRootPath.endsWith("/")) {
            gltfRootPath += "/";
        }

        const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    <title>glTF Preview</title>
    <link rel="stylesheet" href="${this.getFilePath('pages/previewModel.css')}">
    <script src="${this.getFilePath('Cesium/Cesium.js')}"></script>
    <script id="gltf" type="text/plain">${gltfContent}</script>
    <script id="gltfRootPath" type="text/plain">${gltfRootPath}</script>
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
