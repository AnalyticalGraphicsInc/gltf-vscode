import * as vscode from 'vscode';
import * as jsonMap from 'json-source-map';
import { GLTF2 } from "./GLTF2";

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
