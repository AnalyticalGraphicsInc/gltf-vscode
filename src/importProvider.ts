'use strict';
import * as vscode from 'vscode';
import * as Url from 'url';
import { Uri, ViewColumn } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { guessFileExtension } from './dataUriTextDocumentContentProvider';

export async function load(sourceFilename: string) {
    if (typeof sourceFilename == 'undefined') {
        return;
    }
    if (!fs.existsSync(sourceFilename)) {
        return;
    }

    // Compose an target filename
    let targetFilename = sourceFilename.replace('.glb', '.gltf');

    if (!vscode.workspace.getConfiguration('glTF').get('neverPromptForFilename')) {
        const options: vscode.SaveDialogOptions = {
            defaultUri: Uri.file(targetFilename),
            filters: {
                'glTF': ['gltf'],
                'All files': ['*']
            }
        };
        let uri = await vscode.window.showSaveDialog(options);
        if (uri !== undefined) {
            targetFilename = uri.fsPath;
        }
        else {
            return;
        }
    }

    // Read the GLB data
    const Binary = {
        Magic: 0x46546C67
    };

    const sourceBuf = fs.readFileSync(sourceFilename);
    const readMagic = sourceBuf.readUInt32LE(0);
    if (readMagic !== Binary.Magic) {
        return;
    }
    const readVersion = sourceBuf.readUInt32LE(4);
    if (readVersion !== 2) {
        return;
    }

    const jsonBufSize = sourceBuf.readUInt32LE(12);
    const jsonString = sourceBuf.toString('utf8', 20, jsonBufSize + 20);

    let gltf = JSON.parse(jsonString);
    const binBuffer = sourceBuf.slice(jsonBufSize + 28);

    // returns the image object for the given bufferView index if the buffer view is an image
    function findImageBuf(bufferViewIndex: number) : any {
        if (gltf.images !== undefined) {
            for (let image of gltf.images) {
                if (image.bufferView == bufferViewIndex) {
                    return image;
                }
            }
        }
    }

    // writes to the filesystem image data from the parameters
    function writeImageBuf(imageBuf: any, bufferViewIndex: number, buf: Buffer) {
        let view = gltf.bufferViews[bufferViewIndex];
        const offset: number = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length: number = view.byteLength;

        let extension = guessFileExtension(imageBuf.mimeType);
        let filename = targetFilename + '.' + bufferViewIndex.toString() + extension;
        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');

        delete imageBuf.bufferView;
        delete imageBuf.mimeType;
        imageBuf.uri = path.basename(filename);
    }

    // returns the shader object for the given bufferView index if the buffer view is a shader
    function findShaderBuf(bufferViewIndex: number) : any {
        if (gltf.shaders !== undefined) {
            for (let shader of gltf.shaders) {
                if (shader.bufferView == bufferViewIndex) {
                    return shader;
                }
            }
        }
    }

    // writes to the filesystem shader data from the parameters
    function writeShaderBuf(shaderBuf: any, bufferViewIndex: number, buf: Buffer) {
        let view = gltf.bufferViews[bufferViewIndex];
        const offset: number = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length: number = view.byteLength;

        let extension = '.glsl';
        const GL_VERTEX_SHADER_ARB = 0x8B31;
        const GL_FRAGMENT_SHADER_ARB = 0x8B30;
        if (shaderBuf.type == GL_VERTEX_SHADER_ARB) {
            extension = '.vert';
        } else if (shaderBuf.type == GL_FRAGMENT_SHADER_ARB) {
            extension = '.frag';
        }
        let filename = targetFilename + '.' + bufferViewIndex.toString() + extension;

        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');

        delete shaderBuf.bufferView;
        delete shaderBuf.mimeType;
        shaderBuf.uri = path.basename(filename);
    }

    // data the represents the buffers that are neither images or shaders
    let bufferViewList:number[] = [];
    let bufferDataList:Buffer[] = [];

    function addToBinaryBuf(bufferViewIndex: number, buf: Buffer) {
        let view = gltf.bufferViews[bufferViewIndex];
        const offset: number = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length: number = view.byteLength;

        const bufPart = buf.slice(offset, offset + length);

        bufferViewList.push(bufferViewIndex);
        bufferDataList.push(bufPart);
    }

    // go through all the buffer views and break out buffers as separate files
    if (gltf.bufferViews !== undefined) {
        for (let bufferViewIndex = 0; bufferViewIndex < gltf.bufferViews.length; bufferViewIndex++) {
            let imageBuf = findImageBuf(bufferViewIndex);
            if (imageBuf !== undefined) {
                writeImageBuf(imageBuf, bufferViewIndex, binBuffer);
                continue;
            }

            let shaderBuf = findShaderBuf(bufferViewIndex);
            if (shaderBuf !== undefined) {
                writeShaderBuf(shaderBuf, bufferViewIndex, binBuffer);
                continue;
            }

            addToBinaryBuf(bufferViewIndex, binBuffer);
        }
    }

    // create a file for the rest of the buffer data
    let newBufferView = [];
    let finalBuffer = Buffer.concat(bufferDataList);
    let currentOffset = 0;
    for (let bufferViewIndex of bufferViewList) {
        let view = gltf.bufferViews[bufferViewIndex];
        view.byteOffset = currentOffset;
        const length: number = view.byteLength;
        currentOffset += length;
    }
    let binFilename = targetFilename + '.bin';
    fs.writeFileSync(binFilename, finalBuffer, 'binary');
    gltf.buffers = [{
        uri: path.basename(binFilename),
        byteLength: finalBuffer.length
    }];

    // write out the final GLTF json and open.
    let gltfString = JSON.stringify(gltf, null, '  ');
    fs.writeFileSync(targetFilename, gltfString, 'utf8');

    vscode.commands.executeCommand('vscode.open', Uri.file(targetFilename));
}
