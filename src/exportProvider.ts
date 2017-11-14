'use strict';
import * as vscode from 'vscode';
import * as Url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { guessMimeType } from './dataUriTextDocumentContentProvider';

function isBase64 (uri: string) : boolean {
    return uri.length < 5 ? false : uri.substr(0, 5) === "data:";
}

function decodeBase64(uri: string) : Buffer {
    return Buffer.from(uri.split(",")[1], 'base64');
}

function dataFromUri(buffer: any, basePath: string) : { mimeType: string, buffer: Buffer } {
    if (buffer.uri === undefined) {
        return undefined;
    }
    if (isBase64(buffer.uri)) {
        const mimeTypePos = buffer.uri.indexOf(';');
        if (mimeTypePos > 0) {
            let mimeType = buffer.uri.substring(5, mimeTypePos)
            return { mimeType: mimeType, buffer: decodeBase64(buffer.uri) };
        } else {
            return undefined;
        }
    }
    else {
        const fullUri = Url.resolve(basePath, buffer.uri);
        let mimeType = guessMimeType(fullUri)
        return { mimeType: mimeType, buffer: fs.readFileSync(fullUri) };
    }
}

function alignedLength(value: number) : number
{
    const alignValue = 4;
    if (value == 0) {
        return value;
    }

    let multiple = value % alignValue;
    if (multiple === 0) {
        return value;
    }

    return value + (alignValue - multiple);
}

export function save(gltf: any, sourceFilename: string, outputFilename: string) {
    const Binary = {
        Magic: 0x46546C67
    };

    let bufferMap = new Map<number, number>();

    let bufferOffset = 0;
    let outputBuffers = [];
    let bufferIndex = 0;
    // Get current buffers already defined in bufferViews
    for (; bufferIndex < gltf.buffers.length; bufferIndex++)
    {
        let buffer = gltf.buffers[bufferIndex];
        let data = dataFromUri(buffer, sourceFilename);
        if (data !== undefined) {
            outputBuffers.push(data.buffer);
        }
        delete buffer['uri'];
        buffer['byteLength'] = data.buffer.length;
        bufferMap.set(bufferIndex, bufferOffset);
        bufferOffset += alignedLength(data.buffer.length);
    }
    for (let bufferView of gltf.bufferViews)
    {
        bufferView.byteOffset = (bufferView.byteOffset || 0) + bufferMap.get(bufferView.buffer);
        bufferView.buffer = 0;
    }

    if (gltf.images !== undefined)
    {
        for (let image of gltf.images) {
            let data = dataFromUri(image, sourceFilename);
            if (data === undefined) {
                delete image['uri'];
                continue;
            }

            let bufferView = {
                buffer: 0,
                byteOffset: bufferOffset,
                byteLength: data.buffer.length,
            };

            bufferMap.set(bufferIndex, bufferOffset);
            bufferIndex++;
            bufferOffset += alignedLength(data.buffer.length);

            let bufferViewIndex = gltf.bufferViews.length;
            gltf.bufferViews.push(bufferView);
            outputBuffers.push(data.buffer);

            image['bufferView'] = bufferViewIndex;
            image['mimeType'] = data.mimeType;
            delete image['uri'];
        }
    }

    if (gltf.shaders !== undefined)
    {
        for (let shader of gltf.shaders) {
            let data = dataFromUri(shader, sourceFilename);
            if (data === undefined) {
                delete shader['uri'];
                continue;
            }

            let bufferView = {
                buffer: 0,
                byteOffset: bufferOffset,
                byteLength: data.buffer.length,
            };

            bufferMap.set(bufferIndex, bufferOffset);
            bufferIndex++;
            bufferOffset += alignedLength(data.buffer.length);

            let bufferViewIndex = gltf.bufferViews.length;
            gltf.bufferViews.push(bufferView);
            outputBuffers.push(data.buffer);

            shader['bufferView'] = bufferViewIndex;
            shader['mimeType'] = data.mimeType;
            delete shader['uri'];
        }
    }

    let binBufferSize = bufferOffset;

    gltf.buffers = [{
        byteLength: binBufferSize
    }];

    let jsonBuffer = Buffer.from(JSON.stringify(gltf), 'utf8');
    let jsonAlignedLength = alignedLength(jsonBuffer.length);
    if (jsonAlignedLength !== jsonBuffer.length)
    {
        let tmpJsonBuffer = Buffer.alloc(jsonAlignedLength, ' ', 'utf8');
        jsonBuffer.copy(tmpJsonBuffer);
        jsonBuffer = tmpJsonBuffer;
    }

    let totalSize =
        12 + // file header: magic + version + length
        8 + // json chunk header: json length + type
        jsonAlignedLength +
        8 + // bin chunk header: chunk length + type
        binBufferSize;

    let finalBuffer = Buffer.alloc(totalSize);
    let dataView = new DataView(finalBuffer.buffer);
    let bufIndex = 0;
    dataView.setUint32(bufIndex, Binary.Magic, true); bufIndex += 4;
    dataView.setUint32(bufIndex, 2, true); bufIndex += 4;
    dataView.setUint32(bufIndex, totalSize, true); bufIndex += 4;

    // JSON
    dataView.setUint32(bufIndex, jsonBuffer.length, true); bufIndex += 4;
    dataView.setUint32(bufIndex, 0x4E4F534A, true); bufIndex += 4;
    jsonBuffer.copy(finalBuffer, bufIndex); bufIndex += jsonAlignedLength;

    // BIN
    dataView.setUint32(bufIndex, binBufferSize, true); bufIndex += 4;
    dataView.setUint32(bufIndex, 0x004E4942, true); bufIndex += 4;

    for (let i = 0; i < outputBuffers.length; i++) {
        outputBuffers[i].copy(finalBuffer, bufIndex + bufferMap.get(i));
    }

    fs.writeFileSync(outputFilename, finalBuffer, 'binary');
}
