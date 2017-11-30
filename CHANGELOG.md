# Change Log

### 2.1.2 - UNRELEASED

* Hover shows a snapshot of textures and colors
* Definition provider allows navigation on any index reference
* View buffer data provided by Accessor (Go to Definition (F12))
* Changed viewing texture data to match VSCode inline viewer.
* Updated to latest glTF Validator and glTF schemas.
* Clarified error sources, from glTF Validator vs glTF Language Server.

### 2.1.1 - 2017-11-15

* Fixed an issue where glTF commands sometimes wouldn't be available.

### 2.1.0 - 2017-11-14

* Integrated Khronos glTF Validator
* Recreated TreeView as an Explorer outline view that can navigate the glTF document.
* Added an optional icon to the top toolbar to activate the glTF 3D preview.  Can turn this off in settings.

### 2.0.9 - 2017-11-06

* Fixed bug where a small error could slip into a `.glb` file due to a missing `byteOffset` value in a `.gltf` file.

### 2.0.8 - 2017-11-04

* Added an option to import a`.glb` binary package file.
* Default camera view in all three engines updated for glTF's new +Z forward convention for models.
* Model is automatically sized and centered in all three engines now.
* Updated logo for Babylon.js.
* Revealed more error messages from Babylon and Cesium.

### 2.0.7 - 2017-10-28

* Added an option to export the glTF to a `.glb` binary package file. (Shift+Alt+S E)
* Created a new preview pane that shows the scene node tree.
* Added menu items for previews.

### 2.0.6 - 2017-10-12

* Replaced UI with a Knockout data-bound UI, to allow more per-engine configurability.
* Added animations panel to Cesium preview, with options to toggle individual animations.
* Re-import glTF schemas from Khronos glTF GitHub repo, only minor tweaks.

### 2.0.5 - 2017-08-01

* Update Cesium to 1.36, which adds glTF 2.0 support to the Cesium preview window.

### 2.0.4 - 2017-07-24

* Update Babylon preview to latest v3.1 preview
* Add reflection maps to BabylonJS and ThreeJS previews
* Added message for glTF files that are too large for VSCode's extension host.

### 2.0.3 - 2017-06-12

* Update Babylon preview to preview current tab content instead of saved file content, like the way Cesium preview works.

### 2.0.2 - 2017-06-06

* Updated Cesium engine to 1.34 and leveraged the new [`basepath`](https://github.com/AnalyticalGraphicsInc/cesium/issues/5320) option in `Cesium.Model.fromGltf`.
* Updated Babylon.js engine to get a [tangent fix](https://github.com/BabylonJS/Babylon.js/pull/2222).
* Re-imported the glTF 2.0 schema now that it is final.  Mostly just minor changes to wordings of a few descriptions.

### 2.0.1 - 2017-06-01

* Update Babylon engine to fix glTF 1.0 support.
* Add some forgotten items to the 2.0.0 notes below that were already released.

### 2.0.0 - 2017-05-30

* Support for glTF 2.0 file preview and 2.0 schema validation added.
* Multiple 3D rendering engines now available for the preview window (Cesium, Babylon.js and Three.js)
* Users can set their default 3D rendering engine in preferences.
* glTF schema long descriptions used in hover popups for both 1.0 and 2.0.
* The glTF preview window automatically reloads after saving a glTF file.

### 1.0.5 - 2017-05-20

* Normal (non-embedded) glTF files can now be previewed.
* Multiple preview windows can now be opened at the same time.

### 1.0.4 - 2017-05-06

* Data preview (<kbd>alt</kbd> + <kbd>d</kbd>) works with external files now.
* DataURIs can be imported and exported with new vscode commands.

### 1.0.3 - 2017-03-21

* Fleshed out README information, added notes about glTF compatibility.
* Tweak schema import script to remove "type" on enums (so vscode doesn't suggest `0` as default value for enums that don't accept zero).
* Update icon again.

### 1.0.1, 1.0.2 - 2017-03-19

* Added icon, updated icon.

## 1.0.0 - 2017-03-19

* Initial release
