import * as jsonMap from 'json-source-map';
import { GLTF2 } from "./GLTF2";
import { getBuffer } from 'gltf-import-export';

export const ComponentTypeToBytesPerElement = {
    5120: Int8Array.BYTES_PER_ELEMENT,
    5121: Uint8Array.BYTES_PER_ELEMENT,
    5122: Int16Array.BYTES_PER_ELEMENT,
    5123: Uint16Array.BYTES_PER_ELEMENT,
    5125: Uint32Array.BYTES_PER_ELEMENT,
    5126: Float32Array.BYTES_PER_ELEMENT
};

export const AccessorTypeToNumComponents = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
};

export function getFromJsonPointer(glTF: GLTF2.GLTF, jsonPointer: string): any {
    const jsonPointerSplit = jsonPointer.split('/');
    const numPointerSegments = jsonPointerSplit.length;
    let result = glTF;
    const firstValidIndex = 1; // Because the path has a leading slash.
    for (let i = firstValidIndex; i < numPointerSegments; ++i) {
        result = result[jsonPointerSplit[i]];
    }
    return result;
}

export function truncateJsonPointer(value: string, level: number): string {
    const components = value.split('/');
    components.splice(level + 1);
    return components.join('/');
}

export function atob(str): string {
    return Buffer.from(str, 'base64').toString('binary');
}

export function btoa(str): string {
    return Buffer.from(str, 'binary').toString('base64');
}

function buildArrayBuffer<T extends ArrayLike<number>>(typedArray: any, data: ArrayBufferView, byteOffset: number, count: number, numComponents: number, byteStride?: number): T {
    byteOffset += data.byteOffset;

    const targetLength = count * numComponents;

    if (byteStride == null || byteStride === numComponents * typedArray.BYTES_PER_ELEMENT) {
        return new typedArray(data.buffer, byteOffset, targetLength);
    }

    const elementStride = byteStride / typedArray.BYTES_PER_ELEMENT;
    const sourceBuffer = new typedArray(data.buffer, byteOffset, elementStride * count);
    const targetBuffer = new typedArray(targetLength);
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

export function getAccessorData(fileName: string, gltf: GLTF2.GLTF, accessor: GLTF2.Accessor): ArrayLike<number> | undefined {
    if (accessor.bufferView == undefined) {
        return undefined;
    }

    const bufferView = gltf.bufferViews[accessor.bufferView];
    if (!bufferView) {
        return undefined;
    }

    const buffer = getBuffer(gltf, bufferView.buffer, fileName);
    const bufferOffset = bufferView.byteOffset || 0;
    const bufferLength = bufferView.byteLength;
    const bufferStride = bufferView.byteStride;
    const bufferViewBuf = buffer.subarray(bufferOffset, bufferOffset + bufferLength);
    const accessorByteOffset = accessor.byteOffset || 0;

    switch (accessor.componentType) {
        case GLTF2.AccessorComponentType.BYTE:
            return buildArrayBuffer(Int8Array, bufferViewBuf, bufferOffset + accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);

        case GLTF2.AccessorComponentType.UNSIGNED_BYTE:
            return buildArrayBuffer(Uint8Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);

        case GLTF2.AccessorComponentType.SHORT:
            return buildArrayBuffer(Int16Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);

        case GLTF2.AccessorComponentType.UNSIGNED_SHORT:
            return buildArrayBuffer(Uint16Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);

        case GLTF2.AccessorComponentType.UNSIGNED_INT:
            return buildArrayBuffer(Uint32Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);

        case GLTF2.AccessorComponentType.FLOAT:
            return buildArrayBuffer(Float32Array, bufferViewBuf, accessorByteOffset, accessor.count, AccessorTypeToNumComponents[accessor.type], bufferStride);
    }
}

export function getAccessorElement(data: ArrayLike<number>, elementIndex: number, numComponents: number, componentType: GLTF2.AccessorComponentType, normalized: boolean): Array<number> {
    const normalize = (value: number): number => {
        switch (componentType) {
            case GLTF2.AccessorComponentType.BYTE: return Math.max(value / 127.0, -1.0);
            case GLTF2.AccessorComponentType.UNSIGNED_BYTE: return value / 255.0;
            case GLTF2.AccessorComponentType.SHORT: return Math.max(value / 32767.0, -1.0);
            case GLTF2.AccessorComponentType.UNSIGNED_SHORT: return value / 65535.0;
        }

        return value;
    };

    const values = new Array<number>(numComponents);
    const startIndex = elementIndex * numComponents;
    for (let index = 0; index < numComponents; index++) {
        const value = data[startIndex + index];
        values[index] = normalized ? normalize(value) : value;
    }

    return values;
}

const gltfMimeTypes = {
    'image/png' : ['png'],
    'image/jpeg' : ['jpg', 'jpeg'],
    'image/vnd-ms.dds' : ['dds'],
    'text/plain' : ['glsl', 'vert', 'vs', 'frag', 'fs', 'txt']
};

export function guessFileExtension(mimeType) {
    if (gltfMimeTypes.hasOwnProperty(mimeType)) {
        return '.' + gltfMimeTypes[mimeType][0];
    }
    return '.bin';
}

export function guessMimeType(filename: string): string {
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

export function toResourceUrl(path: string): string {
    return `vscode-resource:${path.replace(/\\/g, '/')}`;
}

interface JsonMapPointerValue {
    column: number;
    line: number;
    pos: number;
}

export interface JsonMap<T> {
    data: T;
    pointers: {
        [pointer: string]: {
            value: JsonMapPointerValue,
            valueEnd: JsonMapPointerValue
        }
    };
}

export function parseJsonMap(content: string): JsonMap<GLTF2.GLTF> {
    return jsonMap.parse(content);
}
