import * as vscode from 'vscode';
import { GltfPreview, GltfPreviewPanel } from './gltfPreview';

function isGltfFile(editor: vscode.TextEditor | undefined): boolean {
    return editor && editor.document.fileName.toLowerCase().endsWith('.gltf');
}

export class GltfWindow {
    private _activeTextEditor: vscode.TextEditor;
    private _onDidChangeActiveTextEditor: vscode.EventEmitter<vscode.TextEditor | undefined> = new vscode.EventEmitter<vscode.TextEditor | undefined>();

    constructor(private gltfPreview: GltfPreview) {
        vscode.window.onDidChangeActiveTextEditor(() => {
            // Wait a frame before updating to ensure all window states are updated.
            setImmediate(() => this.update());
        });

        this.gltfPreview.onDidChangeActivePanel(() => {
            // Wait a frame before updating to ensure all window states are updated.
            setImmediate(() => this.update());
        });

        this.update();
    }

    /**
     * The active text editor of the vscode window editing a glTF or the text editor of the active glTF preview panel.
     */
    public get activeTextEditor(): vscode.TextEditor | undefined {
        return this._activeTextEditor;
    }

    /**
     * Gets the preview panel by file name.
     */
    public getPreviewPanel(fileName: string): GltfPreviewPanel {
        return this.gltfPreview.getPanel(fileName);
    }

    /**
     * Event that is fired when the active glTF editor has changed.
     */
    public readonly onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;

    private update() {
        let gltfPreviewActive = false;
        let gltfFileActive = false;

        let activeTextEditor = this.gltfPreview.activePanel && this.gltfPreview.activePanel.textEditor;
        if (activeTextEditor) {
            gltfPreviewActive = true;
        }
        else if (isGltfFile(vscode.window.activeTextEditor)) {
            activeTextEditor = vscode.window.activeTextEditor;
            gltfFileActive = true;
        }

        vscode.commands.executeCommand('setContext', 'gltfPreviewActive', gltfPreviewActive);
        vscode.commands.executeCommand('setContext', 'gltfFileActive', gltfFileActive);
        vscode.commands.executeCommand('setContext', 'gltfActive', gltfPreviewActive || gltfFileActive);

        if (this._activeTextEditor !== activeTextEditor) {
            this._activeTextEditor = activeTextEditor;
            this._onDidChangeActiveTextEditor.fire(activeTextEditor);
        }
    };
}
