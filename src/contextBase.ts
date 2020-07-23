import * as vscode from "vscode";
import * as path from 'path';

export abstract class ContextBase {
    protected readonly _context: vscode.ExtensionContext;
    private readonly _extensionRootPath: string;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._extensionRootPath = this._context.extensionPath;
    }

    protected get extensionRootPath(): string {
        return this._extensionRootPath;
    }

    protected getConfigResourceUrl(section: string, name: string, localResourceRoots: Array<vscode.Uri>): string {
        let value = vscode.workspace.getConfiguration(section).get<string>(name);

        if (value.startsWith('{extensionRootPath}')) {
            value = path.join(this._extensionRootPath, value.replace(/^{extensionRootPath}\/?\\?/, ''));
        }

        localResourceRoots.push(vscode.Uri.file(path.dirname(value)));
        return value;
    }
}
