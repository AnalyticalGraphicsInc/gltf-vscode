import * as vscode from 'vscode';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import { JsonMap, getFromJsonPointer, getAccessorData, getAccessorElement, setAccessorElement } from './utilities';
import { clearRangeOfJsonKey, getBestKeyFromDiagnostic, getLastSubKey, Insertables } from './editorUtilities';
import { GLTF2 } from './GLTF2';

// This file offers "Quick Fixes" for select validation issues.

const GLTF_VALIDATOR = 'glTF Validator';
const UNDECLARED_EXTENSION = 'UNDECLARED_EXTENSION';
const BUFFER_VIEW_TARGET_MISSING = 'BUFFER_VIEW_TARGET_MISSING';
const ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE = 'ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE';
const ACCESSOR_JOINTS_USED_ZERO_WEIGHT = 'ACCESSOR_JOINTS_USED_ZERO_WEIGHT';
const ADD_EXTENSION = 'Add Extension to \'extensionsUsed\'';
const ADD_BUFFER_VIEW_TARGET = 'Add target for this bufferView';
const ADD_ALL_BUFFER_VIEW_TARGETS = 'Add all needed targets for all bufferViews in this file';
const CLEAR_ANIMATION_BYTESTRIDE = 'Clear byteStride for this animation\'s bufferView';
const CLEAR_ALL_ANIMATION_BYTESTRIDES = 'Clear byteStrides for all animation bufferViews in this file';
const CLEAR_UNUSED_JOINTS = 'Clear Joint IDs with Zero Weight';

export class GltfActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public static readonly supportedCodes = [
        UNDECLARED_EXTENSION,
        BUFFER_VIEW_TARGET_MISSING,
        ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE,
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
                this.createCommandFromDiagnostic(diagnosticHash[code]).forEach(c => actions.push(c));
            }
        }
        return actions;
    }

    private createCommandFromDiagnostic(diagnostic: vscode.Diagnostic): vscode.CodeAction[] {
        switch (diagnostic.code) {
            case UNDECLARED_EXTENSION:
                return [
                    this.createCommandDeclareExtension(diagnostic)
                ];
            case BUFFER_VIEW_TARGET_MISSING:
                return [
                    this.createCommandAddTarget(diagnostic),
                    this.createCommandAddAllTargets(diagnostic)
                ];
            case ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE:
                return [
                    this.createCommandClearByteStride(diagnostic),
                    this.createCommandClearAllByteStrides(diagnostic)
                ];
            case ACCESSOR_JOINTS_USED_ZERO_WEIGHT:
                return [
                    this.createCommandClearUnusedJoints(diagnostic)
                ];
            default:
                throw new Error("Invalid diagnostic code.");
        }
    }

    /////////////////////////////////////////////////////////////////
    // UNDECLARED_EXTENSION

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
        const pointers = map.pointers;
        let bestKey = getBestKeyFromDiagnostic(diagnostic, map, textEditor);
        let pos = bestKey.lastIndexOf('/extensions/');
        if (pos < 0) {
            throw new Error("This quick-fix command should be used on a glTF extension.");
        }

        let extensionName = bestKey.substring(pos + 12);
        let pos2 = extensionName.indexOf('/');
        if (pos2 >= 0)
        {
            extensionName = extensionName.substring(0, pos2);
        }

        if (extensionName === '') {
            throw new Error("Extension name cannot be blank.");
        }

        // Now we know the extension name.  Figure out if there's already
        // an "extensionsUsed" block, create one if not, and add the extension name to it.
        const insertables = new Insertables(textEditor);
        const eol = insertables.eol;
        const indent = insertables.indent;
        let insertPos = -1;
        let newJson: string;

        if (pointers['/extensionsUsed'] !== undefined) {
            // Add extension name to existing extensionsUsed list.

            for (let key of Object.keys(pointers)) {
                if (key.startsWith('/extensionsUsed/')) {
                    insertPos = Math.max(insertPos, pointers[key].valueEnd.pos);
                }
            }

            newJson =
                ',' + eol +
                indent + indent + '"' + extensionName + '"';

            if (insertPos < 0) {
                // This block only executes if "extensionsUsed" is an empty array,
                // which is invalid glTF, but possible in the editor.
                insertPos = pointers['/extensionsUsed'].value.pos + 1;
                newJson = newJson.substring(1);
            }

        } else {
            // Create a new extensionsUsed section.

            for (let key of Object.keys(pointers)) {
                if (key.length > 2) {
                    insertPos = Math.max(insertPos, pointers[key].valueEnd.pos);
                }
            }

            newJson =
                ',' + eol +
                indent + '"extensionsUsed": [' + eol +
                indent + indent + '"' + extensionName + '"' + eol +
                indent + ']';
        }

        edit.insert(document.positionAt(insertPos), newJson);
    }

    /////////////////////////////////////////////////////////////////
    // BUFFER_VIEW_TARGET_MISSING

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
        let bestKey = getBestKeyFromDiagnostic(diagnostic, map, textEditor);

        if (bestKey.indexOf('primitives') < 0) {
            throw new Error("This quick-fix command should be used on a mesh primitive that lacks a bufferView target.");
        }

        let gltf = map.data;
        let accessorId = getFromJsonPointer(gltf, bestKey);
        let bufferViewId = gltf.accessors[accessorId].bufferView;
        let bufferViewKey = '/bufferViews/' + bufferViewId;
        if (map.pointers.hasOwnProperty(bufferViewKey + '/target')) {
            throw new Error("This bufferView already has a target set.");
        }
        let subKey = getLastSubKey(map, bufferViewKey);
        let insertPos: number;
        if (subKey) {
            insertPos = map.pointers[subKey].valueEnd.pos;
        } else {
            insertPos = map.pointers[bufferViewKey].valueEnd.pos - 1;
        }

        const insertables = new Insertables(textEditor);
        const eol = insertables.eol;
        const indent = insertables.indent;
        let newJson: string;

        if (bestKey.endsWith('/indices')) {
            newJson = ',' + eol + indent + indent + indent + '"target": 34963'; // ELEMENT_ARRAY_BUFFER for indices
        } else {
            newJson = ',' + eol + indent + indent + indent + '"target": 34962'; // ARRAY_BUFFER for vertex attributes
        }

        edit.insert(document.positionAt(insertPos), newJson);
    }

    private createCommandAddAllTargets(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(ADD_ALL_BUFFER_VIEW_TARGETS, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.addAllBufferViewTargets',
            arguments: [diagnostic],
            title: ADD_ALL_BUFFER_VIEW_TARGETS,
            tooltip: 'Add targets to all bufferViews that require them.'
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static addAllBufferViewTargets(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
        const document = textEditor.document;
        const pointers = map.pointers;
        const insertables = new Insertables(textEditor);
        const eol = insertables.eol;
        const indent = insertables.indent;

        let gltf = map.data;
        const indiciesAccessorIds: number[] = [];
        const attributeAccessorIds: number[] = [];
        const numMeshes = gltf.meshes.length;
        for (let m = 0; m < numMeshes; ++m) {
            const mesh = gltf.meshes[m];
            const numPrims = mesh.primitives.length;
            for (let p = 0; p < numPrims; ++p) {
                const primitive = mesh.primitives[p];
                // Indicies
                if (primitive.indices !== undefined) {
                    indiciesAccessorIds.push(primitive.indices);
                }
                // Attributes
                for (let key of Object.keys(primitive.attributes)) {
                    attributeAccessorIds.push(primitive.attributes[key]);
                }
                // Morph targets
                if (primitive.targets) {
                    const numTargets = primitive.targets.length;
                    for (let t = 0; t < numTargets; ++t) {
                        const target = primitive.targets[t];
                        for (let key of Object.keys(target)) {
                            attributeAccessorIds.push(target[key]);
                        }
                    }
                }
            }
        }

        // Make sure 'target' isn't added to the same bufferView twice.
        const touchedBufferIds: number[] = [];

        // Apply ELEMENT_ARRAY_BUFFER targets for indicies.
        const numIndiciesAccessors = indiciesAccessorIds.length;
        for (let a = 0; a < numIndiciesAccessors; ++a) {

            let bufferViewId = gltf.accessors[indiciesAccessorIds[a]].bufferView;
            if (bufferViewId !== undefined) {
                let bufferViewKey = '/bufferViews/' + bufferViewId;
                if (!pointers.hasOwnProperty(bufferViewKey + '/target') &&
                    touchedBufferIds.indexOf(bufferViewId) < 0) {
                    let subKey = getLastSubKey(map, bufferViewKey);
                    let insertPos: number;
                    if (subKey) {
                        insertPos = map.pointers[subKey].valueEnd.pos;
                    } else {
                        insertPos = map.pointers[bufferViewKey].valueEnd.pos - 1;
                    }
                    let newJson = ',' + eol + indent + indent + indent + '"target": 34963';

                    edit.insert(document.positionAt(insertPos), newJson);
                    touchedBufferIds.push(bufferViewId);
                }
            }
        }

        // Apply ARRAY_BUFFER targets for vertex attributes.
        const numAttributeAccessors = attributeAccessorIds.length;
        for (let a = 0; a < numAttributeAccessors; ++a) {

            let bufferViewId = gltf.accessors[attributeAccessorIds[a]].bufferView;
            if (bufferViewId !== undefined) {
                let bufferViewKey = '/bufferViews/' + bufferViewId;
                if (!pointers.hasOwnProperty(bufferViewKey + '/target') &&
                    touchedBufferIds.indexOf(bufferViewId) < 0) {
                    let subKey = getLastSubKey(map, bufferViewKey);
                    let insertPos: number;
                    if (subKey) {
                        insertPos = map.pointers[subKey].valueEnd.pos;
                    } else {
                        insertPos = map.pointers[bufferViewKey].valueEnd.pos - 1;
                    }
                    let newJson = ',' + eol + indent + indent + indent + '"target": 34962';

                    edit.insert(document.positionAt(insertPos), newJson);
                    touchedBufferIds.push(bufferViewId);
                }
            }
        }
    }

    /////////////////////////////////////////////////////////////////
    // ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE

    private createCommandClearByteStride(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(CLEAR_ANIMATION_BYTESTRIDE, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.clearAnimationByteStride',
            arguments: [diagnostic],
            title: CLEAR_ANIMATION_BYTESTRIDE
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static clearAnimationByteStride(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
        const document = textEditor.document;
        let bestKey = getBestKeyFromDiagnostic(diagnostic, map, textEditor);

        // Key should be '/animations/n/samplers/n/output'
        let keySplit = bestKey.split('/');
        if (keySplit.length < 6 || keySplit[1] !== 'animations' ||
            keySplit[3] !== 'samplers' || keySplit[5] !== 'output') {
            throw new Error("This quick-fix command should be used on an animation sampler output.");
        }

        let gltf = map.data;
        let accessorId = getFromJsonPointer(gltf, bestKey);
        let bufferViewId = gltf.accessors[accessorId].bufferView;
        let bufferViewKey = '/bufferViews/' + bufferViewId;
        if (!map.pointers.hasOwnProperty(bufferViewKey + '/byteStride')) {
            throw new Error("This bufferView does not have a byteStride.");
        }

        let range = clearRangeOfJsonKey(map, bufferViewKey, 'byteStride');
        edit.delete(range);
    }

    private createCommandClearAllByteStrides(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(CLEAR_ALL_ANIMATION_BYTESTRIDES, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.clearAllAnimationByteStrides',
            arguments: [diagnostic],
            title: CLEAR_ALL_ANIMATION_BYTESTRIDES
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static clearAllAnimationByteStrides(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit): void {
        const pointers = map.pointers;

        // Make sure we don't try to delete the same key twice.
        const touchedBufferIds: number[] = [];

        let gltf = map.data;
        const numAnimations = gltf.animations ? gltf.animations.length : 0;
        for (let a = 0; a < numAnimations; ++a) {
            const animation = gltf.animations[a];
            const numSamplers = animation.samplers.length;
            for (let s = 0; s < numSamplers; ++s) {
                const sampler = animation.samplers[s];
                const accessorId = sampler.output;
                const bufferViewId = gltf.accessors[accessorId].bufferView;
                if (bufferViewId !== undefined) {
                    let bufferViewKey = '/bufferViews/' + bufferViewId;
                    if (pointers.hasOwnProperty(bufferViewKey + '/byteStride') &&
                        touchedBufferIds.indexOf(bufferViewId) < 0) {
                        let range = clearRangeOfJsonKey(map, bufferViewKey, 'byteStride');
                        edit.delete(range);
                        touchedBufferIds.push(bufferViewId);
                    }
                }
            }
        }
    }

    /////////////////////////////////////////////////////////////////
    // ACCESSOR_JOINTS_USED_ZERO_WEIGHT

    private createCommandClearUnusedJoints(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(CLEAR_UNUSED_JOINTS, vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'gltf.clearUnusedJoints',
            arguments: [diagnostic],
            title: CLEAR_UNUSED_JOINTS,
            tooltip: 'Clear all Joint IDs in this accessor with zero weight.'
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    public static async clearUnusedJoints(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>,
        textEditor: vscode.TextEditor): Promise<void> {
        const document = textEditor.document;
        const pointers = map.pointers;
        let bestKey = getBestKeyFromDiagnostic(diagnostic, map, textEditor);

        if (bestKey.indexOf('/attributes/JOINTS') < 0) {
            throw new Error("This quick-fix command should be used on a mesh primitive attribute JOINTS_*");
        }

        let gltf = map.data;
        let fileName = textEditor.document.fileName;

        // Locate the joints & weights data.

        let jointsAccessor = map.data.accessors[getFromJsonPointer(gltf, bestKey)];

        let weightsKey = bestKey.replace('/JOINTS_', '/WEIGHTS_');
        if (weightsKey === bestKey) {
            throw new Error("Can't find weights key.");
        }
        let weightsAccessor = map.data.accessors[getFromJsonPointer(gltf, weightsKey)];

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
        // Iterate to discover and clear any nonzero joints with zero weights.

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

        // The underlying buffer can now replace its predecessor.
        let updatedBuffer = (jointsData as any).buffer as ArrayBuffer;
        const insertables = new Insertables(textEditor);
        const eol = insertables.eol;
        const indent = insertables.indent;

        // Try to work out a good default name.
        let jointsBufferView = map.data.bufferViews[jointsAccessor.bufferView];
        let bufferId = jointsBufferView.buffer;
        let bufferUriKey = '/buffers/' + bufferId + '/uri';
        let defaultName = 'data_patch_1';
        if (pointers.hasOwnProperty(bufferUriKey)) {
            const pointer = pointers[bufferUriKey];
            defaultName = JSON.parse(textEditor.document.getText().substring(
                pointer.value.pos, pointer.valueEnd.pos));
            if (/_patch[0-9]+\.bin$/i.test(defaultName)) {
                let pos = defaultName.lastIndexOf('_patch');
                let patchNum = parseInt(defaultName.substring(pos + 6), 10) + 1;
                defaultName = defaultName.replace(/_patch[0-9]+\.bin$/i, '_patch' + patchNum + '.bin');
            } else if (/\.bin$/i.test(defaultName)) {
                defaultName = defaultName.replace(/\.bin$/i, '_patch1.bin');
            } else {
                defaultName = 'model_data_patch1.bin';
            }
        }
        defaultName = decodeURI(Url.resolve(fileName, defaultName));

        // Ask the user for confirmation, then save the new bin file.
        const saveOptions: vscode.SaveDialogOptions = {
            defaultUri: vscode.Uri.file(defaultName),
            title: 'Save Updated Model Data As',
            filters: {
                'Binary Data': ['bin'],
                'All files': ['*']
            }
        };
        let saveUri = await vscode.window.showSaveDialog(saveOptions);
        // CAUTION: The provided "edit" is no longer valid after the above "await".
        //          A new textEditor.edit must be obtained.

        if (saveUri !== undefined) {
            fs.writeFileSync(saveUri.fsPath, Buffer.from(updatedBuffer));

            await textEditor.edit(edit => {
                let replacementUri = JSON.stringify(encodeURI(path.basename(saveUri.fsPath)));
                if (pointers.hasOwnProperty(bufferUriKey)) {
                    const pointer = pointers[bufferUriKey];
                    edit.replace(new vscode.Range(pointer.value.line, pointer.value.column,
                        pointer.valueEnd.line, pointer.valueEnd.column), replacementUri);
                    let pos = new vscode.Position(pointer.value.line, pointer.value.column);
                    textEditor.selection = new vscode.Selection(pos, pos);
                    textEditor.revealRange(new vscode.Range(pos, pos),
                        vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                } else {
                    let bufferKey = '/buffers/' + bufferId;
                    if (!pointers.hasOwnProperty(bufferKey)) {
                        throw new Error("Can't find buffer in JSON.");
                    }

                    const pointer = pointers[bufferKey];
                    let newJson = eol + indent + indent + indent + '"uri": ' + replacementUri + ',';
                    let insertPos = pointer.value.pos + 1;
                    edit.insert(document.positionAt(insertPos), newJson);
                    let pos = new vscode.Position(pointer.value.line + 1, 0);
                    textEditor.selection = new vscode.Selection(pos, pos);
                    textEditor.revealRange(new vscode.Range(pos, pos),
                        vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                }
            });
        }
    }
}
