import * as vscode from 'vscode';
import { JsonMap } from './utilities';
import { GLTF2 } from './GLTF2';

// This file offers "Quick Fixes" for select validation issues.

const GLTF_VALIDATOR = 'glTF Validator';
const UNDECLARED_EXTENSION = 'UNDECLARED_EXTENSION';
const BUFFER_VIEW_TARGET_MISSING = 'BUFFER_VIEW_TARGET_MISSING';
const ADD_EXTENSION = 'Add Extension to \'extensionsUsed\'';
const ADD_BUFFER_VIEW_TARGET = 'Add bufferView.target';

export class GltfActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public static readonly supportedCodes = [
        UNDECLARED_EXTENSION,
        BUFFER_VIEW_TARGET_MISSING
    ];

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
        // for each diagnostic entry that has the matching `code`, create a code action command
        return context.diagnostics
            .filter(diagnostic => diagnostic.source === GLTF_VALIDATOR && GltfActionProvider.supportedCodes.indexOf(diagnostic.code.toString()) >= 0)
            .map(diagnostic => this.createCommandFromDiagnostic(diagnostic));
    }

    private createCommandFromDiagnostic(diagnostic: vscode.Diagnostic): vscode.CodeAction {
        switch (diagnostic.code) {
            case UNDECLARED_EXTENSION:
                return this.createCommandDeclareExtension(diagnostic);
            case BUFFER_VIEW_TARGET_MISSING:
                return this.createCommandAddTarget(diagnostic);
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
}
