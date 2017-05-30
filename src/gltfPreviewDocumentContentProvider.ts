'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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

    // Instructions to open Chrome DevTools on the HTML preview window:
    //
    // 1. With the HTML preview window open, click Help->Toggle Developer Tools.
    //    Note that this DevTools is docked and is only for VSCode itself.
    //
    // 2. In the Console tab, paste this line:
    //    document.body.querySelector('webview').getWebContents().openDevTools();
    //
    // 3. You now have a second DevTools, the new one is un-docked.  Close the
    //    old docked one.
    //
    // 4. In the top of the Console tab of the remaining un-docked DevTools,
    //    click the pull-down and change "top" to "_target (webview.html)".
    //    Now you can debug the HTML preview in the sandboxed iframe.

    public provideTextDocumentContent(uri: Uri): string {
        let filePath = decodeURIComponent(uri.authority);
        const document = vscode.workspace.textDocuments.find(e => e.fileName.toLowerCase() === filePath.toLowerCase());
        if (!document) {
            return 'ERROR: Can no longer find document in editor: ' + filePath;
        }
        // Update case of `fileName` to match actual document filename.
        filePath = document.fileName;

        const gltfContent = document.getText();
        const gltfFileName = path.basename(filePath);
        let gltfRootPath : string = path.dirname(filePath).replace(/\\/g, '/');
        if (!gltfRootPath.endsWith("/")) {
            gltfRootPath += "/";
        }

        var gltfMajorVersion = 1;
        try {
            const gltf = JSON.parse(gltfContent);
            if (gltf && gltf.asset && gltf.asset.version && gltf.asset.version && gltf.asset.version[0] === '2') {
                gltfMajorVersion = 2;
            }
        } catch (ex) { }

        let extensionRootPath : string = this._context.asAbsolutePath('').replace(/\\/g, '/');
        if (!extensionRootPath.endsWith("/")) {
            extensionRootPath += "/";
        }

        const defaultEngine = vscode.workspace.getConfiguration('glTF').get('defaultV' + gltfMajorVersion + 'Engine');

        // We store the alternate HTML content for each of the 3D engines in a script tag within the Head of the
        // preview HTML since we can't do any page navigations.  We need to encode the content so that the enclosing
        // script tag doesn't get confused.
        const babylon = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/babylon.html'), 'UTF-8'));
        const cesium = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/cesium.html'), 'UTF-8'));
        const three = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/three.html'), 'UTF-8'));

        const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    <title>glTF Preview</title>

    <link rel="stylesheet" href="${this.getFilePath('pages/previewModel.css')}"></link>

    <!-- The 3D-engine HTML content that gets inserted into the div can literally use:
               {extensionRootPath}
         within its content and any instance of that string will be replaced with this
         real value at the time that the content is being inserted into the DOM.  This way,
         relative path references within the HTML can be resolved correctly. -->
    <script id="extensionRootPath" type="text/plain">${extensionRootPath}</script>

    <!-- Allows us to access the name of the engine that the user has selected in their VS Code preference
         to be the one that is used for displaying the 3D model by default. -->
    <script id="defaultEngine" type="text/plain">${defaultEngine}</script>

    <!-- This provides a simple menu UI that we can use to allow users to switch the display engine.  -->
    <script type="text/javascript" src="${this.getFilePath('pages/dat.gui.min.js')}"></script>

    <!-- Some 3D engines (like Cesium) can take the raw glTF content (without needing a uri)
         which lets them display the model as-is (even if it hasn't been saved to disk).
         Other engines (like Babylon.js and Three.js) require an actual file/uri to load.
         All engines require a "root path" that can be used to resolve any relative file
         references within the model. -->
    <script id="gltf" type="text/plain">${gltfContent}</script>
    <script id="gltfRootPath" type="text/plain">${gltfRootPath}</script>
    <script id="gltfFileName" type="text/plain">${gltfFileName}</script>

    <!-- Engine Display Content
         ======================
         This is the engine-specific display content that gets swapped into the "content" div
         when the engine is switched.  The ids match the names in the enum in package.json, as
         well as in the Options enum within previewModel.js. -->
    <script id="babylon.js" type="text/plain">${babylon}</script>
    <script id="cesium" type="text/plain">${cesium}</script>
    <script id="three.js" type="text/plain">${three}</script>

    <!-- Engines
         =======
         These are loaded statically as opposed to dynamically (like the div content)
         to avoid race conditions when loading the script within the div content tries to reference
         the engine. -->
    <script type="text/javascript" src="${this.getFilePath('engines/Cesium/Cesium.js')}"></script>
    <script type="text/javascript" src="${this.getFilePath('engines/Babylon/babylon.custom.js')}"></script>
    <script type="text/javascript" src="${this.getFilePath('engines/Three/three.min.js')}"></script>
    <script type="text/javascript" src="${this.getFilePath('engines/Three/GLTF2Loader.js')}"></script>
    <script type="text/javascript" src="${this.getFilePath('engines/Three/OrbitControls.js')}"></script>
</head>
<body>
    <!-- A common area that any engine can use for displaying warnings to users.  Will always be cleared -->
    <!-- when the current engine is changing. -->
    <div id="warningContainer" style.opacity="0"></div>

    <!-- The 3D-engine specific HTML content will be dynamically inserted within this div whenever the
         active 3D engine changes. -->
    <div id="content"></div>

    <!-- Provides the logic for the dat.gui menu UI and swapping the engine display content. -->
    <script id="previewModel" type="text/javascript" src="${this.getFilePath('pages/previewModel.js')}"></script>
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
