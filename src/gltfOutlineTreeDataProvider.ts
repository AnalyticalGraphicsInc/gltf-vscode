'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jsonMap from 'json-source-map';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn, Range } from 'vscode';

export declare type GltfNodeType = 'animation' | 'material' | 'mesh' |  'node' | 'scene' | 'skeleton' |'skin' | 'texture' | 'root';

interface GltfNode {
    parent?: GltfNode;
    children: GltfNode[];
    range: vscode.Range;
    name: string;
    type: GltfNodeType;
}

export class GltfOutlineTreeDataProvider implements vscode.TreeDataProvider<GltfNode> {
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
        treeItem.iconPath = this.getIcon(node.type);
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
        try {
            this.parseTree();
        } catch (ex) {
            console.log(ex.toString());
        }
    }

    select(range: vscode.Range) {
        this.pauseUpdate = true;
        this.editor.selection = new vscode.Selection(range.start, range.end);
        this.editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    private walkTree(node: GltfNode, callback: (GltfNode) => void): void {
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
        this.gltf = null;
        this.pointers = null;
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
        } else {
            return;
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
                this.createScene(scene, sceneIndex, this.tree);
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

    private createScene(scene: any, sceneIndex: number, parent: GltfNode): void {
        let pointer = this.pointers['/scenes/' + sceneIndex];
        let sceneObj: GltfNode = {
            name: this.createName('Scene', sceneIndex.toString(), scene),
            children: [],
            type: 'scene',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(sceneObj);

        if (scene.nodes) {
            for (let nodeSceneIndex = 0; nodeSceneIndex < scene.nodes.length; nodeSceneIndex++) {
                let nodeIndex = scene.nodes[nodeSceneIndex];
                let node = this.gltf.nodes[nodeIndex];
                this.createNode(node, nodeIndex, false, sceneObj);
            }
        }
    }

    private createNode(node: any, nodeIndex: string, followBones: boolean, parent: GltfNode): void {
        let pointer = this.pointers['/nodes/' + nodeIndex];
        let nodeObj: GltfNode = {
            name: this.createName('Node', nodeIndex, node),
            children: [],
            type: this.skinMap.has(nodeIndex) ? 'skin' : 'node',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(nodeObj);

        if (node.mesh !== undefined) {
            this.createMesh(node.mesh, nodeIndex, nodeObj);
        }
        if (node.skin !== undefined) {
            let gltfNode = this.createSkin(node.skin, nodeObj);
        }
        if (node.children) {
            for (let nodeChildrenIndex = 0; nodeChildrenIndex < node.children.length; nodeChildrenIndex++) {
                let childNodeIndex = node.children[nodeChildrenIndex];
                if (!followBones && (this.skinMap.has(childNodeIndex) || this.skeletonMap.has(childNodeIndex))) {
                    continue;
                }
                let childNode = this.gltf.nodes[childNodeIndex];
                this.createNode(childNode, childNodeIndex, followBones, nodeObj);
            }
        }
        this.createNodeAnimations(nodeIndex, nodeObj);
    }

    private forEachAnimationChannel(callback: (animationIndex: number, channelIndex: number, target: any) => void): void {
        if (this.gltf.animations === undefined) {
            return;
        }
        for (let animationIndex = 0; animationIndex < this.gltf.animations.length; animationIndex++) {
            let animation = this.gltf.animations[animationIndex];
            for (let channelIndex = 0; channelIndex < animation.channels.length; channelIndex++) {
                let target = animation.channels[channelIndex].target;
                callback(animationIndex, channelIndex, target);
            }
        }
    }

    private createNodeAnimations(nodeIndex: string, parent: GltfNode): void {
        this.forEachAnimationChannel((animationIndex: number, channelIndex: number, target: any) => {
            if (target.node === nodeIndex) {
                let pointerPath = '/animations/' + animationIndex.toString() + '/channels/' + channelIndex.toString();
                let pointer = this.pointers[pointerPath];

                let animation = this.gltf.animations[animationIndex];
                let name = this.createName(target.path + ' animation', `${animationIndex} ${channelIndex}`, animation);
                let animationObj: GltfNode = {
                    name: name,
                    children: [],
                    type: 'animation',
                    parent: parent,
                    range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
                };
                parent.children.push(animationObj);
            }
        });
    }

    private createSkin(skinIndex: string, parent: GltfNode): void {
        let skin = this.gltf.skins[skinIndex];
        let name = this.createName('Skin', skinIndex, skin);

        let pointer = this.pointers['/skins/' + skinIndex];
        let skeletonNode = this.gltf.nodes[skin.skeleton];
        let skinObj: GltfNode = {
            name: name,
            children: [],
            type: 'skeleton',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(skinObj);

        this.createNode(skeletonNode, skin.skeleton, true, skinObj);
    }

    private createMesh(meshIndex: string, nodeIndex: string, parent: GltfNode): void {
        let mesh = this.gltf.meshes[meshIndex];
        let name = this.createName('Mesh', meshIndex, mesh);

        let pointer = this.pointers['/meshes/' + meshIndex];
        let meshObj: GltfNode = {
            name: name,
            children: [],
            type: 'mesh',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(meshObj);

        if (mesh.primitives)
        {
            for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++)
            {
                this.createMeshPrimitive(mesh, meshIndex, primitiveIndex.toString(), meshObj)
            }
        }
    }

    private createMeshPrimitive(mesh: any, meshIndex: string, primitiveIndex: string, parent: GltfNode): void {
        let primitive = mesh.primitives[primitiveIndex];
        let name = this.createName('Primitive', primitiveIndex, primitive);

        let pointerPath = '/meshes/' + meshIndex + '/primitives/' + primitiveIndex;
        let pointer = this.pointers[pointerPath];
        let primitiveObj: GltfNode = {
            name: name,
            children: [],
            type: 'mesh',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(primitiveObj);

        if (primitive.targets)
        {
            this.createMorphTargets(primitive, pointerPath, primitiveObj);
        }

        this.createMaterial(primitive.material, primitiveObj);
    }

    private createMorphTargets(primitive: any, pointerPath: string, parent: GltfNode): void {
        for (let morphTargetIndex = 0; morphTargetIndex < primitive.targets.length; morphTargetIndex++)
        {
            let targetPointerPath = pointerPath + '/targets/' + morphTargetIndex;
            let targetPointer = this.pointers[targetPointerPath];
            let targetObj: GltfNode = {
                name: `Morph Target ` + morphTargetIndex,
                children: [],
                type: 'mesh',
                parent: parent,
                range: new vscode.Range(this.editor.document.positionAt(targetPointer.value.pos), this.editor.document.positionAt(targetPointer.valueEnd.pos))
            };
            parent.children.push(targetObj);
        }
    }

    private createMaterial(materialIndex: string, parent: GltfNode): void {
        if (materialIndex === undefined) {
            return;
        }

        let material = this.gltf.materials[materialIndex];
        let name = this.createName('Material', materialIndex, material);

        let pointerPath = '/materials/' + materialIndex;
        let pointer = this.pointers[pointerPath];
        let materialObj: GltfNode = {
            name: name,
            children: [],
            type: 'material',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(materialObj);

        this.createTexture('Base Color', material.baseColorTexture, materialObj);
        this.createTexture('Normal', material.normalTexture, materialObj);
        this.createTexture('Occlusion', material.occlusionTexture, materialObj);
        this.createTexture('Emissive', material.emissiveTexture, materialObj);
        if (material.pbrMetallicRoughness !== undefined) {
            this.createTexture('PBR Base Color', material.pbrMetallicRoughness.baseColorTexture, materialObj);
            this.createTexture('Metallic Roughness', material.pbrMetallicRoughness.metallicRoughnessTexture, materialObj);
        }
    }

    private createTexture(typeName: string, textureIndex: any, parent: GltfNode): void {
        if (textureIndex === undefined) {
            return;
        }

        let texture = this.gltf.textures[textureIndex.index];
        let imageIndex = texture.source;
        let name = this.createName(typeName + ' Texture', textureIndex.index, texture);

        let pointerPath = '/images/' + imageIndex;
        let pointer = this.pointers[pointerPath];

        let textureObj: GltfNode = {
            name: name,
            children: [],
            type: 'texture',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };

        parent.children.push(textureObj);
    }

    private createName(typeName: string, index: string, obj: any) {
        let name = `${typeName} ${index}`;
        if (obj && obj.name) {
            name = `${obj.name} (${name})`;
        }

        return name;
    }

     private getIcon(nodeType: GltfNodeType): any {
        if (nodeType === 'node' || nodeType === 'root') {
            return null;
        }

        return {
            light: this.context.asAbsolutePath(path.join('resources', 'light', nodeType + '.svg')),
            dark: this.context.asAbsolutePath(path.join('resources', 'dark', nodeType + '.svg'))
        }
    }
}
