'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jsonMap from 'json-source-map';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn, Range } from 'vscode';

export declare type GltfNodeType = 'material' | 'texture' | 'mesh' | 'skin' | 'skeleton' | 'node' | 'animation' | 'scene' | 'root';

export class GltfNode {
    parent?: GltfNode;
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
    private selectedList = new Set<GltfNode>();

    private _onDidChangeTreeData: vscode.EventEmitter<GltfNode | null> = new vscode.EventEmitter<GltfNode | null>();
    readonly onDidChangeTreeData: vscode.Event<GltfNode | null> = this._onDidChangeTreeData.event;

    getTreeItem(node: GltfNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let treeState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None;
        if (node.children.length > 0) {
            treeState = !this.selectedList.has(node) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
        }

        let treeItem: vscode.TreeItem = new vscode.TreeItem(node.name, treeState);
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

    private pauseUpdate: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.parseTree();
            this._onDidChangeTreeData.fire();
        });
        vscode.window.onDidChangeTextEditorSelection(e => {
            this.fillSelectedList();
            if (!this.pauseUpdate && vscode.workspace.getConfiguration('glTF').get('expandOutlineWithSelection')) {
                this._onDidChangeTreeData.fire();
            }
            this.pauseUpdate = false;
        });
        vscode.workspace.onDidChangeTextDocument(e => {
            this.parseTree();
            this._onDidChangeTreeData.fire();
        });
        this.parseTree();
    }

    select(range: vscode.Range) {
        this.pauseUpdate = true;
        this.editor.selection = new vscode.Selection(range.start, range.end);
        this.editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    private walkTree(node: GltfNode, callback: (GltfNode) => void): void {
        console.log(`walkTree: ${node.name}`);
        callback(node);
        for (let child of node.children) {
            this.walkTree(child, callback);
        }
    }

    private fillSelectedList(): void {
        this.selectedList.clear();
        if (vscode.workspace.getConfiguration('glTF').get('expandOutlineWithSelection')) {
            for (let selection of this.editor.selections) {
                this.walkTree(this.tree, (node: GltfNode) => {
                    if (node.range.contains(selection)) {
                        do {
                            console.log(`selectedList.add(${node.name})`);
                            this.selectedList.add(node);
                            node = node.parent;
                        } while (node !== undefined);
                    }
                });
            }
        }
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

        if (this.gltf && this.gltf.skins) {
            for (let skinIndex = 0; skinIndex < this.gltf.skins.length; skinIndex++) {
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

        if (this.gltf && this.gltf.scenes) {
            for (let sceneIndex = 0; sceneIndex < this.gltf.scenes.length; sceneIndex++) {
                let scene = this.gltf.scenes[sceneIndex];
                let gltfNode = this.createScene(scene, sceneIndex);
                gltfNode.parent = this.tree;
                this.tree.children.push(gltfNode);
            }
        }

        this.fillSelectedList();
    }

    private populateSkinMap(skinIndex: number, skin: any) {
        this.skeletonMap.set(skin.skeleton, skinIndex.toString());
        for (let joint of skin.joints) {
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

        if (scene.nodes) {
            for (let nodeSceneIndex = 0; nodeSceneIndex < scene.nodes.length; nodeSceneIndex++) {
                let nodeIndex = scene.nodes[nodeSceneIndex];
                let node = this.gltf.nodes[nodeIndex];
                let gltfNode = this.createNode(node, nodeIndex, false);
                gltfNode.parent = sceneObj;
                sceneObj.children.push(gltfNode);
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

        if (node.mesh !== undefined) {
            let gltfNode = this.createMesh(node.mesh);
            gltfNode.parent = nodeObj;
            nodeObj.children.push(gltfNode);
        }
        if (node.skin !== undefined) {
            let gltfNode = this.createSkin(node.skin);
            gltfNode.parent = nodeObj;
            nodeObj.children.push(gltfNode);
        }
        if (node.children) {
            for (let nodeChildrenIndex = 0; nodeChildrenIndex < node.children.length; nodeChildrenIndex++) {
                let childNodeIndex = node.children[nodeChildrenIndex];
                if (!followBones && (this.skinMap.has(childNodeIndex) || this.skeletonMap.has(childNodeIndex))) {
                    continue;
                }
                let childNode = this.gltf.nodes[childNodeIndex];
                let gltfNode = this.createNode(childNode, childNodeIndex, followBones);
                gltfNode.parent = nodeObj;
                nodeObj.children.push(gltfNode);
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
            children: [],
            type: 'skeleton',
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        let childNode = this.createNode(skeletonNode, skin.skeleton, true);
        childNode.parent = skinObj;
        skinObj.children.push(childNode);

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
                let gltfNode = this.createMeshPrimitive(mesh, meshIndex, primitiveIndex.toString())
                gltfNode.parent = meshObj;
                meshObj.children.push(gltfNode);
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
                    parent: primitiveObj,
                    range: new vscode.Range(this.editor.document.positionAt(targetPointer.value.pos), this.editor.document.positionAt(targetPointer.valueEnd.pos))
                };
                primitiveObj.children.push(targetObj);
            }
        }

        return primitiveObj;
    }

    private createName(typeName: string, index: string, obj: any) {
        let name = `${typeName} ${index}`;
        if (obj && obj.name) {
            name = `${obj.name} (${name})`;
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
