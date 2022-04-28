import * as vscode from 'vscode';
import { GLTF2 } from "./GLTF2";
import { JsonMap } from './utilities';

export class Insertables {
    public eol: string;
    public tabSize: number;
    public indent: string;

    constructor(textEditor: vscode.TextEditor) {
        this.eol = (textEditor.document.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n';
        this.tabSize = textEditor.options.tabSize as number;
        this.indent = textEditor.options.insertSpaces ? (new Array(this.tabSize + 1).join(' ')) : '\t';
    }
}

export function getBestKeyFromDiagnostic(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
    textEditor: vscode.TextEditor): string {
    // This could be called by the QuickFix system, or just invoked directly
    // by a user as an editor command.  Figure out where this was invoked.
    const document = textEditor.document;
    let searchRange: vscode.Range;
    if (diagnostic) {
        searchRange = diagnostic.range;
    } else {
        const selection = textEditor.selection;
        searchRange = new vscode.Range(
            selection.active,
            selection.active
        );
    }

    // The last pointer in the list matching the range has the "best" (most specific) key.
    const pointers = map.pointers;
    let bestKey = '';
    for (let key of Object.keys(pointers)) {
        let pointer = pointers[key];

        if (pointer.key) {
            const range = new vscode.Range(
                document.positionAt(pointer.key.pos),
                document.positionAt(pointer.valueEnd.pos)
            );

            if (range.contains(searchRange)) {
                bestKey = key;
            }
        }
    }

    return bestKey;
}

export function getLastSubKey(map: JsonMap<GLTF2.GLTF>, searchKey: string): string {
    const pointers = map.pointers;
    let subKey = '';
    searchKey += '/';
    for (let key of Object.keys(pointers)) {
        let pointer = pointers[key];

        if (pointer.key && key.startsWith(searchKey)) {
            subKey = key;
        }
    }

    return subKey;
}

export function clearRangeOfJsonKey(map: JsonMap<GLTF2.GLTF>, parentKey: string, keyName: string): vscode.Range {
    const pointers = map.pointers;
    parentKey += '/';
    let prevKey = '';
    let targetKey = parentKey + keyName;
    let nextKey = '';
    let foundTarget = false;
    for (let key of Object.keys(pointers)) {
        let pointer = pointers[key];

        if (pointer.key && key.startsWith(parentKey)) {
            if (key === targetKey) {
                foundTarget = true;
            } else if (foundTarget) {
                nextKey = key;
                break;
            } else {
                prevKey = key;
            }
        }
    }

    if (!foundTarget) {
        throw new Error("Can't find key " + targetKey);
    }

    if (prevKey) {
        return new vscode.Range(
            pointers[prevKey].valueEnd.line, pointers[prevKey].valueEnd.column,
            pointers[targetKey].valueEnd.line, pointers[targetKey].valueEnd.column
        );
    }

    if (nextKey) {
        return new vscode.Range(
            pointers[targetKey].key.line, pointers[targetKey].key.column,
            pointers[nextKey].key.line, pointers[nextKey].key.column
        );
    }

    throw new Error("Can't leave JSON object empty: " + parentKey);
}
