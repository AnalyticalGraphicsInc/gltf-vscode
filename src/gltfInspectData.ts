import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { GltfWindow } from './gltfWindow';
import { GLTF2 } from './GLTF2';
import { getFromJsonPointer, getAccessorData, getAccessorElement, AccessorTypeToNumComponents } from './utilities';
import { sprintf } from 'sprintf-js';
import { GltfPreviewPanel } from './gltfPreview';

enum NodeType {
    Header,
    Group,
    AccessorScalar,
    AccessorVector,
    AccessorMatrix,
    AccessorMatrixRow,
    MatrixRow,
    Vertices,
    Vertex,
    VertexAttribute,
    Triangles,
    Triangle,
    Lines,
    Line,
    Points,
    Point
}

interface Node {
    type: NodeType;
    label: string;
    tooltip?: string;
}

interface GroupNode extends Node {
    startIndex: number;
    endIndex: number;
    nodes: Node[];
}

interface AccessorElementNode extends Node {
    index: number;
}

interface AccessorScalarNode extends AccessorElementNode {
    value: number;
}

interface AccessorVectorNode extends AccessorElementNode {
    values: number[];
}

interface AccessorMatrixNode extends AccessorElementNode {
    rows: AccessorMatrixRowNode[];
}

interface AccessorMatrixRowNode extends AccessorElementNode {
    values: number[];
}

interface VerticesNode extends Node {
    numVertices: number;
    nodes: VertexNode[];
}

interface VertexNode extends Node {
    index: number;
    attributeNodes: VertexAttributeNode[];
}

interface VertexAttributeNode extends Node {
    name: string;
    values: number[];
}

interface TrianglesNode extends Node {
    nodes: TriangleNode[];
}

interface TriangleNode extends Node {
    index: number;
    vertices: [number, number, number];
}

interface LinesNode extends Node {
    nodes: LineNode[];
}

interface LineNode extends Node {
    index: number;
    vertices: [number, number];
}

interface PointsNode extends Node {
    nodes: PointNode[];
}

interface PointNode extends Node {
    index: number;
    vertex: number;
}

function isFloatAccessor(accessor: GLTF2.Accessor): boolean {
    return accessor.componentType === GLTF2.AccessorComponentType.FLOAT || accessor.normalized;
}

function formatScalar(value: number, float: boolean): string {
    return float ? sprintf('%.5f', value) : `${value}`;
}

function formatVector(values: number[], float: boolean): string {
    return `[${values.map(value => formatScalar(value, float)).join(', ')}]`;
}

function formatMatrix(rows: { values: number[] }[], float: boolean): string {
    return rows.map(row => formatVector(row.values, float)).join(', ');
}

function groupNodes(nodes: Node[], groupSize: number): Node[] {
    if (nodes.length < groupSize) {
        return nodes;
    }

    const groupNodes = new Array<GroupNode>();
    for (let startIndex = 0, endIndex = 0; startIndex < nodes.length; startIndex = endIndex) {
        endIndex = Math.min(startIndex + groupSize, nodes.length);
        groupNodes.push({
            type: NodeType.Group,
            label: `[${startIndex}..${endIndex}]`,
            startIndex: startIndex,
            endIndex: endIndex,
            nodes: nodes.slice(startIndex, endIndex)
        });
    }

    return groupNodes;
}

function getAccessorNodes(fileName: string, gltf: GLTF2.GLTF, accessor: GLTF2.Accessor): AccessorElementNode[] {
    const data = getAccessorData(fileName, gltf, accessor);
    if (!data) {
        throw new Error('Unable to get accessor data');
    }

    const nodes = new Array<AccessorElementNode>(accessor.count);
    for (let index = 0; index < nodes.length; index++) {
        nodes[index] = getAccessorElementNode(accessor, data, index);
    }

    return nodes;
}

function getAccessorElementNode(accessor: GLTF2.Accessor, data: ArrayLike<number>, index: number): AccessorElementNode {
    const numComponents = AccessorTypeToNumComponents[accessor.type];
    const values = getAccessorElement(data, index, numComponents, accessor.componentType, accessor.normalized);
    const float = isFloatAccessor(accessor);

    switch (accessor.type) {
        case GLTF2.AccessorType.SCALAR: {
            const label = formatScalar(values[0], float);
            const tooltip = `${index}: ${label}`;
            return {
                type: NodeType.AccessorScalar,
                label: label,
                tooltip: tooltip,
                index: index,
                value: values[0]
            } as AccessorScalarNode;
        }
        case GLTF2.AccessorType.VEC2:
        case GLTF2.AccessorType.VEC3:
        case GLTF2.AccessorType.VEC4: {
            const label = formatVector(values, isFloatAccessor(accessor));
            const tooltip = `${index}: ${label}`;
            return {
                type: NodeType.AccessorVector,
                label: label,
                tooltip: tooltip,
                index: index,
                float: float,
                values: values
            } as AccessorVectorNode;
        }
        case GLTF2.AccessorType.MAT2:
        case GLTF2.AccessorType.MAT3:
        case GLTF2.AccessorType.MAT4: {
            const size = Math.sqrt(numComponents);
            const rows: AccessorMatrixRowNode[] = [];
            for (let rowIndex = 0; rowIndex < size; rowIndex++) {
                const start = rowIndex * size;
                const end = start + size;
                const rowValues = values.slice(start, end);
                const rowLabel = formatVector(rowValues, float);
                const rowTooltip = `${rowIndex}: ${rowLabel}`;
                rows.push({
                    type: NodeType.AccessorMatrixRow,
                    label: rowLabel,
                    tooltip: rowTooltip,
                    index: rowIndex,
                    values: rowValues
                });
            }
            const label = formatMatrix(rows, float);
            const tooltip = `${index}: ${label}`;
            return {
                type: NodeType.AccessorMatrix,
                label: label,
                tooltip: tooltip,
                index: index,
                rows: rows
            } as AccessorMatrixNode;
        }
    }

    throw new Error(`Invalid accessor type: ${accessor.type}`);
}

function getVerticesNode(fileName: string, gltf: GLTF2.GLTF, attributes: { [name: string]: number }): VerticesNode {
    const accessorInfo: {
        [name: string]: {
            data: ArrayLike<number>,
            numComponents: number,
            accessor: any
         }
    } = {};

    let numVertices = 0;

    for (const attribute in attributes) {
        const accessor = gltf.accessors[attributes[attribute]];
        const data = accessor && getAccessorData(fileName, gltf, accessor);
        if (!data) {
            continue;
        }

        if (attribute === "POSITION") {
            numVertices = accessor.count;
        }

        accessorInfo[attribute] = {
            data: data,
            numComponents: AccessorTypeToNumComponents[accessor.type],
            accessor: accessor
        };
    }

    const nodes = new Array<VertexNode>(numVertices);
    for (let index = 0; index < nodes.length; index++) {
        const attributeNodes: VertexAttributeNode[] = [];
        for (const attribute in attributes) {
            const info = accessorInfo[attribute];
            const values = getAccessorElement(info.data, index, info.numComponents, info.accessor.componentType, info.accessor.normalized);
            attributeNodes.push({
                type: NodeType.VertexAttribute,
                label: `${attribute}: ${formatVector(values, isFloatAccessor(info.accessor))}`,
                name: attribute,
                values: values
            });
        }
        nodes[index] = {
            type: NodeType.Vertex,
            label: `${index}`,
            index: index,
            attributeNodes: attributeNodes
        };
    }

    return {
        type: NodeType.Vertices,
        label: 'Vertices',
        numVertices: numVertices,
        nodes: nodes
    };
}

function getTriangleNodes(numVertices: number, mode: GLTF2.MeshPrimitiveMode, data: ArrayLike<number> | undefined): TriangleNode[] {
    const get = data ? (i: number) => data[i] : (i: number) => i;
    const length = data ? data.length : numVertices;
    let nodes: TriangleNode[];

    function setNode(index: number, vertices: [number, number, number]): void {
        nodes[index] = {
            type: NodeType.Triangle,
            label: `${formatVector(vertices, false)}`,
            index: index,
            vertices: vertices
        };
    }

    switch (mode) {
        case GLTF2.MeshPrimitiveMode.TRIANGLES: {
            nodes = new Array(length / 3);
            for (let index = 0; index < nodes.length; index++) {
                setNode(index, [
                    get(index * 3),
                    get(index * 3 + 1),
                    get(index * 3 + 2)
                ]);
            }
            break;
        }
        case GLTF2.MeshPrimitiveMode.TRIANGLE_FAN: {
            nodes = new Array(length - 2);
            for (let index = 0; index < nodes.length; index++) {
                setNode(index, [
                    get(0),
                    get(index + 1),
                    get(index + 2)
                ]);
            }
            break;
        }
        case GLTF2.MeshPrimitiveMode.TRIANGLE_STRIP: {
            nodes = new Array(length - 2);
            for (let index = 0; index < nodes.length; index++) {
                const flip = (index & 1) === 1;
                setNode(index, [
                    get(flip ? index + 2 : index),
                    get(index + 1),
                    get(flip ? index : index + 2)
                ]);
            }
            break;
        }
    }

    return nodes;
}

function getLineNodes(numVertices: number, mode: GLTF2.MeshPrimitiveMode, data: ArrayLike<number> | undefined): LineNode[] {
    const get = data ? i => data[i] : i => i;
    const length = data ? data.length : numVertices;
    let nodes: LineNode[];

    function setNode(index: number, vertices: [number, number]): void {
        nodes[index] = {
            type: NodeType.Line,
            label: `${formatVector(vertices, false)}`,
            index: index,
            vertices: vertices
        };
    }

    switch (mode) {
        case GLTF2.MeshPrimitiveMode.LINES: {
            nodes = new Array(length / 2);
            for (let index = 0; index < nodes.length; index++) {
                setNode(index, [
                    get(index * 2),
                    get(index * 2 + 1)
                ]);
            }
            break;
        }
        case GLTF2.MeshPrimitiveMode.LINE_LOOP:
        case GLTF2.MeshPrimitiveMode.LINE_STRIP: {
            nodes = new Array(mode === GLTF2.MeshPrimitiveMode.LINE_LOOP ? length : length - 1);
            for (let index = 0; index < nodes.length; index++) {
                setNode(index, [
                    get(index),
                    get((index + 1) % length)
                ]);
            }
            break;
        }
    }

    return nodes;
}

function getPointNodes(numVertices: number, data: ArrayLike<number> | undefined): PointNode[] {
    const get = data ? i => data[i] : i => i;
    const nodes = new Array<PointNode>(data ? data.length : numVertices);
    for (let index = 0; index < nodes.length; index++) {
        nodes[index] = {
            type: NodeType.Point,
            label: `${index}`,
            index: index,
            vertex: get(index)
        };
    }

    return nodes;
}

function getIndicesNode(fileName: string, gltf: GLTF2.GLTF, numVertices: number, mode: GLTF2.MeshPrimitiveMode | undefined, indices: number | undefined): TrianglesNode | LinesNode | PointsNode {
    if (mode === undefined) {
        mode = GLTF2.MeshPrimitiveMode.TRIANGLES;
    }

    const accessor = indices !== undefined && gltf.accessors[indices];
    const data = accessor && getAccessorData(fileName, gltf, accessor);
    switch (mode) {
        case GLTF2.MeshPrimitiveMode.TRIANGLES:
        case GLTF2.MeshPrimitiveMode.TRIANGLE_FAN:
        case GLTF2.MeshPrimitiveMode.TRIANGLE_STRIP: {
            return {
                type: NodeType.Triangles,
                label: 'Triangles',
                nodes: getTriangleNodes(numVertices, mode, data)
            } as TrianglesNode;
        }
        case GLTF2.MeshPrimitiveMode.LINES:
        case GLTF2.MeshPrimitiveMode.LINE_LOOP:
        case GLTF2.MeshPrimitiveMode.LINE_STRIP: {
            return {
                type: NodeType.Lines,
                label: 'Lines',
                nodes: getLineNodes(numVertices, mode, data)
            } as LinesNode;
        }
        case GLTF2.MeshPrimitiveMode.POINTS: {
            return {
                type: NodeType.Points,
                label: 'Points',
                nodes: getPointNodes(numVertices, data)
            } as PointsNode;
        }
        default: {
            throw new Error(`Invalid mesh primitive mode (${mode})`);
        }
    }
}

function getIconPath(context: vscode.ExtensionContext, name: string): { light: string, dark: string} {
    return {
        light: context.asAbsolutePath(path.join('resources', 'light', `${name}.svg`)),
        dark: context.asAbsolutePath(path.join('resources', 'dark', `${name}.svg`))
    };
}

export class GltfInspectData implements vscode.TreeDataProvider<Node> {
    private readonly _iconPaths: { [nodeType: number]: { light: string, dark: string } } = {};
    private _gltfWindow: GltfWindow;
    private _treeView: vscode.TreeView<Node>;
    private _fileName: string;
    private _jsonPointer: string;
    private _headerNode: Node;
    private _nodes: Node[];
    private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();

    constructor(context: vscode.ExtensionContext, gltfWindow: GltfWindow) {
        this._iconPaths[NodeType.Header] = getIconPath(context, 'inspect');

        this._gltfWindow = gltfWindow;

        this._gltfWindow.onDidChangeActiveTextEditor(() => {
            this.reset();
        });

        this._gltfWindow.preview.onDidChangeActivePanel(panel => {
            if (panel && panel.ready) {
                this.updateSelection(panel, this._treeView.selection);
            }
        });

        this._gltfWindow.preview.onDidChangeReadyState(panel => {
            this.updateSelection(panel, this._treeView.selection);
        });

        context.subscriptions.push(vscode.commands.registerCommand('gltfInspectData.copy', (node: Node) => {
            vscode.env.clipboard.writeText(node.label);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('gltfInspectData.copyAll', () => {
            let text = `${this._headerNode.label}${os.EOL}`;

            const traverseNodes = (nodes: Node[], indent: string) => {
                for (const node of nodes) {
                    text += `${indent}${node.label}${os.EOL}`;
                    traverseNodes(this.getChildren(node, Number.MAX_VALUE), `  ${indent}`);
                }
            };

            traverseNodes(this._nodes, '');

            vscode.env.clipboard.writeText(text);
        }));
    }

    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    public getTreeItem(node: Node): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(node.label);
        treeItem.tooltip = node.tooltip;
        treeItem.iconPath = this._iconPaths[node.type];

        if (this.getChildren(node).length !== 0) {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        if (node.type === NodeType.Vertex) {
            // Add a noop command to stop the item from expanding when clicking on the item label.
            // See https://github.com/Microsoft/vscode/issues/34130#issuecomment-398783006.
            // The actual handling of selection is in onDidSelectionChange to support multiselect.
            treeItem.command = { title: '', command: 'gltf.noop' };
        }

        return treeItem;
    }

    public getParent(node: Node): undefined {
        return undefined;
    }

    public getChildren(node?: Node, groupSize = 100): Node[] {
        if (!node) {
            return this._headerNode ? [this._headerNode, ...groupNodes(this._nodes, groupSize)] : [];
        }

        switch (node.type) {
            case NodeType.Group: {
                const groupNode = node as GroupNode;
                return groupNode.nodes;
            }
            case NodeType.AccessorMatrix: {
                const accessorMatrixNode = node as AccessorMatrixNode;
                return accessorMatrixNode.rows;
            }
            case NodeType.Vertices: {
                const verticesNode = node as VerticesNode;
                return groupNodes(verticesNode.nodes, groupSize);
            }
            case NodeType.Vertex: {
                const vertexNode = node as VertexNode;
                return vertexNode.attributeNodes;
            }
            case NodeType.Triangles: {
                const trianglesNode = node as TrianglesNode;
                return groupNodes(trianglesNode.nodes, groupSize);
            }
            case NodeType.Lines: {
                const linesNode = node as LinesNode;
                return groupNodes(linesNode.nodes, groupSize);
            }
            case NodeType.Points: {
                const pointsNode = node as PointsNode;
                return groupNodes(pointsNode.nodes, groupSize);
            }
        }

        return [];
    }

    public setTreeView(treeView: vscode.TreeView<Node>): void {
        this._treeView = treeView;
        this._treeView.onDidChangeSelection(e => this.onDidSelectionChange(e));
    }

    public showAccessor(fileName: string, gltf: GLTF2.GLTF, jsonPointer: string): void {
        this.reset();

        this._fileName = fileName;
        this._jsonPointer = jsonPointer;

        const accessor = getFromJsonPointer(gltf, jsonPointer) as GLTF2.Accessor;

        this._headerNode = {
            type: NodeType.Header,
            label: this._jsonPointer
        };

        this._nodes = getAccessorNodes(fileName, gltf, accessor);
        this._onDidChangeTreeData.fire(undefined);
        this._treeView.reveal(this._headerNode, { select: false, focus: true });
    }

    public showMeshPrimitive(fileName: string, gltf: GLTF2.GLTF, jsonPointer: string): void {
        this.reset();

        this._fileName = fileName;
        this._jsonPointer = jsonPointer;

        const meshPrimitive = getFromJsonPointer(gltf, jsonPointer) as GLTF2.MeshPrimitive;

        this._headerNode = {
            type: NodeType.Header,
            label: this._jsonPointer
        };

        const verticesNode = getVerticesNode(this._fileName, gltf, meshPrimitive.attributes);
        const indicesNode = getIndicesNode(this._fileName, gltf, verticesNode.numVertices, meshPrimitive.mode, meshPrimitive.indices);
        this._nodes = [verticesNode, indicesNode];
        this._onDidChangeTreeData.fire(undefined);
        this._treeView.reveal(this._headerNode, { select: false, focus: true });
    }

    private reset(): void {
        delete this._fileName;
        delete this._jsonPointer;
        delete this._headerNode;
        delete this._nodes;
        this._onDidChangeTreeData.fire(undefined);
    }

    private updateSelection(panel: GltfPreviewPanel, selection: Node[]): void {
        const vertices = selection.filter(node => node.type === NodeType.Vertex).map((node: VertexNode) => node.index);

        const triangles = selection.filter(node => node.type === NodeType.Triangle).map((node: TriangleNode) => ({ index: node.index, vertices: node.vertices }));
        const lines = selection.filter(node => node.type === NodeType.Line).map((node: LineNode) => ({ index: node.index, vertices: node.vertices }));
        const points = selection.filter(node => node.type === NodeType.Point).map((node: PointNode) => ({ index: node.index, vertices: [node.index] }));
        const trianglesLinesPoints = [...triangles, ...lines, ...points];

        panel.webview.postMessage({ command: 'select', jsonPointer: this._jsonPointer, vertices: vertices, trianglesLinesPoints: trianglesLinesPoints });
    }

    private onDidSelectionChange(e: vscode.TreeViewSelectionChangeEvent<Node>): void {
        const panel = this._gltfWindow.preview.getPanel(this._fileName);
        if (panel) {
            this.updateSelection(panel, e.selection);
        }
    }
}
