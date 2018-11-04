import * as vscode from 'vscode';
import * as Url from 'url';
import * as fs from 'fs';
import * as querystring from 'querystring';
import * as draco3dgltf from 'draco3dgltf';
import { getBuffer } from 'gltf-import-export';
import { sprintf } from 'sprintf-js';
import { getFromJsonPointer, btoa, atob, AccessorTypeToNumComponents, getAccessorData } from './utilities';
import { GLTF2 } from './GLTF2';
const decoderModule = draco3dgltf.createDecoderModule({});

const MatrixSquare = {
    MAT2: 2,
    MAT3: 3,
    MAT4: 4
}

interface QueryDataUri {
    viewColumn?: string,
    previewHtml?: string,
}

export class DataUriTextDocumentContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _context: vscode.ExtensionContext;

    public UriPrefix = 'gltf-dataUri:';

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public uriIfNotDataUri(glTF, jsonPointer: string): string {
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

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const fileName = decodeURIComponent(uri.fragment);
        const query = querystring.parse<QueryDataUri>(uri.query);
        query.viewColumn = query.viewColumn || vscode.ViewColumn.Active.toString();
        let glTFContent: string;
        const document = vscode.workspace.textDocuments.find(e => e.uri.scheme === 'file' && e.fileName === fileName);
        if (document) {
            glTFContent = document.getText();
        } else {
            glTFContent = fs.readFileSync(fileName, 'UTF-8');
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
                if (!dataUri.startsWith('data:')) {
                    // Not a DataURI: Look up external reference.
                    const name = decodeURI(Url.resolve(fileName, dataUri));
                    const contents = fs.readFileSync(name);
                    dataUri = 'data:image;base64,' + btoa(contents);
                }

                if (jsonPointer.startsWith('/images/')) {
                    if (!query.previewHtml || query.previewHtml !== 'true') {
                        // Peek Definition requests have a document that matches the current document
                        // Go to Definition has a null activeTextEditor
                        // Inspect Data Uri has a document that matches current but we provide a non-default viewColumn
                        // In the last two cases we want to close the current (to be empty editor), for Peek we leave it open.
                        if (vscode.window.activeTextEditor == null || vscode.window.activeTextEditor.document != document || query.viewColumn != vscode.ViewColumn.Active.toString()) {
                            vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        }
                        const previewUri: vscode.Uri = vscode.Uri.parse(this.UriPrefix + uri.path + '?previewHtml=true' + '#' + encodeURIComponent(fileName));
                        await vscode.commands.executeCommand('vscode.previewHtml', previewUri, parseInt(query.viewColumn));
                        return '';
                    } else {
                        return `<html><head><link rel="stylesheet" href="file:///${this._context.asAbsolutePath('pages/imagePreview.css')}"></link></head>` +
                            `<body><div class="monaco-resource-viewer image oversized" onclick="this.classList.toggle(\'full-size\');" ><img src="${dataUri}" /></div></body></html>`;
                    }
                } else {
                    const posBase = dataUri.indexOf('base64,');
                    const body = dataUri.substring(posBase + 7);
                    return atob(body);
                }
            } else if (jsonPointer.startsWith('/accessors/')) {
                if (data.bufferView !== undefined) {
                    let bufferView = glTF.bufferViews[data.bufferView];
                    let buffer = getBuffer(glTF, bufferView.buffer.toString(), fileName);
                    return formatAccessor(buffer, data, bufferView);
                } else {
                    return 'Accessor does not contain a bufferView';
                }
            }
        } else if (jsonPointer.includes('KHR_draco_mesh_compression')) {
            return this.formatDraco(glTF, jsonPointer, fileName);
        }

        return 'Unknown:\n' + jsonPointer;
    }

    private formatDraco(glTF: GLTF2.GLTF, jsonPointer: string, fileName: string): string {
        const attrIndex = jsonPointer.lastIndexOf('/');
        if (attrIndex == -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        let attrName = jsonPointer.substr(attrIndex + 1);
        const dracoIndex = jsonPointer.lastIndexOf('/', attrIndex - 1);
        if (dracoIndex == -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        const extIndex = jsonPointer.lastIndexOf('/', dracoIndex - 1);
        if (extIndex == -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        const primitiveIndex = jsonPointer.lastIndexOf('/', extIndex - 1);
        if (primitiveIndex == -1) {
            return 'Invalid path:\n' + jsonPointer;
        }
        const primitivePointer = jsonPointer.substring(0, primitiveIndex);
        const primitive = getFromJsonPointer(glTF, primitivePointer);
        const dracoExtension = primitive.extensions['KHR_draco_mesh_compression'];

        let accessor: GLTF2.Accessor;
        if (attrName !== 'indices') {
            accessor = glTF.accessors[primitive.attributes[attrName]];
        }

        let bufferView = glTF.bufferViews[dracoExtension.bufferView];
        let glTFBuffer = getBuffer(glTF, bufferView.buffer.toString(), fileName);
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

            let result: string = '';
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
                    if (i % numComponents == 0 && i !== 0) {
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

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }
}

function formatAccessor(buffer: Buffer, accessor: GLTF2.Accessor, bufferView: GLTF2.BufferView, normalizeOverride?: boolean): string {
    let normalize: boolean = accessor.normalized === undefined ? (normalizeOverride == undefined ? (accessor.componentType == GLTF2.AccessorComponentType.FLOAT) : normalizeOverride) : accessor.normalized;

    let result: string = '';
    function formatNumber(value: number, index: number, array: any) {
        if (index % AccessorTypeToNumComponents[accessor.type] == 0 && index !== 0) {
            result += '\n';
        }
        if (accessor.type.startsWith('MAT') && index !== 0 && index % MatrixSquare[accessor.type] == 0) {
            result += '\n';
        }

        if (normalize) {
            switch (accessor.componentType) {
                case GLTF2.AccessorComponentType.BYTE:
                    value = Math.max(value / 127.0, -1.0);
                    break;
                case GLTF2.AccessorComponentType.UNSIGNED_BYTE:
                    value = value / 255.0;
                    break;
                case GLTF2.AccessorComponentType.SHORT:
                    value = Math.max(value / 32767.0, -1.0);
                    break;
                case GLTF2.AccessorComponentType.UNSIGNED_SHORT:
                    value = value / 65535.0;
                    break;
            }
            result += sprintf('%11.5f', value) + ' ';
        } else {
            result += sprintf('%5d', value) + ' ';
        }
    }

    const data = getAccessorData(accessor, bufferView, buffer);
    data.forEach(formatNumber);

    return result;
}
