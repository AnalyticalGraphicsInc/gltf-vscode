import * as vscode from "vscode";
import { toResourceUrl } from "./utilities";

export abstract class ContextBase {
    protected readonly _context: vscode.ExtensionContext;
    private readonly _extensionRootPath: string;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._extensionRootPath = `${toResourceUrl(this._context.extensionPath.replace(/\\$/, ''))}/`;
    }

    protected get extensionRootPath(): string {
        return this._extensionRootPath;
    }
}
