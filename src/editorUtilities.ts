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

/**
 * Finds a position in the JSON document to begin inserting a new key for
 * an existing object with pre-existing keys.
 *
 * @param map The JSON Map
 * @param searchKey The JSON pointer of the object that needs a new key
 * @returns The document position to begin inserting a comma and a new key
 */
export function getInsertPointForKey(map: JsonMap<GLTF2.GLTF>, searchKey: string): number {
    const pointers = map.pointers;
    let subKey = '';
    let searchKeyPrefix = searchKey + '/';
    let depth = searchKeyPrefix.split('/').length;
    for (let key of Object.keys(pointers)) {
        let pointer = pointers[key];

        // Testing "pointer.key" here makes sure the key's editor positions are known.
        // The test rules out positions of array entries, for example.
        if (pointer.key && key.startsWith(searchKeyPrefix) &&
            key.split('/').length === depth) {
            subKey = key;
        }
    }

    let insertPos: number;
    if (subKey) {
        insertPos = map.pointers[subKey].valueEnd.pos;
    } else {
        insertPos = map.pointers[searchKey].valueEnd.pos - 1;
    }

    return insertPos;
}

/**
 * Calculates an editor range that can be deleted to remove a key from an object.
 *
 * @param map The JSON Map
 * @param parentKey The JSON pointer to an object holding a key
 * @param keyName The name of a key in the parent object
 * @returns The vscode range to delete from the editor.
 */
export function clearRangeOfJsonKey(map: JsonMap<GLTF2.GLTF>, parentKey: string, keyName: string): vscode.Range {
    const pointers = map.pointers;
    parentKey += '/';
    let prevKey = '';
    let targetKey = parentKey + keyName;
    let nextKey = '';
    let foundTarget = false;
    for (let key of Object.keys(pointers)) {
        let pointer = pointers[key];

        // Testing "pointer.key" here makes sure the key's editor positions are known.
        // The test rules out positions of array entries, for example.
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
