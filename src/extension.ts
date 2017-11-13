'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Uri, ViewColumn } from 'vscode';
import { DataUriTextDocumentContentProvider, getFromPath, btoa, guessMimeType, guessFileExtension } from './dataUriTextDocumentContentProvider';
import { GltfPreviewDocumentContentProvider } from './gltfPreviewDocumentContentProvider';
import {  GltfOutlineProvider } from './gltfTreeViewDocumentContentProvider';
import * as GlbExport from './exportProvider';
import * as GlbImport from './importProvider';
import * as jsonMap from 'json-source-map';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';

function checkValidEditor() : boolean {
    if (vscode.window.activeTextEditor === undefined) {
        vscode.window.showErrorMessage('Document too large (or no editor selected). ' +
            'Click \'More info\' for details via GitHub.', 'More info').then(choice => {
                if (choice === 'More info') {
                    let uri = Uri.parse('https://github.com/AnalyticalGraphicsInc/gltf-vscode/blob/master/README.md#compatibiliy-and-known-size-limitations');
                    vscode.commands.executeCommand('vscode.open', uri);
                }
            });
        return false;
    }
    return true;
}

function pointerContains(pointer, lineNum : number, columnNum : number) : boolean {
    const start = pointer.key || pointer.value;
    if ((start.line > lineNum) ||
        ((start.line === lineNum) && (start.column > columnNum))) {
        return false;
    }
    const end = pointer.valueEnd;
    if ((end.line < lineNum) ||
        ((end.line === lineNum) && (end.column < columnNum))) {
        return false;
    }
    return true;
}

function tryGetJsonMap() {
    try {
        return jsonMap.parse(vscode.window.activeTextEditor.document.getText());
    } catch (ex) {
        vscode.window.showErrorMessage('Error parsing this document.  Please make sure it is valid JSON.');
    }
    return undefined;
}

function tryGetCurrentUriKey(map) {
    const lineNum = vscode.window.activeTextEditor.selection.active.line;
    const columnNum = vscode.window.activeTextEditor.selection.active.character;
    const pointers = map.pointers;

    let bestKey : string, secondBestKey : string;
    for (let key in pointers) {
        if (key && pointers.hasOwnProperty(key)) {
            let pointer = pointers[key];
            if (pointerContains(pointer, lineNum, columnNum)) {
                secondBestKey = bestKey;
                bestKey = key;
            }
        }
    }

    if (!bestKey) {
        vscode.window.showErrorMessage('Please click on an embedded data item, and try this command again.');
        return undefined;
    }

    if (secondBestKey && bestKey.endsWith('/uri')) {
        bestKey = secondBestKey;
    }
    return bestKey;
}

// this method is called when your extension is activated
// your extension is activated the very first time a command is executed
export function activate(context: vscode.ExtensionContext) {

    const gltfOutlineProvider = new GltfOutlineProvider(context);
    vscode.window.registerTreeDataProvider('gltfOutline', gltfOutlineProvider);

    // Register a preview for dataURIs in the glTF file.
    const dataPreviewProvider = new DataUriTextDocumentContentProvider(context);
    const dataPreviewRegistration = vscode.workspace.registerTextDocumentContentProvider('gltf-dataUri', dataPreviewProvider);
    context.subscriptions.push(dataPreviewRegistration);

    // Commands are registered in 2 to 3 places in the package.json file:
    // activationEvents, contributes.commands, and optionally contributes.keybindings.
    //
    // Inspect the contents of a uri or dataURI.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.inspectDataUri', () => {
        if (!checkValidEditor()) {
            return;
        }

        const map = tryGetJsonMap();
        if (!map) {
            return;
        }

        let bestKey = tryGetCurrentUriKey(map);
        if (!bestKey) {
            return;
        }

        const shouldOpenDocument = dataPreviewProvider.shouldOpenDocument(map.data, bestKey);
        const useHtml = dataPreviewProvider.shouldUseHtmlPreview(bestKey);
        const isShader = dataPreviewProvider.isShader(bestKey);
        let previewUri;

        if (isShader && shouldOpenDocument) {
            previewUri = Url.resolve(vscode.window.activeTextEditor.document.fileName, shouldOpenDocument);
        } else {
            if (isShader) {
                bestKey += '.glsl';
            }

            previewUri = Uri.parse(dataPreviewProvider.UriPrefix +
                encodeURIComponent(vscode.window.activeTextEditor.document.fileName) +
                bestKey);
        }

        if (useHtml) {
            vscode.commands.executeCommand('vscode.previewHtml', previewUri, ViewColumn.Two, bestKey)
                .then((success) => {}, (reason) => { vscode.window.showErrorMessage(reason); });

            dataPreviewProvider.update(previewUri);
        } else if (isShader) {
            vscode.workspace.openTextDocument(previewUri).then((doc: vscode.TextDocument) => {
                vscode.window.showTextDocument(doc, ViewColumn.Two, false).then(e => {
                });
            }, (reason) => { vscode.window.showErrorMessage(reason); });

            dataPreviewProvider.update(previewUri);
        } else {
            vscode.window.showErrorMessage('This feature currently works only with images and shaders.');
            console.log('gltf-vscode: No preview for: ' + bestKey);
        }
    }));

    //
    // Import a filename URI into a dataURI.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.importUri', () => {
        if (!checkValidEditor()) {
            return;
        }

        const map = tryGetJsonMap();
        if (!map) {
            return;
        }

        let bestKey = tryGetCurrentUriKey(map);
        if (!bestKey) {
            return;
        }

        const activeTextEditor = vscode.window.activeTextEditor;
        const data = getFromPath(map.data, bestKey);
        let dataUri : string = data.uri;
        if (dataUri.startsWith('data:')) {
            vscode.window.showWarningMessage('This field is already a dataURI.');
        } else {
            // Not a DataURI: Look up external reference.
            const name = Url.resolve(activeTextEditor.document.fileName, dataUri);
            let contents;
            try {
                contents = fs.readFileSync(name);
            } catch (ex) {
                vscode.window.showErrorMessage('Can\'t read file: ' + name);
                return;
            }
            dataUri = 'data:' + guessMimeType(name) + ';base64,' + btoa(contents);
            const pointer = map.pointers[bestKey + '/uri'];

            activeTextEditor.edit(editBuilder => {
                editBuilder.replace(new vscode.Range(pointer.value.line, pointer.value.column + 1,
                    pointer.valueEnd.line, pointer.valueEnd.column - 1), dataUri);
            });
        }
    }));

    //
    // Export a Data URI to a file.
    //
    function exportToFile(filename : string, pathFilename : string, pointer, dataUri : string) {
        const pos = dataUri.indexOf(',');
        const fileContents = Buffer.from(dataUri.substring(pos + 1), 'base64');

        try {
            fs.writeFileSync(pathFilename, fileContents);
        } catch (ex) {
            vscode.window.showErrorMessage('Can\'t write file: ' + pathFilename);
            return;
        }

        vscode.window.activeTextEditor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(pointer.value.line, pointer.value.column + 1,
                pointer.valueEnd.line, pointer.valueEnd.column - 1), filename);
        });
        vscode.window.showInformationMessage('File saved: ' + pathFilename);
    }

    context.subscriptions.push(vscode.commands.registerCommand('gltf.exportUri', async () => {
        if (!checkValidEditor()) {
            return;
        }

        const map = tryGetJsonMap();
        if (!map) {
            return;
        }

        let bestKey = tryGetCurrentUriKey(map);
        if (!bestKey) {
            return;
        }

        const activeTextEditor = vscode.window.activeTextEditor;
        const data = getFromPath(map.data, bestKey);
        let dataUri : string = data.uri;
        if (!dataUri.startsWith('data:')) {
            vscode.window.showWarningMessage('This field is not a dataURI.');
        } else {
            let guessName = 'Texture';
            if (data.name) {
                guessName = data.name;
            }
            const mimeTypePos = dataUri.indexOf(';');
            let extension;
            let mimeType = '';
            if (mimeTypePos > 0) {
                mimeType = dataUri.substring(5, mimeTypePos)
                extension = guessFileExtension(mimeType);
                guessName += extension;
            }
            let pathGuessName = path.join(path.dirname(activeTextEditor.document.fileName), guessName);

            const pointer = map.pointers[bestKey + '/uri'];
            if (!vscode.workspace.getConfiguration('glTF').get('alwaysOverwriteDefaultFilename'))
            {
                let options: vscode.SaveDialogOptions = {
                    defaultUri: Uri.file(pathGuessName),
                    filters: {
                        'All files': ['*']
                    }
                };
                options.filters[mimeType] = [extension.replace('.', '')];
                let uri = await vscode.window.showSaveDialog(options);
                if (uri) {
                    let filename = uri.fsPath;
                    if (extension && filename.indexOf('.') < 0) {
                        filename += extension;
                    }
                    exportToFile(path.basename(filename), filename, pointer, dataUri);
                }
            } else {
                // File may exist, but user says it's OK to overwrite.
                exportToFile(guessName, pathGuessName, pointer, dataUri);
            }
        }
    }));

    //
    // Export the whole file and its dependencies to a binary GLB file.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.exportGlbFile', async (te, t) => {
        if (!checkValidEditor()) {
            return;
        }

        let gltfContent = te.document.getText();
        let gltf;
        try {
            gltf = JSON.parse(gltfContent);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
            return;
        }
        if (!gltf || !gltf.asset || !gltf.asset.version || gltf.asset.version[0] !== '2') {
            vscode.window.showErrorMessage('Error: Only glTF 2.0 is supported for GLB export.');
            return;
        }

        let editor = vscode.window.activeTextEditor;
        let glbPath = editor.document.uri.fsPath.replace('.gltf', '.glb');
        if (!vscode.workspace.getConfiguration('glTF').get('alwaysOverwriteDefaultFilename')) {
            const options: vscode.SaveDialogOptions = {
                defaultUri: Uri.file(glbPath),
                filters: {
                    'Binary glTF': ['glb'],
                    'All files': ['*']
                }
            };
            let uri = await vscode.window.showSaveDialog(options);
            if (uri !== undefined) {
                try {
                    GlbExport.save(gltf, editor.document.uri.fsPath, uri.fsPath);
                    vscode.window.showInformationMessage('Glb exported as: ' + uri.fsPath);
                } catch (ex) {
                    vscode.window.showErrorMessage(ex.toString());
                }
            }
        } else {
            try {
                GlbExport.save(gltf, editor.document.uri.fsPath, glbPath);
                vscode.window.showInformationMessage('Glb exported as: ' + glbPath);
            } catch (ex) {
                vscode.window.showErrorMessage(ex.toString());
            }
        }
    }));

    //
    // Register a preview of the whole glTF file.
    //
    const gltfPreviewProvider = new GltfPreviewDocumentContentProvider(context);
    const gltfPreviewRegistration = vscode.workspace.registerTextDocumentContentProvider('gltf-preview', gltfPreviewProvider);
    context.subscriptions.push(gltfPreviewRegistration);

    context.subscriptions.push(vscode.commands.registerCommand('gltf.previewModel', () => {
        if (!checkValidEditor()) {
            return;
        }

        const fileName = path.basename(vscode.window.activeTextEditor.document.fileName);
        const gltfPreviewUri = Uri.parse(gltfPreviewProvider.UriPrefix + encodeURIComponent(vscode.window.activeTextEditor.document.fileName));
        vscode.commands.executeCommand('vscode.previewHtml', gltfPreviewUri, ViewColumn.Two, `glTF Preview [${fileName}]`)
        .then((success) => {}, (reason) => { vscode.window.showErrorMessage(reason); });

        // This can be used to debug the preview HTML.
        //vscode.workspace.openTextDocument(gltfPreviewUri).then((doc: vscode.TextDocument) => {
        //    vscode.window.showTextDocument(doc, ViewColumn.Two, false).then(e => {
        //    });
        //}, (reason) => { vscode.window.showErrorMessage(reason); });

        gltfPreviewProvider.update(gltfPreviewUri);
    }));

    vscode.commands.registerCommand('gltf.openGltfSelection', range => {
        gltfOutlineProvider.select(range);
    });

    //
    // Import of a GLB file and writing out its various chunks.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.importGlbFile', async (fileUri) => {

        if (typeof fileUri == 'undefined' || !(fileUri instanceof vscode.Uri) || !fileUri.fsPath.endsWith('.glb')) {
            if ((vscode.window.activeTextEditor !== undefined) &&
                (vscode.window.activeTextEditor.document.uri.fsPath.endsWith('.glb'))) {
                fileUri = vscode.window.activeTextEditor.document.uri;
             } else {
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Import',
                    filters: {
                        'Binary glTF': ['glb'],
                        'All files': ['*']
                    }
                };

                let openUri = await vscode.window.showOpenDialog(options);
                if (openUri && openUri[0]) {
                    fileUri = openUri[0];
                } else {
                    return;
                }
            }
        }

        try {
            await GlbImport.load(fileUri.fsPath);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Update all preview windows when the glTF file is saved.
    //
    vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        if (document === vscode.window.activeTextEditor.document) {
            const gltfPreviewUri = Uri.parse(gltfPreviewProvider.UriPrefix + encodeURIComponent(document.fileName));
            gltfPreviewProvider.update(gltfPreviewUri);
        }
    });
}

// This method is called when your extension is deactivated.
export function deactivate() {
}
