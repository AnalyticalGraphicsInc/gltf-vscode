/* --------------------------------------------------------------------------------------------
 * Some portions copied from lsp-sample:
 * https://github.com/Microsoft/vscode-extension-samples/tree/master/lsp-sample
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments, TextDocument,
    Diagnostic, DiagnosticSeverity, InitializeResult, CompletionItem,
    TextDocumentPositionParams, Hover, MarkedString, Range
    //TextDocumentPositionParams, CompletionItemKind
} from 'vscode-languageserver';
import * as path from 'path';
import * as Url from 'url';
import * as fs from 'fs';
import * as jsonMap from 'json-source-map';
import * as gltfValidator from 'gltf-validator';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let documentsToValidate: TextDocument[] = [];
let debounceValidateTimer: NodeJS.Timer;
const debounceTimeout = 500;

function tryGetJsonMap(textDocument: TextDocument) {
    try {
        return jsonMap.parse(textDocument.getText());
    } catch (ex) {
        console.warn('Error parsing glTF document.  Please make sure it is valid JSON.');
    }
    return undefined;
}

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell it we provide hovers
            hoverProvider: true
            // Tell the client that the server support code complete
            //completionProvider: {
            //    resolveProvider: true
            //}
        }
    }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    scheduleValidation(change.document);
});

// The settings interface describe the server relevant settings part
interface Settings {
    glTF: GltfSettings;
}

interface GltfSettings {
    Validation: ValidatorSettings;
}

interface ValidatorSettings {
    maxNumberOfProblems: number;
}

// hold the maxNumberOfProblems setting
let maxNumberOfProblems: number;
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
    let settings = <Settings>change.settings;
    maxNumberOfProblems = settings.glTF.Validation.maxNumberOfProblems || 100;
    // Schedule revalidation any open text documents
    documents.all().forEach(scheduleValidation);
});

function scheduleValidation(textDocument: TextDocument): void {
    const lowerUri = textDocument.uri.toLowerCase();
    if (lowerUri.startsWith('file:///') && lowerUri.endsWith('.gltf')) {
        console.log('schedule ' + textDocument.uri);
        if (documentsToValidate.indexOf(textDocument) < 0) {
            documentsToValidate.push(textDocument);
        }
        if (debounceValidateTimer) {
            clearTimeout(debounceValidateTimer);
            debounceValidateTimer = undefined;
        }
        debounceValidateTimer = setTimeout(() => {
            documentsToValidate.forEach(validateTextDocument);
            documentsToValidate = [];
        }, debounceTimeout);
    }
}

const _driveLetterPath = /^\/[a-zA-Z]:/;

// From: https://github.com/Microsoft/vscode/blob/f2c2d9c65880e44b588a0e1916423b691fff01d3/src/vs/base/common/uri.ts#L357-L374
function getFsPath(uri) {
    const url = Url.parse(uri);
    const urlPath = decodeURIComponent(url.path);
    let value: string;
    if (url.auth && urlPath && url.protocol === 'file:') {
        // unc path: file://shares/c$/far/boo
        value = `//${url.auth}${urlPath}`;
    } else if (_driveLetterPath.test(urlPath)) {
        // windows drive letter: file:///c:/far/boo
        value = urlPath[1].toLowerCase() + urlPath.substr(2);
    } else {
        // other path
        value = urlPath;
    }
    return path.normalize(value);
}

function validateTextDocument(textDocument: TextDocument): void {
    console.log('validate ' + textDocument.uri);

    const fileName = getFsPath(textDocument.uri);
    const baseName = path.basename(fileName);

    const gltfData = Buffer.from(textDocument.getText());
    const folderName = path.resolve(fileName, '..');

    gltfValidator.validateBytes(baseName, new Uint8Array(gltfData), (uri) =>
        new Promise((resolve, reject) => {
            uri = path.resolve(folderName, uri);
            fs.readFile(uri, (err, data) => {
                console.log("Loading external file: " + uri);
                if (err) {
                    console.warn("Error: " + err.toString());
                    reject(err.toString());
                    return;
                }
                resolve(data);
            });
        })
    ).then((result) => {
        let diagnostics: Diagnostic[] = [];
        const map = tryGetJsonMap(textDocument);
        if (!map) {
            diagnostics.push(getDiagnostic({ message: 'Error parsing JSON document.' }, {}, DiagnosticSeverity.Error));
        } else {
            let problems = 0;
            if (result.errors) {
                problems = convertErrorsToDiagnostics(diagnostics, problems, map, result.errors, DiagnosticSeverity.Error);
            }
            if (result.warnings) {
                convertErrorsToDiagnostics(diagnostics, problems, map, result.warnings, DiagnosticSeverity.Warning);
            }
        }
        // Send the computed diagnostics to VSCode, clearing any old messages.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }, (result) => {
        // Validator's error
        console.warn('glTF Validator had problems.');
        console.warn(result);
    });
}

connection.onDidChangeWatchedFiles((_change) => {
    // Monitored files have change in VSCode
    connection.console.log('We recevied an file change event');
});


function convertErrorsToDiagnostics(diagnostics: Diagnostic[], problems: number, map: any, errors: any, severity: DiagnosticSeverity) : number {
    for (let category in errors) {
        if (errors.hasOwnProperty(category)) {
            let errorList = errors[category];
            let len = errorList.length;
            for (let i = 0; i < len; ++i) {
                let info = errorList[i];
                if (info.message) {
                    if (++problems > maxNumberOfProblems) {
                        break;
                    }
                    diagnostics.push(getDiagnostic(info, map, severity));
                }
            }
        }
    }

    return problems;
}

function getDiagnostic(info: any, map: any, severity: DiagnosticSeverity) : Diagnostic {
    let range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: Number.MAX_VALUE }
    };

    if (info.path) {
        const pointerName = info.path.substring(1);
        if (map.pointers.hasOwnProperty(pointerName)) {
            const pointer = map.pointers[pointerName];
            const start = pointer.key || pointer.value;
            range.start.line = start.line;
            range.start.character = start.column;

            const end = pointer.valueEnd;
            range.end.line = end.line;
            range.end.character = end.column;
        }
    }

    return {
        code: 'Some code',
        severity: severity,
        range,
        message: info.message,
        source: 'glTF Validator'
    };
}

connection.onHover((textDocumentPositionParams: TextDocumentPositionParams): Hover => {

    //let document = documents.get(textDocumentPositionParams.textDocument.uri);
    //let jsonDocument = getJSONDocument(document);
    //return languageService.doHover(document, textDocumentPositionParams.position, jsonDocument);

    let position = textDocumentPositionParams.position;
    /*
    let offset = document.offsetAt(position);
    let node = doc.getNodeFromOffset(offset);
    if (!node || (node.type === 'object' || node.type === 'array') && offset > node.start + 1 && offset < node.end - 1) {
        return this.promise.resolve(void 0);
    }
    let hoverRangeNode = node;

    // use the property description when hovering over an object key
    if (node.type === 'string') {
        let stringNode = <Parser.StringASTNode>node;
        if (stringNode.isKey) {
            let propertyNode = <Parser.PropertyASTNode>node.parent;
            node = propertyNode.value;
            if (!node) {
                return this.promise.resolve(void 0);
            }
        }
    }
    */

    let hoverRange = Range.create(position, position);

    let contents: MarkedString[] = [
        "Test Hover image ![testing](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHYAAAAeCAYAAAD5AOomAAAQWUlEQVR42u1beXxOxxpudrEktkbUkriI4lZpq5JbW6pJuFG0qrFeexVRak3TBm3RUgS1hFhrCdKgQWKLrUGQBiVBJMgiq0Qiuyxzn/fzTu74ZPnS9nfrj4zf8/ty5sw7M+c8824zx0svVa3oAfqAAWAIGAHGCoy43oDb6TGqywta9JgsIq4GUAswB+oDDRXU5/ragCm3N6gm+MUkVJ+1kAg1AyyA5oAN8BrQCXiTfzsArwLWgCVQF6jJBOtXk/tikWrMGkiEtgTeAOyBfsAQS0vL8YMHD/aws7ObiuthwAeAA/A20AZozAvCRNHe6vI3k2rCprUp8DoR1qVLF1c/P7+A5OTkhyUlJaKwuETkPSkRBUUlgkpmZmbW2bNnQyZOnLgA7Z2BzkALNtM1qsl9MTSVSLUCugADAwMDTxKZVI7cfCw8DiWK6fselMLtlwSxJyxDPM4vFsXFxSWRkZFRkBsOdAdaAw2qyf37ij77RDMm1a5evXojY2NjH5BW7ruaIab4xotPd8cJV/xO0cKkPXGae97n0kR6TpHIzs7O7d279xdsvoncemwJqn3u/1lbDTnqfYXN6JCUlJS03CfFwt0/4TkiK8IEEBydWiBIy21tbaejr24cWJlpBVT6ShpVFvS10iddZP6MbFkyqpw2Kor6K5P9M33onG1Iv0omsz3Q//79+7HpuUViDsys697KyZy89ynk9Wc/x4u7DwvE48ePs2mRcARtqUTLRjxmDa6rpYWanDqZKHmyzJ+lTFlyUrZGGbIm3GdF49VQcnMjZUwTJW83Ua4NtayQmlEYKW1NlOc11RrLoAxLpqdYUSmnPlOlbk1qa21OZ7ovX758E/lTz1MpOmvp5gvp4qeL6c8sAjLNOQXF4sKFC6Hotw+nSrR46rAfb8hkN+WxVTTlyPplNuNmDArGGgFNgGZloClbHQtua8bj1eW+GnObZspY2nL1WKaOkreraKDk7jXLsEJGXG+u1b4Bz/0VZayyUkO5f2DCc5DvyZL/1inb0ONVU5+1dSBMcHrIvRwNMbqQ6u6fKGSZ4POszFaQDZNc0q9fvzkcjFkzKf/gfJjSo3c40OrBoL+7cvvXeUFYM17l1MuOTbxEV8a/uE8pZ8Ww4bouPJ62bFlyzXmebRg2jLY8jxa8WGopxEiX9jLff1Vp357zfluefyeOPxpp9WHAGl2fn/k1do+Ef/K86lYWs+hzJ7SSbXv06OFGAfAMRLtlBUjkPyfuidMyw3Fi37UM8TMCLFVj6W9qW1BYIg4ePBjEWkukdCTyZsyYMcvX13f7iRMnDv36669B0OxTBKRNx4OCggIPHDiwa+XKld+j7Xv84v/l4+Oz6PLlywHnzp07Su0gdyw4OPgYXQNHzp8/f+TixYuHw8LCDuDeGiaLXqLj6tWrlyLC9ztz5gy1PwEcV3AU89i3detWT2NjYyeWedvLy2va77//7hcREeHfsWPH91HX6/r16/7h4eH+6H+ZVtQvN3ToujXm9wPJYS6+FhYWzggmh4eGhh6hsTHnE/j7eN++fQczWY1Yc6WrIVJb0SLEu9iJ93I0JCTkKMY+PHLkSGe2MLV5TL3ytgxr88pwuHLlyvXY9CcaH6mSR5HwwRuPRWZekTgXnfPcfW0QqfMDk0Qc+nqCnDc+Pj6FNzJoE+PfeDEXhQ6FtD0rKyu9Tp06LpAbBN9/S+hYEJmnck79EazQA5myVTKeyM/Pp7jgI2AAXv4JeW/AgAGzUTdKXj969CiOF04T1jhj/qXrzrgfQ+0KUdq1azdt6tSpntrjxcTEUGroyBrdkLmoy3x0HT9+vIe2zIoVK9y5fT0eU688/2rOJqY/bTRcjsl5hqRPYF5P38nSdJrwMErzezMpX1NfHrELjiQ9fbl56SIjO5leViH6nwwMnjZt2gL5EmWh/Lf4f+U5BtauXbsJshPu3LkTLQl/+PBhVmpqagZ+HxHS0tLSCShpGRkZqXhp12i8RYsWrVP7wr1ctM9E2wy0lch88uRJoWwTFRV1A7JjoVnBss7BwWEJ6ubIa/SRgOt32VybKduvZILtMbd4JraoZcuWC8eMGbNN+7noWTt06DCVXUIL9rtNOdj8uABFW+bbb7/9js34y4o5fo5YI14h7QwNDV1yc3MLAsIfP0PS9kvpmg6Db+wXn6/pKrwOztBcn7mTXWbEPHlPvMguKBFFxYXiq819hZu3k6Y9xpgFjN+xY8cBOcmkpKQ0rh8HDCUieHNjHExgmGwHQomkKbdu3bpP10VFRcU2NjZ7UbcKWATMB74C3IBpSn8jTp48eVb2k5iYSNq4BVjJcl8zFrq5ue3Py8vLB/Kg4USa6+nTp0OkLNwUmfYFckGiTRJZH1YKc3Zp5mye+yQnJydQOyyYImtr65XDhw/3lX2B7BJlgaSxhXiL+6K99z4wwadkG/RRLP/28PBYxpaiES+mcokllW4PczcUz1Twy++ZpSTRrhJtUCSnx4gvNzkL9419xBfevUVIxEHNIEuDUp4j90ZCHjSqUHj+/AnaOmnkmFgyIa6Y8Hk5SScnp6VMwLs82Tc5wOkJv9Tfz89v3f79+73xMPTyJyrEloCI8+PGjTs0adIkX1dXVx+Yuu2ff/75tlmzZm1A+xUDBw6kHHo4/GqQHA8Lt9DT0/OSu7v70SlTpuwdMmTIFhC2tlmzZivQ9geAtOFLgLRoGhbFJSnbrVu3DahbrEXs+4pZrMm/FGj1xaJNlMRaWVmtGTZs2D7ZV3R0dA6sWJG8Riayhd1GNzbNo0nTpWWbP3/+dYXY5fyOLCsjti5Hbh/hwfODbmeVkkS5rCgpFgt2DNaQKjHTy16kZsRpBpp1IKE0uNoSkqapO3llp2YBUFuPLf01Jgf9007UFAQCv8lJmpubf4Y6J478rNgMWfHL6cRBE+1e9SXTKInVpdy7d+8KmbOhQ4d+rasMLRjML5xMLlkSBFShCrEbiXxJLDQymQ8/2rN/lKkJXQ+AdUiSxDZv3nydSuzNmzczQWaEvIZbeESuhhf5mLt375Y+Z0BAQDQW7Dl5PXfu3KW6EGvIfoEisL6Ya+p1aBz5z/N3czQdbQ5w12ieSizhu13DEPHmajYiKDXyPJmiaX8t6pSYs8FB04bM8ObAL2ijIg/9zyCtU4lFBDqJA6p2nE/KPLMVmyRbToGcq0osAq0rrFEu8Eve5IfJhOsiCxN8FXJzjx07FqYQ6426JZJYaGQKu463eO4W/EvXLiqx0Ni1MMV+ig9PR5ut0PosWbd582bKHL50cXHZIOMMGqtJkybrQWZpEDdv3rwfdCHWgCM5yo3s/f39j9G8H2Y/tRKXbgUItw2Oz5EqSfMJWvT0dCefA5PsVPHNTx+VtpkFzb4Ve0ncuHHjLq/I0UhJSv1W27Zt57F/6cpp0Gv8awfz6Lxq1ar5P/7448KxY8eSH/5UNcUffPBBQKdOnTZ37tx5la2t7VI7O7vv33nnnYUwrR6Ojo7TEIm6sFkjckfxwvIAaMyvTE1NPRC4LEFQtAH9+yOVSFYiXvLFC48ePXpF1nXv3n09mWqF2Ie4/oTHeIM19Q2+/iQhISFVIXb1iBEj9irWhCL2pXPmzPlF9aOoW4+gL13W7d69+ywtMASApe1glhez2yqXWJnH1uDVRv5tpMY0PE4Qu4IWlkmoNlb6TRKRcaHiQoS/+Ir9sMTCnYM1q27NmjW+tIqJxMOHDwfISe7bty8YdZ8pZ7r9aZOEruE7F2lFqZ+pwRNI8WG/SGTNZuKm8gIawlrusGDBgi+wsEJ+Q8Fq38W+fg7LkHv4hoKwUaNGlWoFLEwuEatqrL29PQVq86TW5+Tk5LP8aDK9PN4AvnaXPhKBbSEW6bLRo0fvkH3FxsYmcaA3m6JzWR8ZGVlKKmUoHAhORFywSysqfqui4Enbz1JE5nz16tXwrNx0nUh9Gkw5QTPfFbPX93pWo6Hpp6740EqkVOc/lNzTZgM0cKVq9qAdmSlPS5IEHjaN8h7Z5iAKpUt48LsyTYCGPcBc7+L3DvLi2xEREYSbt2/fDkdwci0sLOwwRZfbt29frmhFIdpEgehIkqFfRN9RQAzmkSvbQdvIzLqdOnWqNN+GFaAoeircVYr68rHoohG138KYN+mXji1Rny1NKeKWXDMzM/cJEyZskHIPUMiX0ntp06aNm5riSYsA0+zLpn6Ql5fXRnl/8eLFX7NVsygv3VHNcU3ev+xC23800NlrvqUBUFVBckv3jNZMBNHnSvajr/OEHLDaM3X1lSCjoFGjRmRKhyGoiKziBgWZRWf0kSeqUGbOnOlJmod44Iys+/DDD8kiuMAULlMXXWUFUfkhIhB9LpZ1WBwxHBDSexmIBXFTlcHCeMQuqidh586dK+S91atXu3EkXp83KPQrOt0xZq2loMVh2bJlmmT6+OVt0MT3qkiqk1jsM0LkFWQL0iI2rx2UjXfyo73gPzZCu64iyIhHYJMMJU2RoJ0ikBiOiNBn0KBBY/gB7UNDQ3/B/QTcT1SRmpqaQEA/D3A/HtoXGxcXd07uy3bt2nUQSPKHJkbLthIsnwifGY/5/oZ0gnxwb5ojTPG6jIyMGCySBCz4gTJKnz59+szg4OBAjBEFkuIg+wxQojHXszD983hx9Zw8efI4EBZHgFYHsjnV7JdjfkMw50R+hnikauM4QKJspb23t/dkuAeaR9ySJUuG8Lusw9ZWr7KvEU15N4P2Lt9HZKjZdTkeuk3MRcpSVmT8DKEbe2vaePlPFyX4B8IoHfiYH6AJJ+/m7PRtuL47r9revJfch/92YDK78Hxas0xHDrTeU2R6c8rkWIZcK/5mqx1vondnWUeWUdGL++7EL9SG5Tooc2ihFbH3VPpzVOZgz4ugI6durVjLpNV6lRd5Y/5tx3Puxv3Kzf5G3KaFcpjQvCqfHKmH7Y15An3hqDeRWaZo1+fkIjFjXQ9NKiNNNJFJvpR87JLdI8X95HCNj6CjOtrJ4uituXLUZKwk8pbKCUpr5fSkNZNhxe6hIbeXR3bNFBlttOKX0Izb1mfZhtyXFcu20kFOfmZrwQteHtXJI8AmvKfbUulPLiRrTtvk8WFdPhyw4P4b8DupxZrXgOfXTHnmOvyu5P6x/NxX7nIZVuXA3Yg7asyrxoG+RER4HoMorzj/SY64ijw18OIm4Xd2uTh4fq04f+OASEy7pyGUvrqYPXv2CvYfb/JEzbUOlA342lR5MDNFo+UZam1+MBPlgNuU69X25mXI1lIO6qVsTUXWrAK5GloH49qH3Ophf21l/mZlzL2G1gG9aTkfEJgoHwDU1LpvqIxZ0eG8TuTKM8VWbCKcoYGj1q1btwehegJtPVIuSVEmnd8iQDhtbW3tamxs/CGbs7a8OOooDr68z1QMlQdUH0b7kxX1sxbDSmBQzqcoBpXIGJQjo/1ZSmVzqaivyvozqOB96f+Z78b0lLPFumwabFgDe3K+NpDz0kH8rXEvNrttWUvr6/DRuJ6O+CMyf0a2Ku+pqn390Xt/6QduBopPNFe2zFrJaI2dfmv2XZbsz2op5qL6v3m8oF8vqv9/R/oB+Q1RPf41U3yT0R+x/9Xlryn/BY268qsf3smdAAAAAElFTkSuQmCC)",
    ];
    let result: Hover = {
        contents: contents,
        range: hoverRange
    };
    return result;
});


/*
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: 'TypeScript',
            kind: CompletionItemKind.Text,
            data: 1
        },
        {
            label: 'JavaScript',
            kind: CompletionItemKind.Text,
            data: 2
        }
    ]
});
*/

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
        item.detail = 'TypeScript details',
            item.documentation = 'TypeScript documentation'
    } else if (item.data === 2) {
        item.detail = 'JavaScript details',
            item.documentation = 'JavaScript documentation'
    }
    return item;
});

/*
connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VSCode.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.
    connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VSCode.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VSCode.
    // params.uri uniquely identifies the document.
    connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();
