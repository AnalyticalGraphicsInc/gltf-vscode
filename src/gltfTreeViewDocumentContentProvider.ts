'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export class GltfTreeViewDocumentContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _context: ExtensionContext;
    private _gltf: any;
    private _treeData: any;
    private _skinMap = new Map<string, string>();

    public UriPrefix = 'gltf-tree-view-preview://';

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    private getFilePath(file : string) : string {
        return 'file:///' + this._context.asAbsolutePath(file);
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        this._gltf = undefined;

        let filePath = decodeURIComponent(uri.authority);
        const document = vscode.workspace.textDocuments.find(e => e.fileName.toLowerCase() === filePath.toLowerCase());
        if (!document) {
            this._gltf = undefined;
            return this.errorSnippet(`ERROR: Can no longer find document in editor: ${filePath}`);
        }
        // Update case of `fileName` to match actual document filename.
        filePath = document.fileName;
        const gltfFileName = path.basename(filePath);

        if (!(document.languageId === 'json')) {
            return this.errorSnippet("Active editor doesn't show a Json document - nothing preview.")
        }
        else {
            const gltfContent = document.getText();
            try {
                this._gltf = JSON.parse(gltfContent);
            } catch (ex) {
                return this.errorSnippet("Active editor doesn't show a Json document - nothing preview.")
            }
            if (!this._gltf || !this._gltf.asset || !this._gltf.asset.version || this._gltf.asset.version[0] !== '2') {
                this._gltf = undefined;
                return this.errorSnippet("Active editor doesn't show a Gltf document - nothing to preview.")
            }
        }
        this.updateTreeData();
        return this.generateHtml();
    }

    private updateTreeData() {
        this._treeData = [];
        this._skinMap.clear();

        if (this._gltf.skins)
        {
            for (let skinIndex = 0; skinIndex < this._gltf.skins.length; skinIndex++)
            {
                let skin = this._gltf.skins[skinIndex];
                this.populateSkinMap(skinIndex, skin);
            }
        }
        if (this._gltf.scenes)
        {
            for (let sceneIndex = 0; sceneIndex < this._gltf.scenes.length; sceneIndex++)
            {
                let scene = this._gltf.scenes[sceneIndex];
                this._treeData.push(this.createScene(scene, sceneIndex));
            }
        }
    }

    private populateSkinMap(skinIndex: number, skin: any)
    {
        this._skinMap.set(skin.skeleton, skinIndex.toString());
        for (let joint of skin.joints)
        {
            this._skinMap.set(joint, skinIndex.toString());
        }
    }

    private createScene(scene: any, sceneIndex: number): any
    {
        let sceneObj = {
            text: this.createName('Scene', sceneIndex.toString(), scene),
            children: []
        };

        if (scene.nodes)
        {
            for (let nodeSceneIndex = 0; nodeSceneIndex < scene.nodes.length; nodeSceneIndex++)
            {
                let nodeIndex = scene.nodes[nodeSceneIndex];
                let node = this._gltf.nodes[nodeIndex];
                sceneObj.children.push(this.createNode(node, nodeIndex));
            }
        }

        return sceneObj;
    }

    private createNode(node: any, nodeIndex: string): any
    {
        let skinName = '';
        if (this._skinMap.has(nodeIndex))
        {
            skinName = `; Skin ${this._skinMap.get(nodeIndex)}`;
        }
        let nodeObj = {
            text: this.createName('Node', nodeIndex, node) + skinName,
            children: []
        };

        if (node.mesh !== undefined)
        {
            nodeObj.children.push(this.createMesh(node.mesh, node.skin));
        }
        if (node.children)
        {
            for (let nodeChildrenIndex = 0; nodeChildrenIndex < node.children.length; nodeChildrenIndex++)
            {
                let childNodeIndex = node.children[nodeChildrenIndex];
                let childNode = this._gltf.nodes[childNodeIndex];
                nodeObj.children.push(this.createNode(childNode, childNodeIndex));
            }
        }

        return nodeObj;
    }

    private createMesh(meshIndex: string, skinIndex: string): any
    {
        let mesh = this._gltf.meshes[meshIndex];
        let skin;
        if (skinIndex !== undefined)
        {
            skin = this._gltf.skins[skinIndex];
        }

        let meshObj = {
            text: this.createName('Mesh', meshIndex, mesh) + '; ' + this.createName('Skin', skinIndex, skin),
            children: []
        };

        return meshObj;
    }

    private createName(typeName: string, index: string, obj: any)
    {
        let name = `${typeName} ${index}`;
        if (obj.name)
        {
            name += `: ${obj.name}`;
        }

        return name;
    }

    private errorSnippet(error: string): string {
        return `
            <body>
                ${error}
            </body>`;
    }

    private generateHtml(): string {
        let r = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
            <title>glTF Tree Preview</title>
            <script src="${this.getFilePath('node_modules/jquery/dist/jquery.min.js')}"></script>
            <link rel="stylesheet" href="${this.getFilePath('node_modules/jstree/dist/themes/default/style.min.css')}" />
            <script src="${this.getFilePath('node_modules/jstree/dist/jstree.min.js')}"></script>
            </head>
            <body>
            <div id='root'></div>
                <script>
                    $(function() {
                        $('#root').jstree({
                            core : {
                                themes : { icons: false },
                                data : ${JSON.stringify(this._treeData)}
                            }
                        });
                    });
                </script>
            </body>
        </html>`;

        return r;
    }
}
