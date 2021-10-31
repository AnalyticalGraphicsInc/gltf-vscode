import * as vscode from 'vscode';
import { JsonMap } from './utilities';
import { GLTF2 } from './GLTF2';

// This file offers "Quick Fixes" for select validation issues.

const GLTF_VALIDATOR = 'glTF Validator';
const UNDECLARED_EXTENSION = 'UNDECLARED_EXTENSION';
const ADD_EXTENSION = 'Add Extension to \'extensionsUsed\'';

export class GltfActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
        // for each diagnostic entry that has the matching `code`, create a code action command
        return context.diagnostics
            .filter(diagnostic => diagnostic.source === GLTF_VALIDATOR && diagnostic.code === UNDECLARED_EXTENSION)
            .map(diagnostic => this.createCommandDeclareExtension(diagnostic));
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

    public static declareExtension(diagnostic: vscode.Diagnostic, map: JsonMap<GLTF2.GLTF>): void {
        const activeTextEditor = vscode.window.activeTextEditor;
        const document = activeTextEditor.document;
        let searchRange: vscode.Range;

        // This could be called by the QuickFix system, or just invoked directly
        // by a user as an editor command.  Figure out where this was invoked.
        if (diagnostic) {
            searchRange = diagnostic.range;
        } else {
            const selection = activeTextEditor.selection;
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
        const tabSize = activeTextEditor.options.tabSize as number;
        const space = activeTextEditor.options.insertSpaces ? (new Array(tabSize + 1).join(' ')) : '\t';
        let insert = -1;
        let newJson: string;

        if (pointers['/extensionsUsed'] !== undefined) {
            // Add extension name to existing extensionsUsed list.

            for (let key of Object.keys(pointers)) {
                if (key.startsWith('/extensionsUsed/')) {
                    insert = Math.max(insert, pointers[key].valueEnd.pos);
                }
            }

            if (insert < 0) {
                return;
            }

            newJson =
                ',' + eol +
                space + space + '"' + extensionName + '"';

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

        activeTextEditor.edit(editBuilder => {
            editBuilder.insert(document.positionAt(insert), newJson);
        });
    }
}