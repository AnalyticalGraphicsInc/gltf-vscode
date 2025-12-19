// extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let validator: any;
try {
  validator = require('gltf-validator');
} catch (e) {
  console.error('gltf-validator not available');
}

export function activate(context: vscode.ExtensionContext) {
  console.log('KTX2HDR Extension is now active!');

  context.subscriptions.push(
    vscode.commands.registerCommand('ktx2hdr.openWebgpuDemo', () => {
      const panel = vscode.window.createWebviewPanel(
        'webgpuDemo',
        'WebGPU KTX2 Viewer',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      const readUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'read.js')
      );
      const scriptUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'main.js')
      );
      const shaderUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'shaders.wgsl')
      );

      const basisJsUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'basisu', 'basis_transcoder.js'));
      const basisWasmUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'basisu', 'basis_transcoder.wasm'));

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'validateGltf':
              await handleValidateGltf(panel, message.fileData, message.fileName, message.fileDir);
              break;
          }
        },
        undefined,
        context.subscriptions
      );

      const nonce = getNonce();

      // Load HTML templates from files
      const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'webview.html');
      const sidebarPath = vscode.Uri.joinPath(context.extensionUri, 'KTX2', 'media', 'sidebar-template.html');

      let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
      const sidebarHtml = fs.readFileSync(sidebarPath.fsPath, 'utf8');

      // Replace placeholders
      html = html
        .replace(/\{\{nonce\}\}/g, nonce)
        .replace(/\{\{cspSource\}\}/g, panel.webview.cspSource)
        .replace(/\{\{basisJsUri\}\}/g, basisJsUri.toString())
        .replace(/\{\{basisWasmUri\}\}/g, basisWasmUri.toString())
        .replace(/\{\{readUri\}\}/g, readUri.toString())
        .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
        .replace(/\{\{shaderUri\}\}/g, shaderUri.toString())
        .replace(/\{\{sidebarHtml\}\}/g, sidebarHtml.replace(/`/g, '\\`').replace(/\$/g, '\\$'));


      panel.webview.html = html;
    })
  );
}

async function handleValidateGltf(
  panel: vscode.WebviewPanel,
  base64Data: string,
  fileName: string,
  fileDir: string
) {
  if (!validator) {
    vscode.window.showErrorMessage('glTF Validator not installed');
    return;
  }

  try {
    console.log('Validating glTF file:', fileName);

    // Decode base64 to Uint8Array
    const binaryString = Buffer.from(base64Data, 'base64');
    const uint8Array = new Uint8Array(binaryString);

    // Validate
    const result = await validator.validateBytes(uint8Array, {
      uri: fileName,
      maxIssues: 0,
      writeTimestamp: false,
      externalResourceFunction: async (resourceUri: string) => {
        // For file input, we can't load external resources
        console.log('External resource requested:', resourceUri);
        throw new Error('External resources not supported for file input validation');
      }
    });

    console.log('Validation complete:', result);

    // Send results back to webview
    panel.webview.postMessage({
      command: 'validationResults',
      results: result
    });

    // Also show notification
    const issues = result.issues?.messages || [];
    const errorCount = issues.filter((i: any) => i.severity === 0).length;
    const warningCount = issues.filter((i: any) => i.severity === 1).length;

    if (errorCount > 0) {
      vscode.window.showErrorMessage(
        `glTF Validation: ${errorCount} error(s), ${warningCount} warning(s)`
      );
    } else if (warningCount > 0) {
      vscode.window.showWarningMessage(
        `glTF Validation: ${warningCount} warning(s)`
      );
    } else {
      vscode.window.showInformationMessage(
        `✓ Valid glTF: ${fileName}`
      );
    }

  } catch (error: any) {
    console.error('Validation error:', error);
    vscode.window.showErrorMessage(`Validation failed: ${error.message}`);
  }
}

export function deactivate() {}

function getNonce() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
