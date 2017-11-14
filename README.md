# glTF Extension for Visual Studio Code

[![GitHub issues](https://img.shields.io/github/issues/AnalyticalGraphicsInc/gltf-vscode.svg)](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues) [![Gitter chat](https://img.shields.io/gitter/room/AnalyticalGraphicsInc/gltf-vscode.svg)](https://gitter.im/gltf-vscode/Lobby) [![GitHub license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/AnalyticalGraphicsInc/gltf-vscode/blob/master/LICENSE.md) [![VS Code marketplace](https://vsmarketplacebadge.apphb.com/installs/cesium.gltf-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=cesium.gltf-vscode)

## Preview glTF 3D models directly in the editor

![Damaged Helmet by theblueturtle_](images/DamagedHelmetPan.gif)

Command name: `glTF: Preview 3D Model`, default keybinding: <kbd>ALT</kbd> + <kbd>G</kbd>

The above model, other sample models, and associated licenses can be obtained from the [glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Models) repository.

You can preview glTF files in a number of different rendering engines: BabylonJS, Cesium, and ThreeJS.  The ThreeJS engine will preview the saved model as opposed to the current content in your open VS Code tab.  The Babylon and Cesium engines will first try to preview what is currently in your tab, and only if that fails will it fall back on displaying the version of the model saved on disk.

## Import a binary `.glb` file as text-based `.gltf` and export text-based `.gltf` file to binary `.glb` file.

![GLB conversion](images/GlbConversion.png)

Command name: `glTF: Export to GLB (Binary file)`\
Command name: `glTF: Import from GLB`

The glTF 3D model format comes in two varieties: `*.gltf` is a JSON-based text file, easily editable with this VS Code extension.  `*.glb` is a binary version, typically smaller and self-contained, but not easily editable.

The `glTF: Export to GLB (Binary file)` command will export your text-based glTF from the editor to a binary `.glb` file.  In the exported version, whitespace in the JSON is stripped out, external file references are read in and converted to GLB binary chunks, and the resulting file becomes a self-contained transportable file that can be easily shared.

The `glTF: Import from GLB` command will convert a binary `.glb` to JSON-based `.gltf` for editing, creating separate files for each of the GLB binary chunks.  Note that during import, some filenames are calculated based on the target filename of the output `.gltf`.  For example, converting a sample file `Lantern.glb` to `.gltf` may create the following files:

* `Lantern.gltf` - The JSON structure.
* `Lantern_data.bin` - The binary mesh data
* `Lantern_img0.png` - Image file(s) extracted from the GLB's binary chunks
* `Lantern_img1.png`
* `Lantern_img2.png`
* `Lantern_img3.png`

The user is given a "Save As..." dialog for the base `.gltf` output filename only.  The other files are saved to the same folder with names calculated by appending to the user's selected base name, and any pre-existing files with the same name will be overwritten.

## Preview image files and data-URIs from inside the glTF document

![Sample image preview of normal map](images/SampleImagePreview.png)

Command name: `glTF: Inspect Data URI`, default keybinding: <kbd>ALT</kbd> + <kbd>D</kbd>

Above, the user is previewing a normal map that is part of the `BoomBox.gltf` model from the official sample model repository.  The preview works even if the filename is replaced by a `data: ...` formatted URI.  Place the document cursor on a dataURI, or on a block that has been folded closed with a dataURI in its `uri` field, then press <kbd>ALT</kbd> + <kbd>D</kbd> or look for the command `glTF: Inspect Data URI` in VSCode's list of commands (<kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd>) and use that.

If you plan to preview GLSL shader code, consider installing a 3rd-party syntax highlighter with support for the `*.glsl` extension, for example [Shader Language Support for VSCode by slevesque](https://marketplace.visualstudio.com/items?itemName=slevesque.shader), to enable syntax highlighting in shader previews.

## Convert files to and from Data URIs

![Sample conversion](images/Conversion.png)

In the list of commands (<kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd>), there are two commands named `glTF: Import file as Data URI` and `glTF: Export a Data URI to a file`.  To use these, place the document cursor on a block that contains a `"uri"` field.  If the value of this field is a valid filename, `Import` will load that file, encode it to base64, and replace the filename with the dataURI in your document.  `Export` is the reverse of this process, but first it will ask you for a filename to save to.  It will save the file in the same folder as the glTF file, so it does not need a path, just a name.  It will try to select an appropriate file extension based on the MIME type of the dataURI.  It will also warn you if you are about to overwrite an existing file.  If the save is successful, the dataURI will be replaced by the name of the newly created file.

## Tree View of Scene Nodes

Command name: `glTF: Tree View of Scene Nodes`

This displays a window with a tree view revealing the node structure of the glTF file.

## glTF Validation

Files can be validated three different ways:

* The official [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) runs automatically on glTF 2.0 files, and reports any issues it finds to the document's "Problems" window.  All such messages are marked with a `[glTF Validator]` prefix.  Check the bottom status bar for a small `x` in a circle next to a small `!` in a triangle, these show numbers of errors and warnings, respectively.  This goes far beyond simple JSON validation, as it reads in external data and image files, and looks at mesh data itself for structural errors.

* The same glTF Validator can also run as a manual process, by issuing the command `glTF: Validate a GLB or GLTF file`.  This can be done by right-clicking a file in the VSCode File Explorer sidebar, or just running the command stand-alone to open a file dialog.  This is the only method in this extension to validate GLB files directly, without conversion.  A summary of the validation report appears at the top, along with an option to save the JSON report.

* The glTF JSON schema is registered with VSCode for `*.gltf` files, and VSCode will find schema violations using its own JSON schema validation, without help from the glTF Validator.  This produces messages in the "Problems" window that *are not* marked `[glTF Validator]`.  This is less thorough than full glTF validation, but is the only method available to glTF 1.0 files.

## Other Features

### &bull; Tooltips for glTF enum values

Hover the mouse over a numeric enum to see its meaning.

![Hover tooltips](images/EmissionHover.png)

### &bull; Autocomplete for glTF enum values

Press <kbd>CTRL</kbd> + <kbd>SPACE</kbd> on a blank field to pop up a list of suggested values.  As you scroll through the list, the meaning of the selected value is revealed.

![Property autocomplete](images/PropertyAutocomplete.png)

This works for arrays as well, for example the list of enabled render states.  Here for example, a user is looking to enable a BLEND state.

![Render states enable](images/StatesEnable.png)

## Extension Settings

### Default rendering engines

* `glTF.defaultV1Engine` - Choose the default 3D engine that will render a glTF 1.0 model in the preview window.

* `glTF.defaultV2Engine` - Choose the default 3D engine that will render a glTF 2.0 model in the preview window.

### Reflection Environments

* `glTF.Babylon.environment` - Override the default reflection map for the BabylonJS glTF preview window.  This specifies a local path to a Babylon DDS environment file, such as one created by following steps in [Creating a DDS Environment File From an HDR Image](http://doc.babylonjs.com/overviews/physically_based_rendering#creating-a-dds-environment-file-from-an-hdr-image).

* `glTF.Three.environment` - Override the default reflection map for the ThreeJS glTF preview window.  There are 6 cube faces, with face names `posx`, `negx`, `posy`, `negy`, `posz`, and `negz`.  The rest of the path and filename should be identical for all 6 files.  The path and filename are specified as a single string, using `{face}` in place of the face name.  The files must be in a format usable on the web, such as PNG or JPEG.

### File Creation

* `glTF.alwaysOverwriteDefaultFilename` - Certain commands create new files, such as importing and exporting GLBs, exporting a DataURI, and creating a glTF Validation report.  When `true` these files will be saved with their default names, which saves the step of interacting with a file dialog each time, but does make it trivial to overwrite existing files.  It's safer to leave this set to `false`.

### Automatic glTF Validation (only)

* `glTF.Validation.enable` - When true, automatically run the glTF Validator and report any found issues to the document problems window.

* `glTF.Validation.debounce` - The number of milliseconds to wait for multiple automatic requests to re-validate a glTF document.

### Automatic and Manual glTF Validation (shared settings)

* `glTF.Validation.maxIssues` - Controls the maximum number of issues reported by the Khronos glTF Validator (not counting any messages produced by VSCode's own JSON schema validation).

* `glTF.Validation.ignoredIssues` - Array of issue codes to ignore during validation.  The issues should be listed in the array by issue code, such as `ACCESSOR_INDEX_TRIANGLE_DEGENERATE` and `NODE_EMPTY`. See [ISSUES.md](https://github.com/KhronosGroup/glTF-Validator/blob/master/ISSUES.md) for the full list, or run a manual glTF Validation of an existing file with messages reported to see their codes.  For example, to completely disable reporting of empty nodes, one would use: `[ "NODE_EMPTY" ]`

* `glTF.Validation.severityOverrides` - This is a JSON object that maps issue codes (as keys) to severity codes (as values).  The issue codes are the same as for `glTF.Validation.ignoredIssues` above.  The severity codes are: 0 for `error`, 1 for `warning`, 2 for `information`, and 3 for `hint`.  For example, to reduce the severity of empty nodes to `hint`, one would specify: `{ "NODE_EMPTY" : 3 }`

## Source code

on [GitHub](https://github.com/AnalyticalGraphicsInc/gltf-vscode).  See [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgements

This extension makes use of the following open source projects:

 * [Cesium](https://github.com/AnalyticalGraphicsInc/cesium) - One of the 3D engines used in the preview window
 * [Babylon.js](https://github.com/BabylonJS/Babylon.js) - One of the 3D engines used in the preview window
 * [Three.js](https://github.com/mrdoob/three.js/) - One of the 3D engines used in the preview window
 * [Knockout](http://knockoutjs.com/) - Used to data-bind preview window's menu

## License

Apache 2.0, see [LICENSE.md](LICENSE.md).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
