'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export class GltfPreviewDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;
    private _mainHtml: string;
    private _babylonHtml: string;
    private _cesiumHtml: string;
    private _threeHtml: string;

    public UriPrefix = 'gltf-preview://';

    constructor(context: ExtensionContext) {
        this._context = context;
        this._mainHtml = fs.readFileSync(this._context.asAbsolutePath('pages/previewModel.html'), 'UTF-8')
        this._babylonHtml = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/babylonView.html'), 'UTF-8'));
        this._cesiumHtml = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/cesiumView.html'), 'UTF-8'));
        this._threeHtml = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/threeView.html'), 'UTF-8'));
    }

    private addFilePrefix(file: string): string {
        return ((file[0] === '/') ? 'file://' : 'file:///') + file;
    }

    private getFilePath(file: string): string {
        return this.addFilePrefix(this._context.asAbsolutePath(file));
    }

    private toUrl(file: string): string {
        return this.addFilePrefix(file.replace(/\\/g, '/'));
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
    //    click the pull-down and change "top" to "active-frame (webview.html)".
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
        let gltfRootPath : string = this.toUrl(path.dirname(filePath));
        if (!gltfRootPath.endsWith("/")) {
            gltfRootPath += "/";
        }

        var gltfMajorVersion = 1;
        try {
            const gltf = JSON.parse(gltfContent);
            if (gltf && gltf.asset && gltf.asset.version && gltf.asset.version[0] === '2') {
                gltfMajorVersion = 2;
            }
        } catch (ex) { }

        let extensionRootPath : string = this._context.asAbsolutePath('').replace(/\\/g, '/');
        if (!extensionRootPath.endsWith("/")) {
            extensionRootPath += "/";
        }

        const defaultEngine = vscode.workspace.getConfiguration('glTF').get('defaultV' + gltfMajorVersion + 'Engine');

        const defaultBabylonReflection = String(vscode.workspace.getConfiguration('glTF.Babylon')
            .get('environment')).replace('{extensionRootPath}', extensionRootPath.replace(/\/$/, ''));
        const defaultThreeReflection = String(vscode.workspace.getConfiguration('glTF.Three')
            .get('environment')).replace('{extensionRootPath}', extensionRootPath.replace(/\/$/, ''));

        // These strings are available in JavaScript by looking up the ID.  They provide the extension's root
        // path (needed for locating additional assets), various settings, and the glTF name and contents.
        // Some engines can display "live" glTF contents, others must load from the glTF path and filename.
        // The path name is needed for glTF files that include external resources.
        const strings = [
            { id: 'extensionRootPath', text: this.toUrl(extensionRootPath) },
            { id: 'defaultEngine', text: defaultEngine },
            { id: 'defaultBabylonReflection', text: this.toUrl(defaultBabylonReflection) },
            { id: 'defaultThreeReflection', text: this.toUrl(defaultThreeReflection) },
            { id: 'babylonHtml', text: this._babylonHtml },
            { id: 'cesiumHtml', text: this._cesiumHtml },
            { id: 'threeHtml', text: this._threeHtml },
            { id: 'gltf', text: gltfContent },
            { id: 'gltfRootPath', text: gltfRootPath },
            { id: 'gltfFileName', text: gltfFileName }
        ];

        const styles = [
            'pages/babylonView.css',
            'pages/cesiumView.css',
            'pages/threeView.css',
            'pages/previewModel.css'
        ];

        const scripts = [
            'engines/Cesium/Cesium.js',
            'node_modules/babylonjs/babylon.max.js',
            'node_modules/babylonjs-loaders/babylonjs.loaders.js',
            'engines/Three/three.min.js',
            'engines/Three/GLTFLoader.js',
            'engines/Three/OrbitControls.js',
            'pages/babylonView.js',
            'pages/cesiumView.js',
            'pages/threeView.js',
            'pages/previewModel.js'
        ];

        // Note that with the file: protocol, we must manually specify the UTF-8 charset.
        const content = this._mainHtml.replace('{assets}',
            `<script type="text/x-draco-decoder" src="${this.getFilePath('engines/Draco/draco_decoder.js')}"></script>` +
            styles.map(s => `<link rel="stylesheet" href="${this.getFilePath(s)}"></link>\n`).join('') +
            strings.map(s => `<script id="${s.id}" type="text/plain">${s.text}</script>\n`).join('') +
            scripts.map(s => `<script type="text/javascript" charset="UTF-8" src="${this.getFilePath(s)}"></script>\n`).join(''));

        return content;
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}
