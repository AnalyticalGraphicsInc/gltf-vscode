import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

//
// Virtual TextDocumentContentProvider for glb json chunk.
//
export class GlbProvider implements vscode.TextDocumentContentProvider {

    // emitter and its event
    onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    provideTextDocumentContent(uri: vscode.Uri): string {

        let data = fs.readFileSync(uri.fsPath);
        let offset = 0;
        if (data.readInt32LE(offset) != 0x46546C67) {
            return `not glb`;
        }
        offset += 4;

        let version = data.readInt32LE(offset)
        if (version != 2) {
            return `gltf version ${version} not support`;
        }
        offset += 4;

        let length = data.readInt32LE(offset);
        offset += 4;

        let json = null;
        let binOffset = null;
        while (offset < length) {

            let chunkLength = data.readInt32LE(offset);
            offset += 4;

            let chunkType = data.readInt32LE(offset);
            offset += 4;

            let chunkData = data.toString('utf8', offset, offset + chunkLength);

            if (chunkType == 0x4E4F534A) {

                json = JSON.parse(chunkData);

            }
            else if (chunkType == 0x004E4942) {

                binOffset = offset;

            }
            else {
                // unknown
            }

            offset += chunkLength;
        }

        if (binOffset && json) {

            // buffer access hack
            json.buffers[0]['uri'] = path.basename(uri.fsPath);
            for (let bufferView of json.bufferViews) {
                bufferView.byteOffset += binOffset;
            }

            return JSON.stringify(json, null, '  ');
        }
        else {

            return `invalid glb`;

        }
    }
};
