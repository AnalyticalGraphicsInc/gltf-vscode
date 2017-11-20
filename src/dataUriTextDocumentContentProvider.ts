'use strict';
import * as vscode from 'vscode';
import * as Url from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as querystring from 'querystring';
import { getBuffer } from './exportProvider';
let sprintf = require("sprintf-js").sprintf;
import { ExtensionContext, TextDocumentContentProvider, EventEmitter, Event, Uri, ViewColumn } from 'vscode';

export function atob(str): string {
    return Buffer.from(str, 'base64').toString('binary');
}

export function btoa(str): string {
    return Buffer.from(str, 'binary').toString('base64');
}

export function getFromJsonPointer(glTF, jsonPointer : string) {
    const jsonPointerSplit = jsonPointer.split('/');
    const numPointerSegments = jsonPointerSplit.length;
    let result = glTF;
    const firstValidIndex = 1; // Because the path has a leading slash.
    for (let i = firstValidIndex; i < numPointerSegments; ++i) {
        result = result[jsonPointerSplit[i]];
    }
    return result;
}

const gltfMimeTypes = {
    'image/png' : ['png'],
    'image/jpeg' : ['jpg', 'jpeg'],
    'image/vnd-ms.dds' : ['dds'],
    'text/plain' : ['glsl', 'vert', 'vs', 'frag', 'fs', 'txt']
};

enum ComponentType {
    BYTE = 5120,
    UNSIGNED_BYTE = 5121,
    SHORT = 5122,
    UNSIGNED_SHORT = 5123,
    UNSIGNED_INT = 5125,
    FLOAT = 5126
};

const ComponentTypeToBytesPerElement = {
    5120: Int8Array.BYTES_PER_ELEMENT,
    5121: Uint8Array.BYTES_PER_ELEMENT,
    5122: Int16Array.BYTES_PER_ELEMENT,
    5123: Uint16Array.BYTES_PER_ELEMENT,
    5125: Uint32Array.BYTES_PER_ELEMENT,
    5126: Float32Array.BYTES_PER_ELEMENT
};

enum AccessorType {
    'SCALAR',
    'VEC2',
    'VEC3',
    'VEC4',
    'MAT2',
    'MAT3',
    'MAT4'
};

const AccessorTypeToNumComponents = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
};

const MatrixSquare = {
    MAT2: 2,
    MAT3: 3,
    MAT4: 4
}

export function guessFileExtension(mimeType) {
    if (gltfMimeTypes.hasOwnProperty(mimeType)) {
        return '.' + gltfMimeTypes[mimeType][0];
    }
    return '.bin';
}

export function guessMimeType(filename : string): string {
    for (const mimeType in gltfMimeTypes) {
        for (const extensionIndex in gltfMimeTypes[mimeType]) {
            const extension = gltfMimeTypes[mimeType][extensionIndex];
            if (filename.toLowerCase().endsWith('.' + extension)) {
                return mimeType;
            }
        }
    }
    return 'application/octet-stream';
}

interface QueryDataUri {
    viewColumn?: string,
    previewHtml?: string,
}

export class DataUriTextDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;

    public UriPrefix = 'gltf-dataUri://';

    constructor(context: ExtensionContext) {
        this._context = context;
    }

    public uriIfNotDataUri(glTF, jsonPointer : string) : string {
        const data = getFromJsonPointer(glTF, jsonPointer);
        if ((typeof data === 'object') && data.hasOwnProperty('uri')) {
            const uri : string = data.uri;
            if (!uri.startsWith('data:')) {
                return uri;
            }
        }
        return null;
    }

    public isImage(jsonPointer : string) : boolean {
        return jsonPointer.startsWith('/images/');
    }

    public isShader(jsonPointer: string) : boolean {
        return jsonPointer.startsWith('/shaders/');
    }

    public async provideTextDocumentContent(uri: Uri): Promise<string> {
        const filename = decodeURIComponent(uri.authority);
        const query = querystring.parse<QueryDataUri>(uri.query);
        query.viewColumn = query.viewColumn || ViewColumn.Active.toString();
        const document = vscode.workspace.textDocuments.find(e => e.fileName.toLowerCase() === filename.toLowerCase());
        if (!document) {
            return 'ERROR: Can no longer find document in editor: ' + filename;
        }
        const glTF = JSON.parse(document.getText());
        let jsonPointer = uri.path;
        if (this.isShader(jsonPointer) && jsonPointer.endsWith('.glsl')) {
            jsonPointer = jsonPointer.substring(0, jsonPointer.length - 5);
        }
        const data = getFromJsonPointer(glTF, jsonPointer);

        if (data && (typeof data === 'object')) {
            if (data.hasOwnProperty('uri')) {
                let dataUri : string = data.uri;
                if (!dataUri.startsWith('data:')) {
                    // Not a DataURI: Look up external reference.
                    const name = Url.resolve(document.fileName, dataUri);
                    const contents = fs.readFileSync(name);
                    dataUri = 'data:image;base64,' + btoa(contents);
                }

                if (jsonPointer.startsWith('/images/')) {
                    if (!query.previewHtml || query.previewHtml !== 'true') {
                        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        let previewUri: Uri = Uri.parse(this.UriPrefix + uri.authority + uri.path + '?previewHtml=true');
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
                let bufferView = glTF.bufferViews[data.bufferView];
                let buffer = getBuffer(glTF, bufferView.buffer, document.fileName);
                return this.formatAccessor(buffer, data, bufferView);
            }
        }

        return 'Unknown:\n' + jsonPointer;
    }

    private buildArrayBuffer(arrayType: any, data: Buffer, byteOffset: number, count: number, numComponents: number, byteStride?: number): any {
        byteOffset += data.byteOffset;
        const targetLength = count * numComponents;

        if (byteStride == null || byteStride === numComponents * arrayType.BYTES_PER_ELEMENT) {
            return new arrayType(data.buffer, byteOffset, targetLength);
        }

        const elementStride = byteStride / arrayType.BYTES_PER_ELEMENT;
        const sourceBuffer = new arrayType(data.buffer, byteOffset, elementStride * count);
        const targetBuffer = new arrayType(targetLength);
        let sourceIndex = 0;
        let targetIndex = 0;

        while (targetIndex < targetLength) {
            for (let componentIndex = 0; componentIndex < numComponents; componentIndex++) {
                targetBuffer[targetIndex] = sourceBuffer[sourceIndex + componentIndex];
                targetIndex++;
            }

            sourceIndex += elementStride;
        }

        return targetBuffer;
    }

    private formatAccessor(buffer: Buffer, accessor: any, bufferView: any, normalizeOverride?: boolean): string {
        const bufferOffset: number = bufferView.byteOffset || 0;
        const bufferLength: number = bufferView.byteLength;
        const bufferStride: number = bufferView.byteStride;
        const bufferViewBuf: Buffer = buffer.slice(bufferOffset, bufferOffset + bufferLength);
        const accessorByteOffset: number = accessor.byteOffset || 0;
        let normalize: boolean = accessor.normalized === undefined ? (normalizeOverride == undefined ? false : normalizeOverride) : accessor.normalized;

        let result: string = '';
        function formatNumber(value: number, index: number, array: any) {
            if (index % AccessorTypeToNumComponents[accessor.type] == 0 && index !== 0) {
                result += '\n';
            }
            if (accessor.type.startsWith('MAT') && index !== 0 && index % MatrixSquare[accessor.type] == 0) {
                result += '\n';
            }

            if (normalize) {
                switch (parseInt(accessor.componentType)) {
                    case ComponentType.BYTE:
                    value = Math.max(value / 127.0, -1.0);
                    break;
                    case ComponentType.UNSIGNED_BYTE:
                    value = value / 255.0;
                    break;
                    case ComponentType.SHORT:
                    value = Math.max(value / 32767.0, -1.0);
                    break;
                    case ComponentType.UNSIGNED_SHORT:
                    value = value / 65535.0;
                    break;
                }
                result += sprintf('%11.5f', value) + ' ';
            } else {
                result += sprintf('%5d', value) + ' ';
            }
        }

        switch (parseInt(accessor.componentType)) {
            case ComponentType.BYTE:
                const int8Array = this.buildArrayBuffer(Int8Array, bufferViewBuf, bufferOffset + accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
                int8Array.forEach(formatNumber);
            break;

            case ComponentType.UNSIGNED_BYTE:
                const uint8Array = this.buildArrayBuffer(Uint8Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
                uint8Array.forEach(formatNumber);
            break;

            case ComponentType.SHORT:
                const int16Array = this.buildArrayBuffer(Int16Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
                int16Array.forEach(formatNumber);
            break;

            case ComponentType.UNSIGNED_SHORT:
                const uint16Array = this.buildArrayBuffer(Int16Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
                uint16Array.forEach(formatNumber);
            break;

            case ComponentType.UNSIGNED_INT:
                const uint32Array = this.buildArrayBuffer(Uint32Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
                uint32Array.forEach(formatNumber);
            break;

            case ComponentType.FLOAT:
                normalize = true;
                const floatArray = this.buildArrayBuffer(Float32Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
                floatArray.forEach(formatNumber);
            break;
        }

        return result;
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}
