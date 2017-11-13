'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jsonMap from 'json-source-map';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export declare type GltfNodeType = 'mesh' | 'skin' | 'skeleton' | 'node' | 'animation' | 'scene' | 'root';

interface GltfNode {
    children: GltfNode[];
    range: vscode.Range;
    name: string;
    type: GltfNodeType;
}

export class GltfOutlineProvider implements vscode.TreeDataProvider<GltfNode> {
    private tree: GltfNode;
    private editor: vscode.TextEditor;
    private gltf: any;
    private pointers: any;
    private skinMap = new Map<string, string>();
    private skeletonMap = new Map<string, string>();

    private _onDidChangeTreeData: vscode.EventEmitter<GltfNode | null> = new vscode.EventEmitter<GltfNode | null>();
    readonly onDidChangeTreeData: vscode.Event<GltfNode | null> = this._onDidChangeTreeData.event;

    getTreeItem(node: GltfNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let hasChildren = (node.children.length > 0);
        let treeItem: vscode.TreeItem = new vscode.TreeItem(node.name, hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        treeItem.command = {
            command: 'gltf.openGltfSelection',
            title: '',
            arguments: [node.range]
        };
        treeItem.iconPath = this.getIcon(node);
        treeItem.contextValue = node.type;
        return treeItem;
    }

    getChildren(node?: GltfNode): Thenable<GltfNode[]> {
        if (node) {
            return Promise.resolve(node.children);
        } else {
            return Promise.resolve(this.tree ? this.tree.children : []);
        }
    }

    constructor(private context: vscode.ExtensionContext) {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.parseTree();
            this._onDidChangeTreeData.fire();
        });
        vscode.window.onDidChangeTextEditorSelection(e => {
            this._onDidChangeTreeData.fire();
        });
        vscode.workspace.onDidChangeTextDocument(e => {
            this.parseTree();
            this._onDidChangeTreeData.fire();
        });
        this.parseTree();
    }

    select(range: vscode.Range) {
        this.editor.selection = new vscode.Selection(range.start, range.end);
        this.editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    private parseTree(): void {
        this.tree = null;
        this.editor = vscode.window.activeTextEditor;
        if (this.editor && this.editor.document && this.editor.document.languageId === 'json') {
            try {
                let mapResult = jsonMap.parse(this.editor.document.getText());
                this.gltf = mapResult.data;
                this.pointers = mapResult.pointers;
                if (!this.gltf || !this.gltf.asset || !this.gltf.asset.version || this.gltf.asset.version[0] !== '2') {
                    this.gltf = null;
                }
            } catch (ex) {
                this.gltf = null;
                this.pointers = null;
            }
        }

        this.skinMap.clear();
        this.skeletonMap.clear();

        if (this.gltf && this.gltf.skins)
        {
            for (let skinIndex = 0; skinIndex < this.gltf.skins.length; skinIndex++)
            {
                let skin = this.gltf.skins[skinIndex];
                this.populateSkinMap(skinIndex, skin);
            }
        }

        this.tree = {
            name: "Root",
            children: [],
            type: 'root',
            range: new vscode.Range(this.editor.document.positionAt(this.pointers[''].value.pos), this.editor.document.positionAt(this.pointers[''].valueEnd.pos))
        };

        if (this.gltf && this.gltf.scenes)
        {
            for (let sceneIndex = 0; sceneIndex < this.gltf.scenes.length; sceneIndex++)
            {
                let scene = this.gltf.scenes[sceneIndex];
                this.tree.children.push(this.createScene(scene, sceneIndex));
            }
        }
    }

    private populateSkinMap(skinIndex: number, skin: any) {
        this.skeletonMap.set(skin.skeleton, skinIndex.toString());
        for (let joint of skin.joints)
        {
            this.skinMap.set(joint, skinIndex.toString());
        }
    }

    private createScene(scene: any, sceneIndex: number): GltfNode {
        let pointer = this.pointers['/scenes/' + sceneIndex];
        let sceneObj: GltfNode = {
            name: this.createName('Scene', sceneIndex.toString(), scene),
            children: [],
            type: 'scene',
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };

        if (scene.nodes)
        {
            for (let nodeSceneIndex = 0; nodeSceneIndex < scene.nodes.length; nodeSceneIndex++)
            {
                let nodeIndex = scene.nodes[nodeSceneIndex];
                let node = this.gltf.nodes[nodeIndex];
                sceneObj.children.push(this.createNode(node, nodeIndex, false));
            }
        }

        return sceneObj;
    }

    private createNode(node: any, nodeIndex: string, followBones: boolean): GltfNode {
        let pointer = this.pointers['/nodes/' + nodeIndex];
        let nodeObj: GltfNode = {
            name: this.createName('Node', nodeIndex, node),
            children: [],
            type: this.skinMap.has(nodeIndex) ? 'skin' : 'node',
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };

        if (node.mesh !== undefined)
        {
            nodeObj.children.push(this.createMesh(node.mesh));
        }
        if (node.skin !== undefined)
        {
            nodeObj.children.push(this.createSkin(node.skin));
        }
        if (node.children)
        {
            for (let nodeChildrenIndex = 0; nodeChildrenIndex < node.children.length; nodeChildrenIndex++)
            {
                let childNodeIndex = node.children[nodeChildrenIndex];
                if (!followBones && (this.skinMap.has(childNodeIndex) || this.skeletonMap.has(childNodeIndex))) {
                    continue;
                }
                let childNode = this.gltf.nodes[childNodeIndex];
                nodeObj.children.push(this.createNode(childNode, childNodeIndex, followBones));
            }
        }

        return nodeObj;
    }

    private createSkin(skinIndex: string): GltfNode {
        let skin = this.gltf.skins[skinIndex];
        let name = this.createName('Skin', skinIndex, skin);

        let pointer = this.pointers['/skins/' + skinIndex];
        let skeletonNode = this.gltf.nodes[skin.skeleton];
        let skinObj: GltfNode = {
            name: name,
            children: [ this.createNode(skeletonNode, skin.skeleton, true) ],
            type: 'skeleton',
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };

        return skinObj;
    }

    private createMesh(meshIndex: string): GltfNode {
        let mesh = this.gltf.meshes[meshIndex];
        let name = this.createName('Mesh', meshIndex, mesh);

        let pointer = this.pointers['/meshes/' + meshIndex];
        let meshObj: GltfNode = {
            name: name,
            children: [],
            type: 'mesh',
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        if (mesh.primitives)
        {
            for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++)
            {
                meshObj.children.push(this.createMeshPrimitive(mesh, meshIndex, primitiveIndex.toString()));
            }
        }

        return meshObj;
    }

    private createMeshPrimitive(mesh: any, meshIndex: string, primitiveIndex: string): GltfNode {
        let primitive = mesh.primitives[primitiveIndex];
        let name = this.createName('Primitive', primitiveIndex, primitive);

        let pointerPath = '/meshes/' + meshIndex + '/primitives/' + primitiveIndex;
        let pointer = this.pointers[pointerPath];
        let primitiveObj: GltfNode = {
            name: name,
            children: [],
            type: 'mesh',
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };

        if (primitive.targets)
        {
            for (let morphTargetIndex = 0; morphTargetIndex < primitive.targets.length; morphTargetIndex++)
            {
                let targetPointerPath = pointerPath + '/targets/' + morphTargetIndex;
                let targetPointer = this.pointers[targetPointerPath];
                let targetObj: GltfNode = {
                    name: `Morph Target ` + morphTargetIndex,
                    children: [],
                    type: 'mesh',
                    range: new vscode.Range(this.editor.document.positionAt(targetPointer.value.pos), this.editor.document.positionAt(targetPointer.valueEnd.pos))
                };
                primitiveObj.children.push(targetObj);
            }
        }

        return primitiveObj;
    }

    private createName(typeName: string, index: string, obj: any) {
        let name = `${typeName} ${index}`;
        if (obj && obj.name)
        {
            name += `: ${obj.name}`;
        }

        return name;
    }

    private _getChildren(node: GltfNode): GltfNode[] {
        return node.children;
    }

    private getIcon(node: GltfNode): any {
         //'node' | 'animation' | 'scene' | 'root'

        if (node.type === 'mesh') {
            return {
                light: this.context.asAbsolutePath(path.join('resources', 'light', 'mesh.svg')),
                dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'mesh.svg'))
            }
        }
        if (node.type === 'skin') {
            return {
                light: this.context.asAbsolutePath(path.join('resources', 'light', 'skin.svg')),
                dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'skin.svg'))
            }
        }
        if (node.type === 'skeleton') {
            return {
                light: this.context.asAbsolutePath(path.join('resources', 'light', 'skeleton.svg')),
                dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'skeleton.svg'))
            }
        }
        if (node.type === 'scene') {
            return {
                light: this.context.asAbsolutePath(path.join('resources', 'light', 'scene.svg')),
                dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'scene.svg'))
            }
        }
        return null;
    }
}
