'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Uri, ViewColumn } from 'vscode';
import { DataUriTextDocumentContentProvider } from './dataUriTextDocumentContentProvider';
import { GltfPreviewDocumentContentProvider } from './gltfPreviewDocumentContentProvider';

// this method is called when your extension is activated
// your extension is activated the very first time a command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "gltf-vscode" is now active.');

    // Register a preview for dataURIs in the glTF file.
    const dataPreviewProvider = new DataUriTextDocumentContentProvider(context);
    const dataPreviewRegistration = vscode.workspace.registerTextDocumentContentProvider('gltf-dataUri', dataPreviewProvider);
    const previewUri = Uri.parse('gltf-dataUri://gltf-vscode/gltf-dataUri-preview');
    context.subscriptions.push(dataPreviewRegistration);

    // Commands are registered in two places in the package.json file.
    context.subscriptions.push(vscode.commands.registerCommand('gltf.inspectDataUri', () => {
        // TODO: Investigate json-source-map.

        vscode.workspace.openTextDocument(previewUri).then((doc: vscode.TextDocument) => {
            vscode.window.showTextDocument(doc, ViewColumn.Two, false).then(e => {
            });
        }, (reason) => { vscode.window.showErrorMessage(reason); });

        dataPreviewProvider.update(previewUri);

        // Display a message box to the user
        //vscode.window.showInformationMessage('Hello World!');
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
