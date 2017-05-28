# glTF Extension for Visual Studio Code

[![GitHub issues](https://img.shields.io/github/issues/AnalyticalGraphicsInc/gltf-vscode.svg)](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues)
[![Gitter chat](https://img.shields.io/gitter/room/AnalyticalGraphicsInc/gltf-vscode.svg)](https://gitter.im/gltf-vscode/Lobby)
[![GitHub license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/AnalyticalGraphicsInc/gltf-vscode/blob/master/LICENSE.md)
[![VS Code marketplace](https://vsmarketplacebadge.apphb.com/installs/cesium.gltf-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=cesium.gltf-vscode)

This extension adds features for previewing and editing 3D models in [glTF files](https://github.com/KhronosGroup/glTF).

The glTF standard is maintained by [the Khronos Group](https://www.khronos.org/), the same standards body behind OpenGL and WebGL.  They describe glTF as follows:

> glTF™ (GL Transmission Format) is a royalty-free specification for the efficient transmission and loading of 3D scenes and models by applications. glTF minimizes both the size of 3D assets, and the runtime processing needed to unpack and use those assets. glTF defines an extensible, common publishing format for 3D content tools and services that streamlines authoring workflows and enables interoperable use of content across the industry.

## Extension Features

### &bull; Registers `*.gltf` files as JSON schema

Uses the glTF 1.0 schema, and will warn for invalid or missing fields.

### &bull; Tooltips for glTF enum values

Hover the mouse over a numeric enum to see its meaning.

![Hover tooltips](images/EmissionHover.png)

### &bull; Autocomplete for glTF enum values

Press <kbd>CTRL</kbd> + <kbd>SPACE</kbd> on a blank field to pop up a list of suggested values.  As you scroll through the list, the meaning of the selected value is revealed.

![Property autocomplete](images/PropertyAutocomplete.png)

This works for arrays as well, for example the list of enabled render states.  Here for example, a user is looking to enable a BLEND state.

![Render states enable](images/StatesEnable.png)

### &bull;  Preview whole glTF files

Press <kbd>ALT</kbd> + <kbd>G</kbd> on your glTF file, or look for the command `Preview 3D Model` in VSCode's list of commands (<kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd>) and use that.

The Babylon.js and Three.js engines will preview the saved model as opposed to
the current content in your open VS Code tab.  The Cesium engine will first try
to preview what is currently in your tab, and only if that fails will it fall
back on displaying the version of the model saved on disk.

#### glTF compatibility and sample models

There are some [sample glTF 1.0 models online](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/1.0) that can be downloaded, and each model comes in several flavors.  Currently this extension can be used to edit (and preview) all the text-based versions (`*.gltf`), not binary versions (`*.glb`).

### &bull;  Preview embedded dataURIs

Place the document cursor on a dataURI, or on a block that has been folded closed with a dataURI in its `uri` field, then press <kbd>ALT</kbd> + <kbd>D</kbd> or look for the command `Inspect Data URI` in VSCode's list of commands (<kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd>) and use that.

* Previewing embedded shaders works, but the shader previews are read-only (for now)
* Previewing embedded JPG and PNG images works.
* Previewing buffer data is not (yet?) supported.

Note that previewed shaders are displayed with a `.glsl` file extension.  It is recommended that you install a 3rd-party syntax highlighter with support for `*.glsl`, for example [Shader Language Support for VSCode by slevesque](https://marketplace.visualstudio.com/items?itemName=slevesque.shader), to enable syntax highlighting in shader previews.

Note that many dataURIs are quite long and can look bad in the editor.  Hover your mouse over the line numbers in the left margin to reveal little "`-`" icons that can fold closed blocks of JSON.  Fold closed the innermost block containing the `uri` field.  You can still select the name of the block that got folded and press <kbd>ALT</kbd> + <kbd>D</kbd> to preview the contents of that uri without unfolding it.

### &bull;  Import and export embedded dataURIs

In the list of commands (<kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd>), there are two commands named `Import file as Data URI` and `Export a Data URI to a file`.  To use these, place the document cursor on a block that contains a `"uri"` field.  If the value of this field is a valid filename, `Import` will load that file, encode it to base64, and replace the filename with the dataURI in your document.  `Export` is the reverse of this process, but first it will ask you for a filename to save to.  It will save the file in the same folder as the glTF file, so it does not need a path, just a name.  It will try to select an appropriate file extension based on the MIME type of the dataURI.  It will also warn you if you are about to overwrite an existing file.  If the save is successful, the dataURI will be replaced by the name of the newly created file.

## Extension Settings

* `glTF.defaultV1Engine` - Choose the default 3D engine that will render a glTF 1.0 model in the preview window.

* `glTF.defaultV2Engine` - Choose the default 3D engine that will render a glTF 2.0 model in the preview window.

## Source code

on [GitHub](https://github.com/AnalyticalGraphicsInc/gltf-vscode).  See [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgements

This extension makes use of the following open source projects:

 * [dat.GUI](https://github.com/dataarts/dat.gui) - Used for rendering the preview window's menu
 * [Cesium](https://github.com/AnalyticalGraphicsInc/cesium) - One of the 3D engines used in the preview window
 * [Babylon.js](https://github.com/BabylonJS/Babylon.js) - One of the 3D engines used in the preview window
 * [Three.js](https://github.com/mrdoob/three.js/) - One of the 3D engines used in the preview window

## License

Apache 2.0, see [LICENSE.md](LICENSE.md).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
