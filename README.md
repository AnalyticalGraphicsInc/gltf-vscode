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

### &bull;  Preview embedded dataURIs

Place the document cursor on a dataURI, or on a block that has been folded closed with a dataURI in its `uri` field, then press <kbd>ALT</kbd> + <kbd>D</kbd> or look for the command `Inspect Data URI` in VSCode's list of commands (<kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd>) and use that.

* Previewing embedded shaders works, but the shader previews are read-only (for now)
* Previewing embedded JPG and PNG images works.
* Previewing buffer data is not (yet?) supported.

Note that previewed shaders are displayed with a `.glsl` file extension.  It is recommended that you install a 3rd-party syntax highlighter with support for `*.glsl`, for example [Shader Language Support for VSCode by slevesque](https://marketplace.visualstudio.com/items?itemName=slevesque.shader), to enable syntax highlighting in shader previews.

Note that many dataURIs are quite long and can look bad in the editor.  Hover your mouse over the line numbers in the left margin to reveal little "`-`" icons that can fold closed blocks of JSON.  Fold closed the innermost block containing the `uri` field.  You can still select the name of the block that got folded and press <kbd>ALT</kbd> + <kbd>D</kbd> to preview the contents of that uri without unfolding it.

## Extension Settings

This version of the extension does not offer any user-defined settings.

## Source code

on [GitHub](https://github.com/AnalyticalGraphicsInc/gltf-vscode).  See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0, see [LICENSE.md](LICENSE.md).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
