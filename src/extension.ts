'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Uri, ViewColumn } from 'vscode';
import { DataUriTextDocumentContentProvider } from './dataUriTextDocumentContentProvider';
import { GltfPreviewDocumentContentProvider } from './gltfPreviewDocumentContentProvider';
import * as jsonMap from 'json-source-map';

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

// this method is called when your extension is activated
// your extension is activated the very first time a command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "gltf-vscode" is now active.');

    // Register a preview for dataURIs in the glTF file.
    const dataPreviewProvider = new DataUriTextDocumentContentProvider(context);
    const dataPreviewRegistration = vscode.workspace.registerTextDocumentContentProvider('gltf-dataUri', dataPreviewProvider);
    context.subscriptions.push(dataPreviewRegistration);

    // Commands are registered in two places in the package.json file.
    context.subscriptions.push(vscode.commands.registerCommand('gltf.inspectDataUri', () => {
        let map;
        try {
            map = jsonMap.parse(vscode.window.activeTextEditor.document.getText());
        } catch (ex) {
            vscode.window.showErrorMessage('Error parsing this document.  Please make sure it is valid JSON.');
            return;
        }
        const lineNum = vscode.window.activeTextEditor.selection.active.line;
        const columnNum = vscode.window.activeTextEditor.selection.active.character;
        const pointers = map.pointers;

        let bestKey : string, secondBestKey : string;
        for (let key in pointers) {
            if (key && pointers.hasOwnProperty(key)) {
                let pointer = pointers[key];
                if (pointerContains(pointer, lineNum, columnNum)) {
                    //let pointerSize = pointer.valueEnd.pos - (pointer.key || pointer.value).pos;
                    //console.log('SIZE ' + pointerSize + ' - ' + key);
                    //secondBestPointer = bestPointer;
                    //bestPointer = pointer;
                    secondBestKey = bestKey;
                    bestKey = key;
                }
            }
        }

        if (!bestKey) {
            vscode.window.showErrorMessage('Please click on an embedded data item, and try this command again.');
        } else {
            if (secondBestKey && bestKey.endsWith('/uri')) {
                bestKey = secondBestKey;
            }

            const useHtml = dataPreviewProvider.shouldUseHtmlPreview(map.data, bestKey);
            const isShader = dataPreviewProvider.isShader(bestKey);

            if (isShader) {
                bestKey += '.glsl';
            }

            const previewUri = Uri.parse(dataPreviewProvider.UriPrefix +
                encodeURIComponent(vscode.window.activeTextEditor.document.fileName) +
                bestKey);

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
        }
    }));

    // Register a preview of the whole glTF file.
    const gltfPreviewProvider = new GltfPreviewDocumentContentProvider(context);
    const gltfPreviewRegistration = vscode.workspace.registerTextDocumentContentProvider('gltf-preview', gltfPreviewProvider);
    const gltfPreviewUri = Uri.parse('gltf-preview://gltf-vscode/gltf-preview');
    context.subscriptions.push(gltfPreviewRegistration);

    context.subscriptions.push(vscode.commands.registerCommand('gltf.previewModel', () => {
        vscode.commands.executeCommand('vscode.previewHtml', gltfPreviewUri, ViewColumn.Two, 'glTF Preview')
        .then((success) => {}, (reason) => { vscode.window.showErrorMessage(reason); });

        // This can be used to debug the preview HTML.
        //vscode.workspace.openTextDocument(gltfPreviewUri).then((doc: vscode.TextDocument) => {
        //    vscode.window.showTextDocument(doc, ViewColumn.Two, false).then(e => {
        //    });
        //}, (reason) => { vscode.window.showErrorMessage(reason); });

        gltfPreviewProvider.update(gltfPreviewUri);
    }));
}

// This method is called when your extension is deactivated.
export function deactivate() {
    console.log('Extension "gltf-vscode" deactivated.');
}
