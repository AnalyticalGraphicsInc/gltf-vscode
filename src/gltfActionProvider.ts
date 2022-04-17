import * as vscode from 'vscode';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import { JsonMap, getAccessorData, getAccessorElement, setAccessorElement } from './utilities';
import { GLTF2 } from './GLTF2';

// This file offers "Quick Fixes" for select validation issues.

const GLTF_VALIDATOR = 'glTF Validator';
const UNDECLARED_EXTENSION = 'UNDECLARED_EXTENSION';
const BUFFER_VIEW_TARGET_MISSING = 'BUFFER_VIEW_TARGET_MISSING';
const ACCESSOR_JOINTS_USED_ZERO_WEIGHT = 'ACCESSOR_JOINTS_USED_ZERO_WEIGHT';
const ADD_EXTENSION = 'Add Extension to \'extensionsUsed\'';
const ADD_BUFFER_VIEW_TARGET = 'Add bufferView.target';
const CLEAR_UNUSED_JOINTS = 'Clear Joint IDs with Zero Weight';

export class GltfActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public static readonly supportedCodes = [
        UNDECLARED_EXTENSION,
        BUFFER_VIEW_TARGET_MISSING,
        ACCESSOR_JOINTS_USED_ZERO_WEIGHT
    ];

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
        // For each diagnostic entry that has the matching `code`, create a code action command.
        // Only allow one QuickFix per code.
        let actions : vscode.CodeAction[] = [];
        let diagnosticHash = context.diagnostics
            .filter(diagnostic => diagnostic.source === GLTF_VALIDATOR && GltfActionProvider.supportedCodes.indexOf(diagnostic.code.toString()) >= 0)
            .reduce((ob, diagnostic) => {
                let code = diagnostic.code.toString();
                if (!ob[code]) {
                    ob[code] = diagnostic;
                }
                return ob;
            }, {});

        for (let code in diagnosticHash) {
            if (diagnosticHash.hasOwnProperty(code)) {
                actions.push(this.createCommandFromDiagnostic(diagnosticHash[code]));
            }
        }
        return actions;
    }

    private createCommandFromDiagnostic(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        switch (diagnostic.code) {
            case UNDECLARED_EXTENSION:
                return this.createCommandDeclareExtension(diagnostic);
            case BUFFER_VIEW_TARGET_MISSING:
                return this.createCommandAddTarget(diagnostic);
            case ACCESSOR_JOINTS_USED_ZERO_WEIGHT:
                return this.createCommandClearUnusedJoints(diagnostic);
            default:
                throw new Error("Invalid diagnostic code.");
        }
    }

    private createCommandDeclareExtension(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(ADD_EXTENSION, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.declareExtension',
            arguments: [diagnostic],
            title: ADD_EXTENSION,
            tooltip: 'Add this extension to the extensionsUsed array.'
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static declareExtension(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
        const document = textEditor.document;
        let searchRange: vscode.Range;

        // This could be called by the QuickFix system, or just invoked directly
        // by a user as an editor command.  Figure out where this was invoked.
        if (diagnostic) {
            searchRange = diagnostic.range;
        } else {
            const selection = textEditor.selection;
            searchRange = new vscode.Range(
                selection.active,
                selection.active
            );
        }

        // Next, figure out if we're on (or inside) a named extension, and
        // what the extension name is.
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

        let pos = bestKey.lastIndexOf('/extensions/');
        if (pos < 0) {
            return;
        }

        let extensionName = bestKey.substring(pos + 12);
        let pos2 = extensionName.indexOf('/');
        if (pos2 >= 0)
        {
            extensionName = extensionName.substring(0, pos2);
        }

        if (extensionName === '') {
            return;
        }

        // Now we know the extension name.  Figure out if there's already
        // an "extensionsUsed" block, create one if not, and add the extension name to it.
        const eol = (document.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n';
        const tabSize = textEditor.options.tabSize as number;
        const space = textEditor.options.insertSpaces ? (new Array(tabSize + 1).join(' ')) : '\t';
        let insert = -1;
        let newJson: string;

        if (pointers['/extensionsUsed'] !== undefined) {
            // Add extension name to existing extensionsUsed list.

            for (let key of Object.keys(pointers)) {
                if (key.startsWith('/extensionsUsed/')) {
                    insert = Math.max(insert, pointers[key].valueEnd.pos);
                }
            }

            newJson =
                ',' + eol +
                space + space + '"' + extensionName + '"';

            if (insert < 0) {
                // This block only executes if "extensionsUsed" is an empty array,
                // which is invalid glTF, but possible in the editor.
                insert = pointers['/extensionsUsed'].value.pos + 1;
                newJson = newJson.substring(1);
            }

        } else {
            // Create a new extensionsUsed section.

            for (let key of Object.keys(pointers)) {
                if (key.length > 2) {
                    insert = Math.max(insert, pointers[key].valueEnd.pos);
                }
            }

            newJson =
                ',' + eol +
                space + '"extensionsUsed": [' + eol +
                space + space + '"' + extensionName + '"' + eol +
                space + ']';
        }

        edit.insert(document.positionAt(insert), newJson);
    }

    private createCommandAddTarget(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(ADD_BUFFER_VIEW_TARGET, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.addBufferViewTarget',
            arguments: [diagnostic],
            title: ADD_BUFFER_VIEW_TARGET,
            tooltip: 'Add a target to the bufferView based on attribute type.'
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static addBufferViewTarget(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
        const document = textEditor.document;
        let searchRange: vscode.Range;

        // This could be called by the QuickFix system, or just invoked directly
        // by a user as an editor command.  Figure out where this was invoked.
        if (diagnostic) {
            searchRange = diagnostic.range;
        } else {
            const selection = textEditor.selection;
            searchRange = new vscode.Range(
                selection.active,
                selection.active
            );
        }

        // Next, figure out if we're on (or inside) a mesh primitive, and
        // what the related accessor is.
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

        if (bestKey.indexOf('primitives') < 0) {
            return;
        }

        let accessorId : any = map.data;
        bestKey.split('/').slice(1).forEach(element => accessorId = accessorId[element]);

        let bufferViewId = map.data.accessors[accessorId].bufferView;
        let bufferViewKey = '/bufferViews/' + bufferViewId;
        let bufferViewPointer = map.pointers[bufferViewKey];

        const eol = (document.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n';
        const tabSize = textEditor.options.tabSize as number;
        const space = textEditor.options.insertSpaces ? (new Array(tabSize + 1).join(' ')) : '\t';
        let insert = bufferViewPointer.value.pos + 1;
        let newJson: string;

        if (bestKey.endsWith('/indices')) {
            newJson = eol + space + space + space + '"target": 34963,'; // ELEMENT_ARRAY_BUFFER for indices
        } else {
            newJson = eol + space + space + space + '"target": 34962,'; // ARRAY_BUFFER for vertex attributes
        }

        edit.insert(document.positionAt(insert), newJson);
    }

    private createCommandClearUnusedJoints(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(CLEAR_UNUSED_JOINTS, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.clearUnusedJoints',
            arguments: [diagnostic],
            title: CLEAR_UNUSED_JOINTS,
            tooltip: 'Clear all Joint IDs with zero weight.'
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static clearUnusedJoints(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
        const document = textEditor.document;
        let searchRange: vscode.Range;

        // This could be called by the QuickFix system, or just invoked directly
        // by a user as an editor command.  Figure out where this was invoked.
        if (diagnostic) {
            searchRange = diagnostic.range;
        } else {
            const selection = textEditor.selection;
            searchRange = new vscode.Range(
                selection.active,
                selection.active
            );
        }

        // Next, figure out if we're on (or inside) a mesh primitive's
        // JOINTS_0 attribute, and what the related accessor is.
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

        if (bestKey.indexOf('/attributes/JOINTS') < 0) {
            return;
        }

        let gltf = map.data;
        let fileName = textEditor.document.fileName;

        let accessorId : any = map.data;
        bestKey.split('/').slice(1).forEach(element => accessorId = accessorId[element]);

        let jointsAccessor = map.data.accessors[accessorId];
        let jointsBufferView = map.data.bufferViews[jointsAccessor.bufferView];
        let bufferId = jointsBufferView.buffer;
        let bufferKey = '/buffers/' + bufferId;

        let weightsKey = bestKey.replace('/JOINTS_', '/WEIGHTS_');
        if (weightsKey === bestKey) {
            throw new Error("Can't find weights key.");
        }
        accessorId = map.data;
        weightsKey.split('/').slice(1).forEach(element => accessorId = accessorId[element]);

        let weightsAccessor = map.data.accessors[accessorId];
        let weightsBufferView = map.data.bufferViews[weightsAccessor.bufferView];

        //////////////////
        //////////////////

        if (jointsAccessor.type !== GLTF2.AccessorType.VEC4) {
            throw new Error("Joints accessor type must be VEC4.");
        }
        if (weightsAccessor.type !== GLTF2.AccessorType.VEC4) {
            throw new Error("Weights accessor type must be VEC4.");
        }
        const numComponents = 4;

        let jointsData = jointsAccessor && getAccessorData(fileName, gltf, jointsAccessor);
        if (!jointsData) {
            throw new Error("Can't read Joints data.");
        }

        let weightsData = weightsAccessor && getAccessorData(fileName, gltf, weightsAccessor);
        if (!weightsData) {
            throw new Error("Can't read Weights data.");
        }

        const howMany = jointsAccessor.count;

        // Joints is VEC4 of unsigned byte or unsigned short.
        // Weights is VEC4 of float, unsigned byte normalized, or unsigned short normalized.

        for (let i = 0; i < howMany; ++i) {
            const jointsValues = getAccessorElement(jointsData, i, numComponents,
                jointsAccessor.componentType, jointsAccessor.normalized);
            const weightsValues = getAccessorElement(weightsData, i, numComponents,
                weightsAccessor.componentType, weightsAccessor.normalized);
            let anyComponentChanged = false;
            for (let c = 0; c < numComponents; ++c) {
                if (weightsValues[c] < 1e-6 && jointsValues[c] > 0) {
                    // Clear unused Joint ID
                    jointsValues[c] = 0;
                    anyComponentChanged = true;
                }
            }
            if (anyComponentChanged) {
                setAccessorElement(jointsData, i, numComponents,
                    jointsAccessor.componentType, jointsAccessor.normalized, jointsValues);
            }
        }

        //////////////////
        //////////////////

        /*
        if (bufferId !== weightsBufferView.buffer) {
            throw new Error("Joints & Weights must be in the same buffer for this Quick Fix.");
        }

        let buffer = map.data.buffers[bufferId];
        const name = decodeURI(Url.resolve(textEditor.document.fileName, buffer.uri));
        const bufferSize = fs.statSync(name).size;

        let contents = fs.readFileSync(name);

        let jointsOffset = (jointsAccessor.byteOffset || 0) + (jointsBufferView.byteOffset || 0);
        let jointsStride = jointsBufferView.byteStride;
        if (!jointsStride) {
            // Validator has an error, byteStride must be present when 2 or more accessors use it.
            throw new Error("Stride autocompute not implemented yet."); // TODO!
        }

        let weightsOffset = (weightsAccessor.byteOffset || 0) + (weightsBufferView.byteOffset || 0);
        let weightsStride = weightsBufferView.byteStride;
        if (!weightsStride) {
            // Validator has an error, byteStride must be present when 2 or more accessors use it.
            throw new Error("Stride autocompute not implemented yet."); // TODO!
        }

        for (let i = 0; i < howMany; ++i) {
            let pos = i * weightsStride + weightsOffset;
        }
        */

        /*
        let bufferViewKey = '/bufferViews/' + bufferViewId;
        let bufferViewPointer = map.pointers[bufferViewKey];

        const eol = (document.eol === vscode.EndOfLine.CRLF) ? '\r\n' : '\n';
        const tabSize = textEditor.options.tabSize as number;
        const space = textEditor.options.insertSpaces ? (new Array(tabSize + 1).join(' ')) : '\t';
        let insert = bufferViewPointer.value.pos + 1;
        let newJson: string;

        if (bestKey.endsWith('/indices')) {
            newJson = eol + space + space + space + '"target": 34963,'; // ELEMENT_ARRAY_BUFFER for indices
        } else {
            newJson = eol + space + space + space + '"target": 34962,'; // ARRAY_BUFFER for vertex attributes
        }

        //edit.insert(document.positionAt(insert), newJson);
        */
    }
}
