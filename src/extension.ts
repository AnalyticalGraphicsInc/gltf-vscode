import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { DataUriTextDocumentContentProvider } from './dataUriTextDocumentContentProvider';
import { ConvertGLBtoGltfLoadFirst, ConvertToGLB, getBuffer } from 'gltf-import-export';
import { GltfActionProvider } from './gltfActionProvider';
import * as GltfValidate from './validationProvider';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import { getFromJsonPointer, guessMimeType, btoa, guessFileExtension, getAccessorData, AccessorTypeToNumComponents, parseJsonMap, truncateJsonPointer, JsonMap } from './utilities';
import { GLTF2 } from './GLTF2';
import { GltfWindow } from './gltfWindow';
import { Insertables } from './editorUtilities';
let validator: any;
try {
  validator = require('gltf-validator');
} catch (e) {
  console.error('gltf-validator not available');
}
function checkValidEditor(textEditor: vscode.TextEditor): boolean {
    if (textEditor === undefined) {
        vscode.window.showErrorMessage('Document too large (or no editor selected). ' +
            'Click \'More info\' for details via GitHub.', 'More info').then(choice => {
                if (choice === 'More info') {
                    let uri = vscode.Uri.parse('https://github.com/AnalyticalGraphicsInc/gltf-vscode/blob/master/README.md#compatibiliy-and-known-size-limitations');
                    vscode.commands.executeCommand('vscode.open', uri);
                }
            });
        return false;
    }
    return true;
}

function pointerContains(pointer: any, selection: vscode.Selection, textEditor: vscode.TextEditor): boolean {
    const doc = textEditor.document;
    const range = new vscode.Range(doc.positionAt(pointer.value.pos), doc.positionAt(pointer.valueEnd.pos));

    return range.contains(selection);
}

function tryGetJsonMap(textEditor: vscode.TextEditor): JsonMap<GLTF2.GLTF> {
    try {
        return parseJsonMap(textEditor.document.getText());
    } catch (ex) {
        vscode.window.showErrorMessage('Error parsing this document.  Please make sure it is valid JSON.');
    }
    return undefined;
}

function tryGetCurrentJsonPointer(map: JsonMap<GLTF2.GLTF>, textEditor: vscode.TextEditor): string {
    const selection = textEditor.selection;
    const pointers = map.pointers;

    let bestKey: string, secondBestKey: string;
    for (let key of Object.keys(pointers)) {
        let pointer = pointers[key];
        if (pointerContains(pointer, selection, textEditor)) {
            secondBestKey = bestKey;
            bestKey = key;
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

function configurationChanged(): void {
    const config = vscode.workspace.getConfiguration('glTF');
    const showToolbar3D = config.get('showToolbar3D');

    vscode.commands.executeCommand('setContext', 'gltfShowToolbar3D', showToolbar3D);
}

// This method activates the language server, to run the glTF Validator.
export function activateServer(context: vscode.ExtensionContext): void {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
    // The debug options for the server
    let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [{ scheme: 'file', language: 'json' }],
        synchronize: {
            // Synchronize the setting section 'glTF' to the server
            configurationSection: 'glTF',
            // Notify the server about file changes to '.clientrc files contain in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    // Create the language client and start the client.
    let disposable = new LanguageClient('gltfLanguageServer', 'glTF Language Server', serverOptions, clientOptions).start();

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}

// this method is called when your extension is activated
// your extension is activated the very first time a command is executed
export function activate(context: vscode.ExtensionContext): void {

    // Set configuration options
    vscode.workspace.onDidChangeConfiguration(configurationChanged);
    configurationChanged();

    // Activate the validation server.
    //activateServer(context);

    // Create the window object that manages the various views.
    const gltfWindow = new GltfWindow(context);

    // Register a preview for dataURIs in the glTF file.
    const dataPreviewProvider = new DataUriTextDocumentContentProvider(context);
    const dataPreviewRegistration = vscode.workspace.registerTextDocumentContentProvider('gltf-dataUri', dataPreviewProvider);
    context.subscriptions.push(dataPreviewRegistration);

    // Commands are registered in 2 to 3 places in the package.json file:
    // activationEvents, contributes.commands, and optionally contributes.keybindings.
    // Also, note two different kinds: 'registerCommand' vs. 'registerTextEditorCommand'.
    // The latter includes the selected editor and an edit context as the first 2 args.
    //
    // Inspect the contents of the current json pointer in the glTF.
    //
    context.subscriptions.push(
    vscode.commands.registerCommand('ktx2hdr.openWebgpuDemo', () => {
      const panel = vscode.window.createWebviewPanel(
        'webgpuDemo',
        'WebGPU KTX2 Viewer',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      const readUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'read.js')
      );
      const scriptUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'main.js')
      );
      const shaderUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'shaders.wgsl')
      );

      const basisJsUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'basisu', 'basis_transcoder.js'));
      const basisWasmUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'basisu', 'basis_transcoder.wasm'));

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'validateGltf':
              await handleValidateGltf(panel, message.fileData, message.fileName, message.fileDir);
              break;
          }
        },
        undefined,
        context.subscriptions
      );

      const nonce = getNonce();

      // Load HTML templates from files
      const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'webview.html');
      const sidebarPath = vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'sidebar-template.html');

      let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
      const sidebarHtml = fs.readFileSync(sidebarPath.fsPath, 'utf8');

      // Replace placeholders
      html = html
        .replace(/\{\{nonce\}\}/g, nonce)
        .replace(/\{\{cspSource\}\}/g, panel.webview.cspSource)
        .replace(/\{\{basisJsUri\}\}/g, basisJsUri.toString())
        .replace(/\{\{basisWasmUri\}\}/g, basisWasmUri.toString())
        .replace(/\{\{readUri\}\}/g, readUri.toString())
        .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
        .replace(/\{\{shaderUri\}\}/g, shaderUri.toString())
        .replace(/\{\{sidebarHtml\}\}/g, sidebarHtml.replace(/`/g, '\\`').replace(/\$/g, '\\$'));

      panel.webview.html = html;
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gltf.inspectData', async () => {
        const textEditor = vscode.window.activeTextEditor;
        if (!checkValidEditor(textEditor)) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        let jsonPointer = tryGetCurrentJsonPointer(map, textEditor);
        if (!jsonPointer) {
            return;
        }

        const notDataUri = dataPreviewProvider.uriIfNotDataUri(map.data, jsonPointer);
        const isShader = dataPreviewProvider.isShader(jsonPointer);
        const isImage = dataPreviewProvider.isImage(jsonPointer);
        const isAccessor = dataPreviewProvider.isAccessor(jsonPointer);
        const isMeshPrimitive = dataPreviewProvider.isMeshPrimitive(jsonPointer);

        if (!isImage && !isShader && !isAccessor && !isMeshPrimitive) {
            vscode.window.showErrorMessage('This feature currently works only with accessors, images, shaders, and mesh primitives.');
            console.log('gltf-vscode: No preview for: ' + jsonPointer);
            return;
        }

        const fileName = textEditor.document.fileName;

        if (isAccessor) {
            jsonPointer = truncateJsonPointer(jsonPointer, 2);
            gltfWindow.inspectData.showAccessor(fileName, map.data, jsonPointer);
            return;
        }

        if (isMeshPrimitive) {
            jsonPointer = truncateJsonPointer(jsonPointer, 4);
            gltfWindow.inspectData.showMeshPrimitive(fileName, map.data, jsonPointer);
            return;
        }

        if (notDataUri && !isImage) {
            let finalUri = vscode.Uri.file(Url.resolve(fileName, notDataUri));
            await vscode.commands.executeCommand('vscode.open', finalUri, vscode.ViewColumn.Two);
        } else {
            // This is a data: type uri
            if (isShader) {
                jsonPointer += '.glsl';
            }

            const previewUri = vscode.Uri.parse(`${dataPreviewProvider.UriPrefix}${jsonPointer}?viewColumn=${vscode.ViewColumn.Two}#${encodeURIComponent(fileName)}`);
            await vscode.commands.executeCommand('vscode.open', previewUri, vscode.ViewColumn.Two);
            dataPreviewProvider.update(previewUri);
        }
    }));

    // Used by a TreeItem to change the behavior of expand and collapse.
    context.subscriptions.push(vscode.commands.registerCommand('gltf.noop', () => { }));

    //
    // Import a filename URI into a dataURI.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.importUri', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit
    ) => {
        if (!checkValidEditor(textEditor)) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        let bestKey = tryGetCurrentJsonPointer(map, textEditor);
        if (!bestKey) {
            return;
        }

        const data = getFromJsonPointer(map.data, bestKey);
        let dataUri: string = data.uri;
        if (dataUri.startsWith('data:')) {
            vscode.window.showWarningMessage('This field is already a dataURI.');
        } else {
            // Not a DataURI: Look up external reference.
            const name = Url.resolve(textEditor.document.fileName, dataUri);
            let contents: Buffer;
            try {
                contents = fs.readFileSync(name);
            } catch (ex) {
                vscode.window.showErrorMessage('Can\'t read file: ' + name);
                return;
            }
            dataUri = 'data:' + guessMimeType(name) + ';base64,' + btoa(contents);
            const pointer = map.pointers[bestKey + '/uri'];

            edit.replace(new vscode.Range(pointer.value.line, pointer.value.column + 1,
                pointer.valueEnd.line, pointer.valueEnd.column - 1), dataUri);
        }
    }));

    //
    // Export a Data URI to a file.
    //
    function exportToFile(filename: string, pathFilename: string, pointer, dataUri: string, textEditor: vscode.TextEditor) {
        const pos = dataUri.indexOf(',');
        const fileContents = Buffer.from(dataUri.substring(pos + 1), 'base64');
        const uint8Array = new Uint8Array(fileContents);

        try {
            fs.writeFileSync(pathFilename, uint8Array);
        } catch (ex) {
            vscode.window.showErrorMessage('Can\'t write file: ' + pathFilename);
            return;
        }

        textEditor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(pointer.value.line, pointer.value.column + 1,
                pointer.valueEnd.line, pointer.valueEnd.column - 1), filename);
        });
        vscode.window.showInformationMessage('File saved: ' + pathFilename);
    }

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.exportUri', async (
        textEditor: vscode.TextEditor
        // Because this is async, we can't trust the TextEditorEdit to stick around long enough.
    ) => {
        if (!checkValidEditor(textEditor)) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        let bestKey = tryGetCurrentJsonPointer(map, textEditor);
        if (!bestKey) {
            return;
        }

        const data = getFromJsonPointer(map.data, bestKey);
        let dataUri: string = data.uri;
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
                mimeType = dataUri.substring(5, mimeTypePos);
                extension = guessFileExtension(mimeType);
                guessName += extension;
            }
            let pathGuessName = path.join(path.dirname(textEditor.document.fileName), guessName);

            const pointer = map.pointers[bestKey + '/uri'];
            if (!vscode.workspace.getConfiguration('glTF').get('alwaysOverwriteDefaultFilename')) {
                let options: vscode.SaveDialogOptions = {
                    defaultUri: vscode.Uri.file(pathGuessName),
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
                    exportToFile(path.basename(filename), filename, pointer, dataUri, textEditor);
                }
            } else {
                // File may exist, but user says it's OK to overwrite.
                exportToFile(guessName, pathGuessName, pointer, dataUri, textEditor);
            }
        }
    }));

    //
    // Export the whole file and its dependencies to a binary GLB file.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.exportGlbFile', async (fileUri) => {
        const textEditor = vscode.window.activeTextEditor;
        let gltfContent: string;
        if (textEditor &&
            ((!fileUri) || !(fileUri instanceof vscode.Uri) || fileUri.fsPath === textEditor.document.uri.fsPath)
        ) {
            // textEditor is valid, fileUri is either matching the editor or invalid.
            fileUri = textEditor.document.uri;
            gltfContent = textEditor.document.getText();
        } else {
            // Text file to export will need loading.
            if ((!fileUri) || !(fileUri instanceof vscode.Uri)) {
                // fileUri appears invalid, ask the user for a better one.
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Convert to GLB',
                    filters: {
                        'Text glTF': ['gltf'],
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

            // Load the JSON text from disk.
            try {
                if (!fs.existsSync(fileUri.fsPath)) {
                    throw new Error('File not found.');
                }
                gltfContent = fs.readFileSync(fileUri.fsPath).toString();
            } catch (ex) {
                vscode.window.showErrorMessage('Can\'t read file: ' + fileUri.fsPath);
                return;
            }
        }

        let gltf: GLTF2.GLTF;
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

        let glbPath = fileUri.fsPath.replace('.gltf', '.glb');
        if (!vscode.workspace.getConfiguration('glTF').get('alwaysOverwriteDefaultFilename')) {
            const options: vscode.SaveDialogOptions = {
                defaultUri: vscode.Uri.file(glbPath),
                filters: {
                    'Binary glTF': ['glb'],
                    'VRM': ['vrm'],
                    'All files': ['*']
                }
            };
            let uri = await vscode.window.showSaveDialog(options);
            if (uri !== undefined) {
                try {
                    ConvertToGLB(gltf, fileUri.fsPath, uri.fsPath);
                    vscode.window.showInformationMessage('Glb exported as: ' + uri.fsPath);
                } catch (ex) {
                    vscode.window.showErrorMessage(ex.toString());
                }
            }
        } else {
            try {
                ConvertToGLB(gltf, fileUri.fsPath, glbPath);
                vscode.window.showInformationMessage('Glb exported as: ' + glbPath);
            } catch (ex) {
                vscode.window.showErrorMessage(ex.toString());
            }
        }
    }));

    //
    // Preview a glTF model.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.previewModel', () => {
        const textEditor = vscode.window.activeTextEditor;
        if (!checkValidEditor(textEditor)) {
            return;
        }

        gltfWindow.preview.openPanel(textEditor);
    }));

    //
    // Enable/Disable glTF debug mode.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.enableDebugMode', () => {
        if (gltfWindow.preview.activePanel) {
            gltfWindow.preview.activePanel.webview.postMessage({ command: 'enableDebugMode' });
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gltf.disableDebugMode', () => {
        if (gltfWindow.preview.activePanel) {
            gltfWindow.preview.activePanel.webview.postMessage({ command: 'disableDebugMode' });
        }
    }));

    //
    // Register glTF Tree View
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.openGltfSelection', range => {
        gltfWindow.outline.select(range);
    }));

    //
    // Import of a GLB file and writing out its various chunks.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.importGlbFile', async (fileUri) => {

        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri) || !(fileUri.fsPath.endsWith('.glb') || fileUri.fsPath.endsWith('.vrm'))) {
            if ((vscode.window.activeTextEditor !== undefined) && (
                (vscode.window.activeTextEditor.document.uri.fsPath.endsWith('.glb')) ||
                (vscode.window.activeTextEditor.document.uri.fsPath.endsWith('.vrm'))
            )
            ) {
                fileUri = vscode.window.activeTextEditor.document.uri;
            } else {
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Import',
                    filters: {
                        'Binary glTF': ['glb'],
                        'VRM (as Binary glTF)': ['vrm'],
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
            if (typeof fileUri.fsPath === 'undefined') {
                return;
            }
            if (!fs.existsSync(fileUri.fsPath)) {
                throw new Error('File not found.');
            }
            let getTargetFilename = async (): Promise<string> => {
                // Compose a target filename
                let targetFilename = fileUri.fsPath.endsWith('.glb') ? fileUri.fsPath.replace('.glb', '.gltf') : fileUri.fsPath.replace('.vrm', '.gltf') ;
                if (!vscode.workspace.getConfiguration('glTF').get('alwaysOverwriteDefaultFilename')) {
                    const options: vscode.SaveDialogOptions = {
                        defaultUri: vscode.Uri.file(targetFilename),
                        filters: {
                            'glTF': ['gltf'],
                            'All files': ['*']
                        }
                    };
                    let uri = await vscode.window.showSaveDialog(options);
                    if (!uri) {
                        return undefined;
                    }
                    targetFilename = uri.fsPath;
                }
                return targetFilename;
            };
            let targetFilename = await ConvertGLBtoGltfLoadFirst(fileUri.fsPath, getTargetFilename);

            if (targetFilename) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetFilename));
            }
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Run the validator on an external file.
    //
    context.subscriptions.push(vscode.commands.registerCommand('gltf.validateFile', async (fileUri) => {
        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri) ||
            !(fileUri.fsPath.endsWith('.glb') || fileUri.fsPath.endsWith('.vrm') || fileUri.fsPath.endsWith('.gltf'))) {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Validate',
                filters: {
                    'glTF Files': ['gltf', 'glb'],
                    'VRM Files': ['vrm'],
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

        try {
            await GltfValidate.validate(fileUri.fsPath);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('json', new GltfActionProvider(), {
            providedCodeActionKinds: GltfActionProvider.providedCodeActionKinds
        })
    );

    //
    // Quick Fix: Copy the currently-selected extension to "extensionsUsed".
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.declareExtension', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, diagnostic: vscode.Diagnostic
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        try {
            GltfActionProvider.declareExtension(diagnostic, map, textEditor, edit);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Quick Fix: Add a target to the bufferView based on attribute type.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.addBufferViewTarget', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, diagnostic: vscode.Diagnostic
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        try {
            GltfActionProvider.addBufferViewTarget(diagnostic, map, textEditor, edit);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Quick Fix: Add all needed targets for all bufferViews in this file.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.addAllBufferViewTargets', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, diagnostic: vscode.Diagnostic
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        try {
            GltfActionProvider.addAllBufferViewTargets(diagnostic, map, textEditor, edit);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Quick Fix: Clear byteStride for this animation's bufferView.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.clearAnimationByteStride', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, diagnostic: vscode.Diagnostic
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        try {
            GltfActionProvider.clearAnimationByteStride(diagnostic, map, textEditor, edit);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Quick Fix: Clear byteStrides for all animation bufferViews in this file.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.clearAllAnimationByteStrides', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, diagnostic: vscode.Diagnostic
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        try {
            GltfActionProvider.clearAllAnimationByteStrides(diagnostic, map, textEditor, edit);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    //
    // Quick Fix: Clear all Joint IDs with zero weight.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.clearUnusedJoints', async (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, diagnostic: vscode.Diagnostic
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        try {
            // Note the provided "edit" is invalid after awaiting the results of a save file dialog.
            await GltfActionProvider.clearUnusedJoints(diagnostic, map, textEditor);
        } catch (ex) {
            vscode.window.showErrorMessage(ex.toString());
        }
    }));

    function getAnimationFromJsonPointer(glTF, jsonPointer: string): { json: any, path: string } {
        let inAnimation = false;
        let inSampler = false;
        const jsonPointerSplit = jsonPointer.split('/');
        const numPointerSegments = Math.min(5, jsonPointerSplit.length);
        let result = glTF;
        let path = '';
        const firstValidIndex = 1; // Because the path has a leading slash.
        for (let i = firstValidIndex; i < numPointerSegments; ++i) {
            inAnimation = inAnimation || (jsonPointerSplit[i] === 'animations');
            inSampler = inAnimation && (inSampler || (jsonPointerSplit[i] === 'samplers'));
            result = result[jsonPointerSplit[i]];
            path += '/' + jsonPointerSplit[i];
        }
        if (!inSampler) {
            vscode.window.showErrorMessage('Please select an animation sampler to import.');
            result = undefined;
        }
        return { json: result, path: path };
    }

    //
    // Import an animation for editing.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.importAnimation', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }

        const bestKey = tryGetCurrentJsonPointer(map, textEditor);
        if (!bestKey) {
            return;
        }
        const glTF = map.data;

        const animationPointer = getAnimationFromJsonPointer(glTF, bestKey);
        if (!animationPointer.json) {
            return;
        }

        animationPointer.json.extras = animationPointer.json.extras || {};
        for (const key of ['input', 'output']) {
            const accessorId = animationPointer.json[key];
            const accessor = glTF.accessors[accessorId];
            let data: ArrayLike<number> = [];
            if (accessor !== undefined) {
                data = getAccessorData(textEditor.document.fileName, glTF, accessor);
            }
            animationPointer.json.extras[`vscode_gltf_${key}`] = Array.from(data);
            animationPointer.json.extras['vscode_gltf_type'] = accessor ? accessor.type : 'SCALAR';
        }

        const pointer = map.pointers[animationPointer.path];

        const insertables = new Insertables(textEditor);
        const eol = insertables.eol;
        const indent = insertables.indent;
        let newJson = JSON.stringify(animationPointer.json, null, indent);
        const newJsonLines = newJson.split(/\n/);
        const fullTab = new Array(5).join(indent);
        for (let i = 1; i < newJsonLines.length; i++) {
            newJsonLines[i] = fullTab + newJsonLines[i];
        }
        newJson = newJsonLines.join(eol);

        const newRange = new vscode.Range(pointer.value.line, pointer.value.column,
            pointer.valueEnd.line, pointer.valueEnd.column);

        edit.replace(newRange, newJson);
    }));

    //
    // Export an editable animation.
    //
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('gltf.exportAnimation', (
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit
    ) => {
        if (!textEditor) {
            return;
        }

        const map = tryGetJsonMap(textEditor);
        if (!map) {
            return;
        }
        let bestKey = tryGetCurrentJsonPointer(map, textEditor);
        if (!bestKey) {
            return;
        }

        const glTF = map.data;
        const animationPointer = getAnimationFromJsonPointer(map.data, bestKey);
        if (!animationPointer.json ||
            !animationPointer.json.extras ||
            !animationPointer.json.extras.vscode_gltf_type ||
            !animationPointer.json.extras.vscode_gltf_input ||
            !animationPointer.json.extras.vscode_gltf_output) {

            vscode.window.showErrorMessage('Please select an animation sampler with vscode_gltf extras.');
            return;
        }

        const samplerType = animationPointer.json.extras.vscode_gltf_type;
        const components = AccessorTypeToNumComponents[samplerType];
        let entriesPerComponent = animationPointer.json.interpolation === 'CUBICSPLINE' ? 3 : 1;

        // Check if this is a multi-target morph animation.
        const animationIndex = +animationPointer.path.split('/')[2];
        const outerAnimation = glTF.animations[animationIndex];
        if (outerAnimation.channels && outerAnimation.channels[0]) {
            const firstChannel = outerAnimation.channels[0];
            if (firstChannel.target && firstChannel.target.path === 'weights') {
                const animatedNode = glTF.nodes[firstChannel.target.node];
                const animatedMesh = glTF.meshes[animatedNode.mesh];
                const numTargets = animatedMesh.primitives[0].targets.length;
                entriesPerComponent *= numTargets;
            }
        }

        const newData = {
            input: animationPointer.json.extras.vscode_gltf_input,
            output: animationPointer.json.extras.vscode_gltf_output
        };
        if ((newData.input.length * components * entriesPerComponent) !== newData.output.length) {
            vscode.window.showErrorMessage(`Number of input values (${newData.input.length}) does not equal output values (${newData.output.length / components / entriesPerComponent}).`);
            return;
        }
        delete animationPointer.json.extras.vscode_gltf_type;
        delete animationPointer.json.extras.vscode_gltf_input;
        delete animationPointer.json.extras.vscode_gltf_output;
        if (Object.keys(animationPointer.json.extras).length === 0) {
            delete animationPointer.json.extras;
        }

        const inputAccessor = glTF.accessors[animationPointer.json.input];
        let bufferIndex = 0;
        if (inputAccessor !== undefined) {
            const bufferView = glTF.bufferViews[inputAccessor.bufferView];
            bufferIndex = bufferView.buffer;
        }
        const bufferJson = glTF.buffers[bufferIndex];
        const bufferData = getBuffer(glTF, bufferIndex, textEditor.document.fileName);
        const alignedLength = (value: number) => {
            const alignValue = 4;
            if (value === 0) {
                return value;
            }

            const multiple = value % alignValue;
            if (multiple === 0) {
                return value;
            }

            return value + (alignValue - multiple);
        };
        let bufferOffset = alignedLength(bufferData.length);

        const outputBuffers: Buffer[] = [bufferData];
        if (bufferOffset !== bufferData.length) {
            outputBuffers.push(new Buffer(bufferOffset - bufferData.length));
        }

        for (const accessorType of ['input', 'output']) {
            const values = newData[accessorType];
            const accessorComponents = accessorType === 'input' ? 1 : components;
            const max = new Array(accessorComponents).fill(Number.NEGATIVE_INFINITY);
            for (let i = 0; i < values.length; i++) {
                const j = i % accessorComponents;
                max[j] = Math.max(max[j], values[i]);
            }
            const min = new Array(accessorComponents).fill(Number.POSITIVE_INFINITY);
            for (let i = 0; i < values.length; i++) {
                const j = i % accessorComponents;
                min[j] = Math.min(min[j], values[i]);
            }
            const float32Values = Float32Array.from(values);
            const accessor = {
                "bufferView": glTF.bufferViews.length,
                "componentType": 5126,
                "count": values.length / accessorComponents,
                "type": accessorType === 'input' ? 'SCALAR' : samplerType,
                "max": max,
                "min": min
            };

            const accessorId = animationPointer.json[accessorType];
            if (glTF.accessors[accessorId] === undefined) {
                animationPointer.json[accessorType] = glTF.accessors.length;
                glTF.accessors.push(accessor);
            } else {
                glTF.accessors[accessorId] = accessor;
            }

            const newBufferView = {
                "buffer": bufferIndex,
                "byteOffset": bufferOffset,
                "byteLength": float32Values.byteLength,
            };
            glTF.bufferViews.push(newBufferView);
            if (alignedLength(float32Values.byteLength) !== float32Values.byteLength) {
                throw new Error('Float32Array not 4 byte length');
            }
            bufferOffset += float32Values.byteLength;
            outputBuffers.push(Buffer.from(float32Values.buffer as ArrayBuffer));
        }
        const uint8Buffers: Uint8Array[] = outputBuffers.map(b => new Uint8Array(b.buffer, b.byteOffset, b.byteLength));

        const finalBuffer = Buffer.concat(uint8Buffers);

        bufferJson.uri = 'data:application/octet-stream;base64,' + finalBuffer.toString('base64');
        bufferJson.byteLength = finalBuffer.length;
        const insertables = new Insertables(textEditor);
        const indent = insertables.indent;
        const newJson = JSON.stringify(glTF, null, indent);
        const newRange = new vscode.Range(0, 0, textEditor.document.lineCount + 1, 0);

        edit.replace(newRange, newJson);

        const newMap = tryGetJsonMap(textEditor);
        const newPointer = newMap.pointers[animationPointer.path];

        textEditor.selection = new vscode.Selection(newPointer.value.line, indent.length * 5, newPointer.value.line, indent.length * 5);
    }));
}

// This method is called when your extension is deactivated.
export function deactivate(): void {
}

async function handleValidateGltf(
  panel: vscode.WebviewPanel,
  base64Data: string,
  fileName: string,
  fileDir: string
) {
  if (!validator) {
    vscode.window.showErrorMessage('glTF Validator not installed');
    return;
  }

  try {
    console.log('Validating glTF file:', fileName);

    // Decode base64 to Uint8Array
    const binaryString = Buffer.from(base64Data, 'base64');
    const uint8Array = new Uint8Array(binaryString);

    // Validate
    const result = await validator.validateBytes(uint8Array, {
      uri: fileName,
      maxIssues: 0,
      writeTimestamp: false,
      externalResourceFunction: async (resourceUri: string) => {
        // For file input, we can't load external resources
        console.log('External resource requested:', resourceUri);
        throw new Error('External resources not supported for file input validation');
      }
    });

    console.log('Validation complete:', result);

    // Send results back to webview
    panel.webview.postMessage({
      command: 'validationResults',
      results: result
    });

    // Also show notification
    const issues = result.issues?.messages || [];
    const errorCount = issues.filter((i: any) => i.severity === 0).length;
    const warningCount = issues.filter((i: any) => i.severity === 1).length;

    if (errorCount > 0) {
      vscode.window.showErrorMessage(
        `glTF Validation: ${errorCount} error(s), ${warningCount} warning(s)`
      );
    } else if (warningCount > 0) {
      vscode.window.showWarningMessage(
        `glTF Validation: ${warningCount} warning(s)`
      );
    } else {
      vscode.window.showInformationMessage(
        `✓ Valid glTF: ${fileName}`
      );
    }

  } catch (error: any) {
    console.error('Validation error:', error);
    vscode.window.showErrorMessage(`Validation failed: ${error.message}`);
  }
}

function getNonce() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++){
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
