'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as Url from 'url';
import * as jsonMap from 'json-source-map';
import * as assetInfo from './dataUriTextDocumentContentProvider';
import { sprintf } from 'sprintf-js';
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn, Range } from 'vscode';

export declare type GltfNodeType = 'animation' | 'material' | 'mesh' |  'node' | 'scene' | 'skeleton' |'skin' | 'texture' | 'root';

interface GltfNode {
    parent?: GltfNode;
    children: GltfNode[];
    range: vscode.Range;
    name: string;
    type: GltfNodeType;
    size?: number;
}

interface MeshInfo {
    size: number;
    vertices: number;
};

export class GltfOutlineTreeDataProvider implements vscode.TreeDataProvider<GltfNode> {
    private tree: GltfNode;
    private editor: vscode.TextEditor;
    private gltf: any;
    private pointers: any;
    private skinMap = new Map<string, Set<string>>(); // jointId (nodeId) to Set of skinIds
    private skeletonMap = new Map<string, Set<string>>(); // nodeId (skeleton) to Set of skinIds
    private selectedList = new Set<GltfNode>();

    private _onDidChangeTreeData: vscode.EventEmitter<GltfNode | null> = new vscode.EventEmitter<GltfNode | null>();
    readonly onDidChangeTreeData: vscode.Event<GltfNode | null> = this._onDidChangeTreeData.event;

    getTreeItem(node: GltfNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let treeState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None;
        if (node.children.length > 0) {
            treeState = !this.selectedList.has(node) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
        }

        let name = node.name;
        if (node.size !== undefined) {
            if (node.size < 1024) {
                name += ` ${node.size}B`;
            } else if (node.size > 1024 && node.size < (1024 * 1024)) {
                name += sprintf(' %0.1fKB', node.size / 1024);
            } else {
                name += sprintf(' %0.1fMB', node.size / (1024 * 1024));
            }
        }
        let treeItem: vscode.TreeItem = new vscode.TreeItem(name, treeState);
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
            this.tryParseTreeAndNotify();
        });
        vscode.window.onDidChangeTextEditorSelection(e => {
            this.fillSelectedList();
            if (!this.pauseUpdate && vscode.workspace.getConfiguration('glTF').get('expandOutlineWithSelection')) {
                this._onDidChangeTreeData.fire();
            }
            this.pauseUpdate = false;
        });
        vscode.workspace.onDidChangeTextDocument(e => {
            this.tryParseTreeAndNotify();
        });

        this.tryParseTreeAndNotify();
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
        vscode.commands.executeCommand('setContext', 'gltfFileActive', false);

        this.editor = vscode.window.activeTextEditor;
        if (this.editor && this.editor.document && this.editor.document.languageId === 'json') {
            let mapResult = jsonMap.parse(this.editor.document.getText());
            this.gltf = mapResult.data;
            this.pointers = mapResult.pointers;
            if (this.gltf && this.gltf.asset && this.gltf.asset.version) {
                vscode.commands.executeCommand('setContext', 'gltfFileActive', true);
                if (this.gltf.asset.version[0] !== '2') {
                    this.gltf = null;
                }
            } else {
                this.gltf = null;
            }
        }

        if (!this.gltf) {
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

        if (this.gltf) {
            this.createAsset(this.tree);

            if (this.gltf.scenes) {
                for (let sceneIndex = 0; sceneIndex < this.gltf.scenes.length; sceneIndex++) {
                    let scene = this.gltf.scenes[sceneIndex];
                    this.createScene(scene, sceneIndex, this.tree);
                }
            }
        }

        this.fillSelectedList();
    }

    private tryParseTreeAndNotify() {
        try {
            this.parseTree();
        } catch (ex) {
            this.tree = null;
            this.gltf = null;
            this.pointers = null;
            console.log("Can't parse glTF into tree: " + ex.toString());
        }
        this._onDidChangeTreeData.fire();
    }

    private populateSkinMap(skinIndex: number, skin: any) {
        if (!this.skeletonMap.has(skin.skeleton)) {
            this.skeletonMap.set(skin.skeleton, new Set<string>());
        }
        this.skeletonMap.get(skin.skeleton).add(skinIndex.toString());
        for (let joint of skin.joints) {
            if (!this.skinMap.has(joint)) {
                this.skinMap.set(joint, new Set<string>());
            }
            this.skinMap.get(joint).add(skinIndex.toString());
        }
    }

    private formatVertices(vertices: number): string {
        if (vertices < 1000) {
            return vertices.toString();
        } else {
            return sprintf('%0.1fK', vertices / 1000);
        }
    }

    private createAsset(parent: GltfNode): void {
        let assetPointer = this.pointers[''];
        let assetObj: GltfNode = {
            name: 'Asset',
            children: [],
            type: 'node',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(assetPointer.value.pos), this.editor.document.positionAt(assetPointer.valueEnd.pos))
        };
        parent.children.push(assetObj);

        let totalSize = this.editor.document.getText().length;
        if (this.gltf.buffers && this.gltf.buffers.length > 0) {
            for (let buffer of this.gltf.buffers) {
                totalSize += buffer.byteLength;
            }
        }

        if (this.gltf.meshes && this.gltf.meshes.length > 0) {
            let meshesPointer = this.pointers['/meshes'];
            let meshesObj: GltfNode = {
                name: 'Meshes',
                children: [],
                type: 'node',
                parent: assetPointer,
                size: 0,
                range: new vscode.Range(this.editor.document.positionAt(meshesPointer.value.pos), this.editor.document.positionAt(meshesPointer.valueEnd.pos))
            };
            assetObj.children.push(meshesObj);
            let vertices = 0;
            for (let index = 0; index < this.gltf.meshes.length; index++) {
                let sizeInfo = this.createMesh(index.toString(), undefined, meshesObj, true);
                meshesObj.size += sizeInfo.size;
                vertices += sizeInfo.vertices;
            }
            meshesObj.name += ` (${this.formatVertices(vertices)} vertices)`;
        }

        if (this.gltf.animations && this.gltf.animations.length > 0) {
            let animationsPointer = this.pointers['/animations'];
            let animationObj: GltfNode = {
                name: 'Animations',
                children: [],
                type: 'node',
                parent: assetPointer,
                size: 0,
                range: new vscode.Range(this.editor.document.positionAt(animationsPointer.value.pos), this.editor.document.positionAt(animationsPointer.valueEnd.pos))
            };
            assetObj.children.push(animationObj);
            for (let index = 0; index < this.gltf.animations.length; index++) {
                animationObj.size += this.createAnimation(index.toString(), animationObj);
            }
        }

        if (this.gltf.textures && this.gltf.textures.length > 0) {
            let texturePointer = this.pointers['/textures'];
            let textureObj: GltfNode = {
                name: 'Textures',
                children: [],
                type: 'node',
                parent: assetPointer,
                size: 0,
                range: new vscode.Range(this.editor.document.positionAt(texturePointer.value.pos), this.editor.document.positionAt(texturePointer.valueEnd.pos))
            };
            assetObj.children.push(textureObj);
            for (let index = 0; index < this.gltf.textures.length; index++) {
                textureObj.size += this.createTexture('Asset', { index: index.toString() }, textureObj, true);
            }
            totalSize += textureObj.size;
        }

        assetObj.size = totalSize;
        let otherSize = totalSize;
        for (let childObj of assetObj.children) {
            otherSize -= childObj.size;
        }
        let otherObj: GltfNode = {
            name: 'Other',
            children: [],
            type: 'node',
            parent: assetPointer,
            size: otherSize,
            range: new vscode.Range(this.editor.document.positionAt(assetPointer.value.pos), this.editor.document.positionAt(assetPointer.valueEnd.pos))
        };
        assetObj.children.push(otherObj);
    }

    private createAnimation(animationIndex: string, parent: GltfNode): number {
        let animation = this.gltf.animations[animationIndex];
        let pointer = this.pointers['/animations/' + animationIndex];
        let animationObj: GltfNode = {
            name: this.createName('Animation', animationIndex, animation),
            children: [],
            type: 'animation',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(animationObj);

        let channelCount = animation.channels.length;
        let samplerSize: number = 0;
        for (let channel of animation.channels) {
            let sampler = animation.samplers[channel.sampler];
            samplerSize += this.sizeOfAccessor(sampler.input);
            samplerSize += this.sizeOfAccessor(sampler.output);
        }
        animationObj.name += ` (${channelCount} channels)`;
        animationObj.size = samplerSize;

        return samplerSize;
    }

    private sizeOfAccessor(index: string): number {
        let accessor = this.gltf.accessors[index];
        let numComponents = assetInfo.AccessorTypeToNumComponents[accessor.type];
        let sizeOfComponent = assetInfo.ComponentTypeToBytesPerElement[accessor.componentType];

        return numComponents * sizeOfComponent * accessor.count;
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
                this.createNode(node, nodeIndex, sceneObj);
            }
        }
    }

    private createNode(node: any, nodeIndex: string, parent: GltfNode): void {
        let pointer = this.pointers['/nodes/' + nodeIndex];
        let nodeObj: GltfNode = {
            name: this.createName('Node', nodeIndex, node) + this.skinsName(nodeIndex),
            children: [],
            type: this.skeletonMap.has(nodeIndex) ? 'skeleton' : this.skinMap.has(nodeIndex) ? 'skin' : 'node',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(nodeObj);

        if (node.mesh !== undefined) {
            this.createMesh(node.mesh, node.skin, nodeObj, false);
        }
        if (node.children) {
            for (let nodeChildrenIndex = 0; nodeChildrenIndex < node.children.length; nodeChildrenIndex++) {
                let childNodeIndex = node.children[nodeChildrenIndex];
                let childNode = this.gltf.nodes[childNodeIndex];
                this.createNode(childNode, childNodeIndex, nodeObj);
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

    private createMesh(meshIndex: string, skinIndex: string, parent: GltfNode, assetReport: boolean): MeshInfo | undefined {
        let mesh = this.gltf.meshes[meshIndex];
        let name = this.createName('Mesh', meshIndex, mesh);
        if (skinIndex !== undefined) {
            name += ` (Skin ${skinIndex})`;
        }

        let pointer = this.pointers['/meshes/' + meshIndex];
        let meshObj: GltfNode = {
            name: name,
            children: [],
            type: 'mesh',
            parent: parent,
            range: new vscode.Range(this.editor.document.positionAt(pointer.value.pos), this.editor.document.positionAt(pointer.valueEnd.pos))
        };
        parent.children.push(meshObj);

        let meshInfo: MeshInfo = {
            size: 0,
            vertices: 0
        };
        if (mesh.primitives) {
            for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++) {
                let primitiveInfo = this.createMeshPrimitive(mesh, meshIndex, primitiveIndex.toString(), meshObj, assetReport)
                if (assetReport) {
                    meshInfo.size += primitiveInfo.size;
                    meshInfo.vertices += primitiveInfo.vertices;
                }
            }
        }
        if (assetReport) {
            meshObj.size = meshInfo.size;
            meshObj.name += ` (${this.formatVertices(meshInfo.vertices)} vertices)`;
            return meshInfo;
        } else {
            return undefined;
        }
    }

    private createMeshPrimitive(mesh: any, meshIndex: string, primitiveIndex: string, parent: GltfNode, assetReport: boolean): MeshInfo | undefined {
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

        let primitiveInfo: MeshInfo = {
            size: 0,
            vertices: 0
        };
        if (primitive.targets) {
            let morphSize = this.createMorphTargets(primitive, pointerPath, primitiveObj, assetReport);
            if (assetReport) {
                primitiveInfo.size += morphSize;
            }
        }

        if (!assetReport) {
            this.createMaterial(primitive.material, primitiveObj);
            return undefined;
        } else {
            primitiveInfo.size += this.sizeOfAccessor(primitive.indices);
            for (let attribute in primitive.attributes) {
                if (primitive.attributes.hasOwnProperty(attribute)) {
                    primitiveInfo.size += this.sizeOfAccessor(primitive.attributes[attribute]);
                }
            }
            let posAccessor = primitive.attributes.POSITION;
            primitiveInfo.vertices += this.gltf.accessors[posAccessor].count;
            primitiveObj.size = primitiveInfo.size;
            primitiveObj.name += ` (${this.formatVertices(primitiveInfo.vertices)} vertices)`;

            return primitiveInfo;
        }
    }

    private createMorphTargets(primitive: any, pointerPath: string, parent: GltfNode, assetReport: boolean): number | undefined {
        let size = 0;
        for (let morphTargetIndex = 0; morphTargetIndex < primitive.targets.length; morphTargetIndex++) {
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

            if (assetReport) {
                let targetSize = 0;
                let target = primitive.targets[morphTargetIndex];
                for (let attribute in target) {
                    if (target.hasOwnProperty(attribute)) {
                        targetSize += this.sizeOfAccessor(target[attribute]);
                    }
                }
                targetObj.size = targetSize;
                size += targetSize;
            }
        }
        if (assetReport) {
            return size;
        } else {
            return undefined;
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

    private createTexture(typeName: string, textureIndex: any, parent: GltfNode, assetReport: boolean = false): number | undefined {
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

        if (assetReport) {
            let size;
            let image = this.gltf.images[imageIndex];
            if (image.uri !== undefined) {
                if (image.uri.startsWith('data:')) {
                    size = image.uri.length * 0.75;
                } else {
                    const name = decodeURI(Url.resolve(this.editor.document.fileName, image.uri));
                    size = fs.statSync(name).size;
                }
            } else if (image.bufferView !== undefined) {
                size = this.gltf.bufferViews[image.bufferView].byteLength;
            }
            textureObj.size = size;
            return size;
        } else {
            return undefined;
        }
    }

    private createName(typeName: string, index: string, obj: any) {
        let name = `${typeName} ${index}`;
        if (obj && obj.name) {
            name = `${obj.name} (${name})`;
        }

        return name;
    }

    private skinsName(index: string) {
        let set = new Set<string>();
        if (this.skeletonMap.has(index)) {
            let skinIds = this.skeletonMap.get(index);
            for (let skinId of skinIds) {
                set.add(skinId);
            }
        }
        if (this.skinMap.has(index)) {
            let skinIds = this.skinMap.get(index);
            for (let skinId of skinIds) {
                set.add(skinId);
            }
        }
        if (set.size === 0) {
            return '';
        }
        return ` (Skin${set.size == 1 ? '' : 's'} ${Array.from(set.values()).join(', ')})`;
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
