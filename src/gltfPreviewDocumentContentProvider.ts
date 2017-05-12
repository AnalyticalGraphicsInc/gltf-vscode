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

    // credit: http://stackoverflow.com/a/30714706
    private isAbsolutePath(pathToTest : string) : boolean {
        return path.normalize(pathToTest + '/') === path.normalize(path.resolve(pathToTest) + '/');
    }

    /**
    * @function fixPaths
    * Does an in-place update of the provided gltfObject to ensure that all 'uri' properties are absolute paths.
    * @param  {object} gltfObject The glTF content in object form
    * @param  {string} gltfRootPath The root path that the glTF object is located in (which is where any relative binary files might be referenced from)
    */
    private fixPaths(gltfObject: object, gltfRootPath: string) {
        if (!gltfRootPath.endsWith("\\"))
        {
            gltfRootPath = gltfRootPath + "\\";
        }

        for (var property in gltfObject) {
            if (gltfObject.hasOwnProperty(property)) {
                if (typeof gltfObject[property] == "object") {
                    this.fixPaths(gltfObject[property], gltfRootPath);
                } else if (property === "uri") {
                    if (!gltfObject[property].startsWith('data:') && !this.isAbsolutePath(gltfObject[property]))
                    {
                        gltfObject[property] = gltfRootPath + gltfObject[property];
                    }
                }
            }
        }
    }

    public provideTextDocumentContent(uri: Uri): string {
        const gltfRootPath = path.dirname(vscode.window.activeTextEditor.document.fileName);
        const gltfFileName = path.basename(vscode.window.activeTextEditor.document.fileName);

        // The "uri" property within a glTF file provides the reference to the binary content needed
        // for the glTF to be processed.  The content of that property is likely to fall into one of
        // four categories:
        // 1. Just the binary filename
        // 2. A partial path to the file.
        // 3. A full path (or full Uri reference)
        // 4. The full binary content base-64 encoded with a content-type header.
        //
        // If we don't make any changes to the glTF content, #3 and #4 work just fine with 3D renderers.
        // Unfortunately, #1 and #2 are considered to be paths relative to the "pages" subfolder of this
        // extension, and so those references fail to load.  So, we'll look for any "uri" property that
        // doesn't start with "data" (which would make it #4) and test the path to see if it's absolute
        // or not.  If it's not absolute, we'll prepend the root folder that the glTF file content
        // originated from.  This should ensure that both #1 and #2 work as well.
        var gltfContent = vscode.window.activeTextEditor.document.getText();
        var gltf = JSON.parse(gltfContent);
        this.fixPaths(gltf, gltfRootPath);
        gltfContent = JSON.stringify(gltf);

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
    <script id="gltfFileName" type="text/plain">${gltfFileName}</script>
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
