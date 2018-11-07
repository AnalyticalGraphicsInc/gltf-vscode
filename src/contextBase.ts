import * as vscode from "vscode";
import * as path from 'path';
import { toResourceUrl } from "./utilities";

export abstract class ContextBase {
    protected readonly _context: vscode.ExtensionContext;
    private readonly _extensionRootPath: string;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._extensionRootPath = `${toResourceUrl(this._context.extensionPath)}/`;
    }

    protected get extensionRootPath(): string {
        return this._extensionRootPath;
    }

    protected getConfigResourceUrl(section: string, name: string, localResourceRoots: Array<vscode.Uri>): string {
        const value = vscode.workspace.getConfiguration(section).get<string>(name);

        if (value.startsWith('{extensionRootPath}')) {
            return value.replace(/^{extensionRootPath}/, this._extensionRootPath);
        }

        localResourceRoots.push(vscode.Uri.file(path.dirname(value)));
        return toResourceUrl(value.replace(/\\/, '/'));
    }
}
