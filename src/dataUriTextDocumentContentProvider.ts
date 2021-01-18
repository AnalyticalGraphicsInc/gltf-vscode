import * as vscode from 'vscode';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import * as querystring from 'querystring';
import * as draco3dgltf from 'draco3dgltf';
import { getBuffer } from 'gltf-import-export';
import { sprintf } from 'sprintf-js';
import { getFromJsonPointer, btoa, atob, getAccessorData, AccessorTypeToNumComponents, getAccessorElement } from './utilities';
import { GLTF2 } from './GLTF2';

let decoderModule;
draco3dgltf.createDecoderModule({}).then(function(module) {
    decoderModule = module;
});

interface QueryDataUri {
    viewColumn?: string;
    previewHtml?: string;
}

export class DataUriTextDocumentContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _context: vscode.ExtensionContext;

    public UriPrefix = 'gltf-dataUri:';

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public uriIfNotDataUri(glTF: any, jsonPointer: string): string {
        const data = getFromJsonPointer(glTF, jsonPointer);
        if ((typeof data === 'object') && data.hasOwnProperty('uri')) {
            const uri: string = data.uri;
            if (!uri.startsWith('data:')) {
                return uri;
            }
        }
        return null;
    }

    public isImage(jsonPointer: string): boolean {
        return jsonPointer.startsWith('/images/');
    }

    public isShader(jsonPointer: string): boolean {
        return jsonPointer.startsWith('/shaders/');
    }

    public isAccessor(jsonPointer: string): boolean {
        return jsonPointer.startsWith('/accessors/');
    }

    public isMeshPrimitive(jsonPointer: string): boolean {
        return !!jsonPointer.match(/^\/meshes\/\d+\/primitives\//);
    }

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const fileName = decodeURIComponent(uri.fragment);
        const query = querystring.parse(uri.query);
        query.viewColumn = query.viewColumn || vscode.ViewColumn.Active.toString();
        let glTFContent: string;
        const document = vscode.workspace.textDocuments.find(e => e.uri.scheme === 'file' && e.fileName === fileName);
        if (document) {
            glTFContent = document.getText();
        } else {
            glTFContent = fs.readFileSync(fileName, 'utf-8');
        }
        const glTF = JSON.parse(glTFContent) as GLTF2.GLTF;
        let jsonPointer = uri.path;
        if (this.isShader(jsonPointer) && jsonPointer.endsWith('.glsl')) {
            jsonPointer = jsonPointer.substring(0, jsonPointer.length - 5);
        }
        const data = getFromJsonPointer(glTF, jsonPointer);

        if (data && (typeof data === 'object')) {
            if (data.hasOwnProperty('uri')) {
                let dataUri: string = data.uri;
                let previewTitle = dataUri;
                if (!dataUri.startsWith('data:')) {
                    // Not a DataURI: Look up external reference.
                    const name = decodeURI(Url.resolve(fileName, dataUri));
                    const contents = fs.readFileSync(name);
                    dataUri = 'data:image;base64,' + btoa(contents);
                    previewTitle = decodeURI(previewTitle);
                } else {
                    previewTitle = jsonPointer;
                }

                if (this.isImage(jsonPointer)) {
                    // Peek Definition requests have a document that matches the current document
                    // Go to Definition has an undefined activeTextEditor
                    // Inspect Data Uri has a document that matches current but we provide a non-default viewColumn
                    // In the last two cases we want to close the current (to be empty editor), for Peek we leave it open.
                    if (vscode.window.activeTextEditor === undefined || vscode.window.activeTextEditor.document !== document || query.viewColumn !== vscode.ViewColumn.Active.toString()) {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    }

                    let localResourceRoots = [
                        vscode.Uri.file(this._context.extensionPath)
                    ];

                    if (document) {
                        localResourceRoots.push(vscode.Uri.file(path.dirname(document.fileName)));
                    }

                    let panel = vscode.window.createWebviewPanel('gltf.imagePreview', previewTitle, vscode.ViewColumn.Two, {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: localResourceRoots,
                    });

                    const cssUri = panel.webview.asWebviewUri(
                        vscode.Uri.file(this._context.asAbsolutePath('pages/imagePreview.css'))).toString();

                    panel.webview.html = `<html><head><link rel="stylesheet" href="${cssUri}"></link></head>` +
                        `<body><div class="monaco-resource-viewer image oversized" ` +
                        `onclick="this.classList.toggle(\'full-size\');" ><img src="${dataUri}" /></div></body></html>`;

                    panel.reveal(vscode.ViewColumn.Two);
                    return 'See image viewer window.';
                }
                const posBase = dataUri.indexOf('base64,');
                const body = dataUri.substring(posBase + 7);
                return atob(body);
            } else if (this.isAccessor(jsonPointer)) {
                return this.formatAccessor(fileName, glTF, data);
            }
        } else if (jsonPointer.includes('KHR_draco_mesh_compression')) {
            return this.formatDraco(glTF, jsonPointer, fileName);
        }

        return 'Unknown:\n' + jsonPointer;
    }

    private formatAccessor(fileName: string, glTF: GLTF2.GLTF, accessor: GLTF2.Accessor): string {
        const data = getAccessorData(fileName, glTF, accessor);
        if (!data) {
            return 'Accessor does not contain a bufferView';
        }

        let result = '';
        const numComponents = AccessorTypeToNumComponents[accessor.type];
        for (let index = 0; index < accessor.count; index++) {
            const values = getAccessorElement(data, index, numComponents, accessor.componentType, accessor.normalized);
            const format = (accessor.componentType === GLTF2.AccessorComponentType.FLOAT || accessor.normalized) ? '%11.5f' : '%5d';
            if (accessor.type.startsWith('MAT')) {
                const size = Math.sqrt(numComponents);
                for (let rowIndex = 0; rowIndex < size; rowIndex++) {
                    const start = rowIndex * size;
                    const end = start + size;
                    result += values.slice(start, end).map(value => sprintf(format, value)).join('') + '\n';
                }
                result += '\n';
            } else {
                result += values.map(value => sprintf(format, value)).join('') + '\n';
            }
        }

        return result;
    }

    private formatDraco(glTF: GLTF2.GLTF, jsonPointer: string, fileName: string): string {
        const attrIndex = jsonPointer.lastIndexOf('/');
        if (attrIndex === -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        let attrName = jsonPointer.substr(attrIndex + 1);
        const dracoIndex = jsonPointer.lastIndexOf('/', attrIndex - 1);
        if (dracoIndex === -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        const extIndex = jsonPointer.lastIndexOf('/', dracoIndex - 1);
        if (extIndex === -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        const primitiveIndex = jsonPointer.lastIndexOf('/', extIndex - 1);
        if (primitiveIndex === -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        if (!decoderModule) {
            return 'Error: Draco module not loaded.';
        }
        const primitivePointer = jsonPointer.substring(0, primitiveIndex);
        const primitive = getFromJsonPointer(glTF, primitivePointer);
        const dracoExtension = primitive.extensions['KHR_draco_mesh_compression'];

        let accessor: GLTF2.Accessor;
        if (attrName !== 'indices') {
            accessor = glTF.accessors[primitive.attributes[attrName]];
        }

        let bufferView = glTF.bufferViews[dracoExtension.bufferView];
        let glTFBuffer = getBuffer(glTF, bufferView.buffer, fileName);
        const bufferOffset: number = bufferView.byteOffset || 0;
        const bufferLength: number = bufferView.byteLength;
        const bufferViewBuf: Buffer = glTFBuffer.slice(bufferOffset, bufferOffset + bufferLength);

        const decoder = new decoderModule.Decoder();
        const dracoBuffer = new decoderModule.DecoderBuffer();
        let dracoGeometry;
        let dracoMeshData;
        let faceIndices;

        try {
            dracoBuffer.Init(new Int8Array(bufferViewBuf), bufferViewBuf.byteLength);
            const geometryType = decoder.GetEncodedGeometryType(dracoBuffer);

            let status;
            switch (geometryType) {
                case decoderModule.TRIANGULAR_MESH:
                    dracoGeometry = new decoderModule.Mesh();
                    status = decoder.DecodeBufferToMesh(dracoBuffer, dracoGeometry);
                    break;
                case decoderModule.POINT_CLOUD:
                    if (attrName === 'indices') {
                        return "Indices only valid for TRIANGULAR_MESH geometry.";
                    }
                    dracoGeometry = new decoderModule.PointCloud();
                    status = decoder.DecodeBufferToPointCloud(dracoBuffer, dracoGeometry);
                    break;
                default:
                    return `Invalid geometry type ${geometryType}`;
            }

            if (!status.ok() || !dracoGeometry.ptr) {
                return status.error_msg();
            }

            let result = '';
            if (attrName === 'indices') {
                const faceIndices = new decoderModule.DracoInt32Array();
                for (let i = 0; i < dracoGeometry.num_faces(); i++) {
                    decoder.GetFaceFromMesh(dracoGeometry, i, faceIndices);
                    result += sprintf('%5d\n%5d\n%5d\n', faceIndices.GetValue(0), faceIndices.GetValue(1), faceIndices.GetValue(2));
                }
            } else {
                const attributeId = getFromJsonPointer(glTF, jsonPointer);
                const attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeId);
                dracoMeshData = new decoderModule.DracoFloat32Array();
                decoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, dracoMeshData);
                const numPoints = dracoGeometry.num_points();
                const numComponents = attribute.num_components();
                for (let i = 0; i < (numPoints * numComponents); i++) {
                    const value = dracoMeshData.GetValue(i);
                    if (i % numComponents === 0 && i !== 0) {
                        result += '\n';
                    }
                    if (accessor.componentType === GLTF2.AccessorComponentType.FLOAT) {
                        result += sprintf('%11.5f', value) + ' ';
                    } else {
                        result += sprintf('%5d', value) + ' ';
                    }
                }
            }
            return result;
        } finally {
            if (faceIndices) {
                decoderModule.destroy(faceIndices);
            }
            if (dracoMeshData) {
                decoderModule.destroy(dracoMeshData);
            }
            if (dracoGeometry) {
                decoderModule.destroy(dracoGeometry);
            }
            decoderModule.destroy(dracoBuffer);
            decoderModule.destroy(decoder);
        }
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri): void {
        this._onDidChange.fire(uri);
    }
}
