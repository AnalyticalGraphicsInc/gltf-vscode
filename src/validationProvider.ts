'use strict';
import * as vscode from 'vscode';
import * as Url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as gltfValidator from 'gltf-validator';
import { resolve } from 'url';

const SaveReportAs = 'Save Report As...';
const OverwriteReport = 'Save report.json';

export async function validate(sourceFilename: string) {
    if (typeof sourceFilename == 'undefined') {
        return;
    }
    if (!fs.existsSync(sourceFilename)) {
        throw new Error('File not found.');
    }

    const gltfData = fs.readFileSync(sourceFilename);
    const baseName = path.basename(sourceFilename);
    const folderName = path.resolve(sourceFilename, '..');

    const result = await gltfValidator.validateBytes(baseName, new Uint8Array(gltfData), (uri) =>
        new Promise((resolve, reject) => {
            uri = path.resolve(folderName, uri);
            fs.readFile(uri, (err, data) => {
                if (err) {
                    reject(err.toString());
                    return;
                }
                resolve(data);
            });
        }),
        {
            maxIssues: 100
            // TODO: Hook this up the same way as in server.ts
        }
    );

    const useSaveAs = !vscode.workspace.getConfiguration('glTF').get('alwaysOverwriteDefaultFilename');
    const SaveReport = useSaveAs ? SaveReportAs : OverwriteReport;

    //
    // Show the user a quick summary, and ask if they want to save the full report.
    //
    let userChoicePromise: Thenable<string>;
    if (result.issues.numErrors > 0 && result.issues.numWarnings > 0) {
        userChoicePromise = vscode.window.showErrorMessage('glTF Validator found ' + result.issues.numErrors +
        ' errors and ' + result.issues.numWarnings + ' warnings.', SaveReport);
    } else if (result.issues.numErrors > 0) {
        userChoicePromise = vscode.window.showErrorMessage('glTF Validator found ' + result.issues.numErrors + ' errors.', SaveReport);
    } else if (result.issues.numWarnings > 0) {
        userChoicePromise = vscode.window.showWarningMessage('glTF Validator found ' + result.issues.numWarnings + ' warnings.', SaveReport);
    } else if (result.issues.numInfos > 0) {
        userChoicePromise = vscode.window.showWarningMessage('glTF Validator added information to its report.', SaveReport);
    } else {
        userChoicePromise = vscode.window.showInformationMessage('glTF Validator: Passed \u2714', SaveReport);
    }
    let userChoice = await userChoicePromise;
    if (userChoice !== SaveReport) {
        return;
    }

    // Compose a target filename
    let targetFilename = sourceFilename;
    if (path.extname(targetFilename).length > 1) {
        let components = targetFilename.split('.');
        components.pop();
        targetFilename = components.join('.');
    }
    targetFilename += '_report.json';

    if (useSaveAs) {
        const options: vscode.SaveDialogOptions = {
            defaultUri: vscode.Uri.file(targetFilename),
            filters: {
                'JSON': ['json'],
                'All files': ['*']
            }
        };
        let uri = await vscode.window.showSaveDialog(options);
        if (!uri) {
            return;
        }
        targetFilename = uri.fsPath;
    }

    // write out the final GLTF json and open.
    let reportString = JSON.stringify(result, null, '    ');
    fs.writeFileSync(targetFilename, reportString, 'utf8');

    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetFilename));
}