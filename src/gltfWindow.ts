import * as vscode from 'vscode';
import { GltfPreview } from './gltfPreview';
import { GltfInspectData } from './gltfInspectData';
import { GltfOutline } from './gltfOutline';

function isGltfFile(editor: vscode.TextEditor | undefined): boolean {
    if (editor) {
        if (editor.document.fileName.toLowerCase().endsWith('.gltf')) {
            return true;
        }
        if (editor.document.uri.scheme == 'glb') {
            return true;
        }
    }
    return false;
}

export class GltfWindow {
    private _gltfPreview: GltfPreview;
    private _gltfInspectData: GltfInspectData;
    private _gltfOutline: GltfOutline;
    private _activeTextEditor: vscode.TextEditor;
    private _onDidChangeActiveTextEditor: vscode.EventEmitter<vscode.TextEditor | undefined> = new vscode.EventEmitter<vscode.TextEditor | undefined>();

    constructor(context: vscode.ExtensionContext) {
        this._gltfPreview = new GltfPreview(context);

        this._gltfOutline = new GltfOutline(context, this);
        vscode.window.registerTreeDataProvider('gltfOutline', this._gltfOutline);

        this._gltfInspectData = new GltfInspectData(context, this);
        this._gltfInspectData.setTreeView(vscode.window.createTreeView('gltfInspectData', { treeDataProvider: this._gltfInspectData }));

        vscode.window.onDidChangeActiveTextEditor(() => {
            // Wait a frame before updating to ensure all window states are updated.
            setImmediate(() => this.update());
        });

        this._gltfPreview.onDidChangeActivePanel(() => {
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

    public get preview(): GltfPreview {
        return this._gltfPreview;
    }

    public get inspectData(): GltfInspectData {
        return this._gltfInspectData;
    }

    public get outline(): GltfOutline {
        return this._gltfOutline;
    }

    /**
     * Event that is fired when the active glTF editor has changed.
     */
    public readonly onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;

    private update() {
        let gltfPreviewActive = false;
        let gltfFileActive = false;

        let activeTextEditor = this._gltfPreview.activePanel && this._gltfPreview.activePanel.textEditor;
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
    }
}
