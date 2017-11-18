'use strict';
import * as vscode from 'vscode';
import * as Url from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getBuffer } from './exportProvider';
let stringHash = require('string-hash');
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

export class DataUriTextDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private _context: ExtensionContext;
    private _tempFiles: Uri[] = [];
    private _tmpPathRoot: string;

    public UriPrefix = 'gltf-dataUri://';

    constructor(context: ExtensionContext) {
        this._context = context;
        this._tmpPathRoot = path.join(os.tmpdir(), 'gltf-vscode');
        try {
            fs.mkdirSync(this._tmpPathRoot);
        } catch (e) {}

        this._context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors((textEditors: vscode.TextEditor[]) => {
            let newTempList: Uri[] = [];
            for (let tempFile of this._tempFiles) {
                let found = false;
                for (let editor of textEditors) {
                    if (editor.document.uri == tempFile) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    try {
                        fs.unlinkSync(tempFile.fsPath);
                    } catch (ex) {
                        console.log(`Couldn't delete ${tempFile.fsPath} because ${ex.toString()}`);
                    }
                } else {
                    newTempList.push(tempFile);
                }
            }
            this._tempFiles = newTempList;
        }));
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
                    const mimeTypePos = dataUri.indexOf(';');
                    let extension;
                    if (mimeTypePos > 0) {
                        let mimeType = dataUri.substring(5, mimeTypePos)
                        extension = guessFileExtension(mimeType);

                        const posBase = dataUri.indexOf('base64,');
                        const body = dataUri.substring(posBase + 7);
                        let hash = stringHash(body);
                        let tmpFilePath = path.join(this._tmpPathRoot, hash.toString(16) + extension);
                        let tempUri = Uri.file(tmpFilePath);

                        let fileExisted = fs.existsSync(tmpFilePath);
                        if (!fileExisted) {
                            fs.writeFileSync(tmpFilePath, atob(body), {encoding: 'binary'});
                        }

                        // We'd like the image to open not using Html Preview but the image directly.
                        let viewColumn = parseInt(uri.query);
                        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        await vscode.commands.executeCommand('vscode.open', tempUri, viewColumn);
                        if (!fileExisted) {
                            this._tempFiles.push(tempUri);
                        }
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

    private formatAccessor(buffer: Buffer, accessor: any, bufferView: any, normalizeOverride?: boolean): string {
        const bufferOffset: number = bufferView.byteOffset === undefined ? 0 : bufferView.byteOffset;
        const bufferLength: number = bufferView.byteLength;
        const bufferStride: number = bufferView.byteStride === undefined ? 4 : bufferView.byteStride;
        const bufferViewBuf: Buffer = buffer.slice(bufferOffset, bufferOffset + bufferLength);
        const accessorByteOffset: number = accessor.byteOffset === undefined ? 0 : accessor.byteOffset;
        const accessorBuf: Buffer = bufferViewBuf.slice(accessorByteOffset, accessor.count * AccessorTypeToNumComponents[accessor.type] * ComponentTypeToBytesPerElement[parseInt(accessor.componentType)]);
        let normalize: boolean = accessor.normalized === undefined ? (normalizeOverride == undefined ? false : normalizeOverride) : accessor.normalized;

        let result: string = '';
        function formatNumber(value: number, index: number, array: any) {
            if (index % AccessorTypeToNumComponents[accessor.type] == 0 && index !== 0) {
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
                const int8Array = new Int8Array(accessorBuf.buffer, accessorBuf.byteOffset, accessorBuf.byteLength / Int8Array.BYTES_PER_ELEMENT);
                int8Array.forEach(formatNumber);
            break;

            case ComponentType.UNSIGNED_BYTE:
                const uint8Array = new Uint8Array(accessorBuf.buffer, accessorBuf.byteOffset, accessorBuf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
                uint8Array.forEach(formatNumber);
            break;

            case ComponentType.SHORT:
                const int16Array = new Int16Array(accessorBuf.buffer, accessorBuf.byteOffset, accessorBuf.byteLength / Int16Array.BYTES_PER_ELEMENT);
                int16Array.forEach(formatNumber);
            break;

            case ComponentType.UNSIGNED_SHORT:
                const uint16Array = new Uint16Array(accessorBuf.buffer, accessorBuf.byteOffset, accessorBuf.byteLength / Uint16Array.BYTES_PER_ELEMENT);
                uint16Array.forEach(formatNumber);
            break;

            case ComponentType.UNSIGNED_INT:
                const uint32Array = new Uint32Array(accessorBuf.buffer, accessorBuf.byteOffset, accessorBuf.byteLength / Uint32Array.BYTES_PER_ELEMENT);
                uint32Array.forEach(formatNumber);
            break;

            case ComponentType.FLOAT:
                normalize = true;
                const floatArray = new Float32Array(accessorBuf.buffer, accessorBuf.byteOffset, accessorBuf.byteLength / Float32Array.BYTES_PER_ELEMENT);
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
