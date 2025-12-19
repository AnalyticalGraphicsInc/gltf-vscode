# Change Log

### 2.6.0 - UNRELEASED

* Added “Open KTX2 Viewer” button to the glTF preview panel.
* Integrated a fully featured WebGPU-powered KTX2 viewer with:
  * Tonemapping controls:
    * Reinhard
    * Hable (ACES approximation)
    * ACES2025-1
  * Texture filtering modes:
    * Trilinear (Smooth, MipBlend)
    * Bilinear (Smooth, SharpMips)
    * Nearest (Sharp / Pixelated)
    * Anisotropic (High Quality)
  * Mipmap inspector: interactive slider to preview individual mip levels
  * RGBA Channel Mixer: interactive slider to preview R / G / B / A channels
* Added detailed Texture Info Panel displaying:
  * Dimensions
  * GPU format
  * Total mip levels
  * Estimated GPU memory usage
  * Supercompression mode
  * KVD metadata breakdown
  * DFD metadata breakdown
* Added support for the following ktx2 texture formats inside the viewer:
  * 2D BC1–BC7
  * ETC1S + UASTC
  * BC6H
  * HDR 4K textures

### 2.5.1 - 2024-10-23

* Fixed an issue with BabylonJS mesh debugging. [#268](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/268)
* Fixed Meshopt decompression in BabylonJS and ThreeJS.
* Update Khronos glTF-Validator to 2.0.0-dev.3.10. [KhronosGroup/glTF-Validator#240](https://github.com/KhronosGroup/glTF-Validator/pull/240)
* Update JSON schema for `KHR_materials_iridescence` to latest.

### 2.5.0 - 2024-08-02

* Update Babylon to 7.17.2.
* Update Cesium to 1.120.0.
* Update Filament to 1.53.1.
* Update ThreeJS to r167.0.
* Update Draco decoder to 1.5.7.
* Add JSON schemas for `KHR_animation_pointer`, `KHR_materials_diffuse_transmission`, `KHR_materials_dispersion`, and `EXT_mesh_manifold`.
* Marked three old extensions as "archived" in JSON schema, and named their replacements.
* Fixed issue with error reporting columns confused by tabs. [#246](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/246)
* Added support for treating VRM files (*.vrm) as GLB files, based on [#259](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/259)
* Updated "Go To Definition" to work with `KHR_animation_pointer` pointers and `EXT_mesh_gpu_instancing` attributes.

### 2.4.0 - 2023-06-14

* Add JSON schema for `KHR_materials_anisotropy`.
* Update Babylon to 6.6.1.
* Update Cesium to 1.106.1.
* Update Filament to 1.36.0.
* Update ThreeJS to r153.0.
* Update gltf-import-export to 1.0.22. Fixes [#245](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/245)
* Update Khronos glTF-Validator to 2.0.0-dev.3.9. [KhronosGroup/glTF-Validator#191](https://github.com/KhronosGroup/glTF-Validator/pull/191)
* Update Draco decoder to 1.5.6.

### 2.3.16 - 2022-05-19

* Update Babylon to 5.6.1.
* Update Cesium to 1.93.0.
* Update Filament to 1.22.0.
* Update ThreeJS to r140.2.
* Update gltf-import-export to 1.0.19, preserving certain MIME types from GLB. [gltf-import-export#18](https://github.com/najadojo/gltf-import-export/issues/18).
* Update Khronos glTF-Validator to 2.0.0-dev.3.8. [KhronosGroup/glTF-Validator#185](https://github.com/KhronosGroup/glTF-Validator/pull/185)

### 2.3.15 - 2022-04-28

* Added a pair of "Quick Fixes" for `ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE`. [#242](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/242)
* Update Babylon to 5.4.0.
* Update Filament to 1.21.2.
* Update Khronos glTF-Validator to 2.0.0-dev.3.7. [KhronosGroup/glTF-Validator#181](https://github.com/KhronosGroup/glTF-Validator/pull/181)

### 2.3.14 - 2022-04-20

* Added "Quick Fixes" for `BUFFER_VIEW_TARGET_MISSING` and `ACCESSOR_JOINTS_USED_ZERO_WEIGHT`. [#240](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/240)
* Added a "Preview Report..." option to manual glTF validation requests, opening the report's contents in an unsaved text editor window. [#239](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/239)
* Update schemas for `KHR_materials_iridescence` and `KHR_materials_emissive_strength`.
* Update Babylon to 5.2.0.
* Update Cesium to 1.92.0.
* Update Draco decoder to 1.5.2.
* Update Filament to 1.21.1.
* Update ThreeJS to r139.2.
* Update Khronos glTF-Validator to 2.0.0-dev.3.6. [KhronosGroup/glTF-Validator#179](https://github.com/KhronosGroup/glTF-Validator/pull/179)

### 2.3.13 - 2021-11-03

* Update glTF schema to latest (document revision 2.0.1). [#226](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/226)
* Added JSON schema for KHR_materials_emissive_strength, KHR_materials_iridescence, and KHR_xmp_json_ld. Included in [#226](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/226)
* Added the first "Quick Fix": Add an undeclared extension to `extensionsUsed`. [#227](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/227)
* Changed when certain commands appear in certain menus. [#228](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/228)
* Import (convert .glb to .gltf) and export (convert .gltf to .glb) are now available from VSCode's file explorer window context menu. Included in [#228](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/228)
* Update Babylon to 5.0.0-alpha.60.
* Update Cesium to 1.87.
* Update Draco decoder to 1.4.3.
* Update Filament to 1.12.11.
* Update ThreeJS to r134.

### 2.3.12 - 2021-08-03

* Update Babylon to 5.0.0-alpha.36.
* Update Cesium to 1.84.0.
* Update Filament to 1.11.0.
* Update ThreeJS to r131.1.

### 2.3.11 - 2021-06-29

* Update Babylon to 5.0.0-alpha.30.
* Update Cesium to 1.82.1.
* Update Filament to 1.10.3.
* Update Khronos glTF-Validator to 2.0.0-dev.3.5. [KhronosGroup/glTF-Validator#158](https://github.com/KhronosGroup/glTF-Validator/pull/158), [KhronosGroup/glTF-Validator#167](https://github.com/KhronosGroup/glTF-Validator/pull/167)

### 2.3.10 - 2021-05-09

* Update Babylon to 5.0.0-alpha.20.
* Update Cesium to 1.81.
* Update ThreeJS to r127.
* Adjust scale of top-bar icons.
* Update schema for KHR_materials_volume to latest.

### 2.3.8, 2.3.9 - 2021-02-07

* Turn off non-IBL default lights, for better consistency between preview windows. [#210](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/210)
* Update Cesium to 1.78.
* Update Draco decoder to 1.4.1
* Update Filament to 1.9.10.  This fixes an issue where the preview window turned black in VSCode 1.53.
* Update ThreeJS to r125.2.

### 2.3.7 - 2021-02-01

* Update draft JSON schemas for KHR_materials_specular, KHR_materials_ior, and KHR_materials_volume.

### 2.3.6 - 2021-01-25

* Recompiled language server. Fixes for [#207](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/207) didn't get packaged in the previous release.

### 2.3.5 - 2021-01-24

* Update Babylon to 5.0.0-alpha.7.
* Enable KTX2 textures in the BabylonJS preview window.
* Hovering a color (such as `baseColorFactor`, etc.) now converts the color from linear to sRGB colorspace for proper display.
* Hovering a color no longer requires network access for the sample. [#207](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/207)
* Various glTF extensions that supply color factors can now also be hovered.  Also [#207](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/207)

### 2.3.4 - 2021-01-18

* Fixed packaging error in previous version that broke the preview window.
* Added `image/ktx2` MIME type during glTF / GLB conversions. [gltf-import-export#13](https://github.com/najadojo/gltf-import-export/pull/13)

### 2.3.3 - 2021-01-17

* Enable KTX2 textures in the ThreeJS preview window.
* Added support for KTX2 texture size reporting in the Asset Size glTF sidebar panel.
* Added JSON schema for KHR_texture_basisu.
* Added JSON schemas for draft extensions KHR_materials_specular, KHR_materials_ior, and KHR_materials_volume.  These may change before final release. [#204](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/204)
* Fixed an issue with URI-encoded names. [#200](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/200)
* Fixed an issue with image previews. [#159](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/159)
* Images no longer embed in JSON hovers, use image preview instead (typically ALT-D "Inspect Data" and/or F12 "Go To Definition").
* Update ThreeJS to r124.

### 2.3.2 - 2020-12-02

* Update Babylon to 4.2.0.
* Update Cesium to 1.76.
* Update Filament to 1.9.8.
* Update ThreeJS to r123.
* Update Khronos glTF-Validator to 2.0.0-dev.3.3. [KhronosGroup/glTF-Validator#148](https://github.com/KhronosGroup/glTF-Validator/pull/148)
* Added JSON schema for KHR_materials_sheen and EXT_meshopt_compression. [#197](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/197)
* Re-imported JSON schema for KHR_materials_variants.

### 2.3.1 - 2020-09-07

* Added JSON schema for KHR_materials_transmission, KHR_xmp, and EXT_mesh_gpu_instancing [#193](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/193)
* Added JSON schema for KHR_materials_variants [#189](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/189)
* Fixed an issue with buttons sticking off the edge in the default Windows Japanese font. [#190](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/190)
* Update ThreeJS to r120.
* Update Cesium to 1.73.

### 2.3.0 - 2020-08-24

* Added Google Filament as a preview engine. [#188](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/188)

### 2.2.13 - 2020-08-11

* Preview window always loads from document contents now, allowing previews of unsaved glTF changes in all 3 engines. [#187](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/187)
* Upgraded ThreeJS preview window to allow `*.hdr` HDRI environment maps.  Legacy support for ThreeJS non-HDR `{face}` environments has been preserved.
* Upgraded Babylon preview to also accept raw `*.hdr` files, but pre-filtered environments (ENV or DDS) are still faster to load, so are the recommended default.
* Changed default BabylonJS and ThreeJS environment maps to [Symmetrical Garden by Greg Zaal](https://hdrihaven.com/hdri/?c=nature&h=symmetrical_garden).  This is still configurable in settings.
* Update ThreeJS to r119.
* Update Cesium to 1.72.

### 2.2.12 - 2020-07-28

* Add version display for all engines to the glTF preview window.
* Update ThreeJS to r118, convert to ES6 module imports.
* Update Cesium to 1.71, convert to npm dependency.

### 2.2.11 - 2020-07-22

* Updated Webview resources to use newer access mechanism. [#183](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/183)
* Update Draco decoder to 1.3.6
* Dropped TSLint, which has been replaced by ESLint for TypeScript.

### 2.2.10 - 2020-03-01

* Add `KHR_materials_clearcoat` extension schema. [#180](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/180)
* Update BabylonJS to 4.1.0, with support for [`KHR_materials_clearcoat`](https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_materials_clearcoat/README.md) and several other draft "PBR Next" extensions.

### 2.2.9 - 2020-01-22

* Update Khronos glTF-Validator to 2.0.0-dev.3.2. [KhronosGroup/glTF-Validator#129](https://github.com/KhronosGroup/glTF-Validator/pull/129) and [KhronosGroup/glTF-Validator#131](https://github.com/KhronosGroup/glTF-Validator/pull/131)

### 2.2.8 - 2020-01-09

* Update ThreeJS to r112.
* Update Khronos glTF-Validator to 2.0.0-dev.3.0 (many changes, see [KhronosGroup/glTF-Validator#124](https://github.com/KhronosGroup/glTF-Validator/pull/124)).
* Fixed crash when importing GLB with sparse accessors. [gltf-import-export#9](https://github.com/najadojo/gltf-import-export/pull/9)

### 2.2.7 - 2019-11-26

* Added a file watcher for external assets, so for example when a texturemap gets overwritten the preview gets updated. [#167](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/167)
* Fixed an issue where 16-bit unsigned numbers were reported as signed. [#171](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/171)
* Updated extension to use some newer VSCode APIs. [#169](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/169) [#170](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/170)
* Imported latest glTF schema, just minor clarifications to colorspace conversions for RGBA texturemaps.
* Fixed sidebar "TF" logo to have correct size in VSCode version 1.37.0 and above.

### 2.2.6 - 2019-06-03

* Update BabylonJS logo
* Update Cesium to 1.58.
* Update ThreeJS to r105.
* Fixed minor issue with font size in preview window.
* Fixed issue with 3D preview not reloading after external changes to the glTF file. [#163](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/163)
* Fixed issue with editing animations targeting multiple morph targets. [#165](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/165)
* Added control panel to Cesium preview window for `AGI_articulations`. [#166](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/166)

### 2.2.5 - 2019-05-05

* Update BabylonJS to 4.0.3
* Fixed an issue decoding `MAT2`, `MAT3`, and `MAT4` matrix accessors. [#160](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/160)

### 2.2.4 - 2019-03-07

* Update BabylonJS preview window to use high-DPI scaling when available. [#156](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/156)
* Update glTF schema with `EXT_texture_webp` extension and recent spec clarifications. [#157](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/157)

### 2.2.3 - 2019-02-12

* Fix an error with the BabylonJS preview window caused by an Electron upgrade in VSCode 1.31. [#152](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/152)
* Updated script handling for better error reporting. [#154](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/154)

### 2.2.2 - 2019-01-24

* Fixed a bug with `KHR_materials_unlit` being displayed with a reflection map in the ThreeJS preview window. [#143](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/143)
* Added options to copy from the glTF tree inspector. [#147](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/147)
* Allowed IBL extension to override environment in Babylon. [#149](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/149)
* Fixed an issue with offline use of Babylon's Draco decompression. [#150](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/150)

### 2.2.0 and 2.2.1 - 2018-12-18

* Added BabylonJS Inspector for visual glTF debugging. [#129](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/129)
* Moved glTF Outline view to new glTF sidebar.
* Update Babylon to 4.0.0-alpha.11
* Update JSON schemas for KHR_* extensions.
* Add JSON schema for KHR_lights_punctual. [#135](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/135)
* Update main README with more detailed instructions on how to activate various tools and features of this extension. [#134](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/134)
* Update Khronos glTF-Validator to 2.0.0-dev.2.7

### 2.1.19 - 2018-11-27

* Update npm packages to remove event-stream 3.3.6, which was flagged as malicious (but the payload was inert in this extension).

### 2.1.18 - 2018-11-27

* Fixed schema bug in `EXT_lights_image_based`.  [KhronosGroup/glTF#1482](https://github.com/KhronosGroup/glTF/issues/1482)
* Fixed an issue with model orientation in the Cesium preview. [#126](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/126)
* Fixed an issue where a generic error message could hide a more specific message. [#127](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/127)

### 2.1.17 - 2018-11-08

* Upgraded glTF preview window to new VSCode webview, allowing the page to persist when the user swaps to a different tab. [#123](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/123)
* Add JSON schema validation for `EXT_lights_image_based`.
* Update gltf-import-export to 1.0.14, fixing an issue with import of certain GLBs from Blender. [gltf-import-export#7](https://github.com/najadojo/gltf-import-export/issues/7).
* Update Khronos glTF-Validator to 2.0.0-dev.2.6
* Update Babylon to 3.3.0.
* Update Cesium to 1.51.
* Update ThreeJS to r98.

### 2.1.16 - 2018-09-20

* Add support for two `AGI_` vendor extension schemas.

### 2.1.15 - 2018-09-10

* Added support for JSON schema validation of various glTF 2.0 extensions. [#119](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/119)
* Update Khronos glTF-Validator to 2.0.0-dev.2.5
* Update to latest glTF 2.0 schema.

### 2.1.14 - 2018-07-18

* Update Khronos glTF-Validator to 2.0.0-dev.2.4
* Update ThreeJS to r94

### 2.1.13 - 2018-06-01

* Fix forgotten DDS script import. [#111](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/111)
* Create animation editor. [#112](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/112)
* Update Babylon to 3.2.0.
* Update Cesium to 1.46, trim some unused assets.
* Update Khronos glTF-Validator to 2.0.0-dev.2.2
* Increase default max validation errors from 100 to 200. [#115](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/115)
* Fixed use of plural/singular in validation summary. [#114](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/114)

### 2.1.12 - 2018-04-19

* Tweak lighting setup in ThreeJS view. [#104](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/104)
* Update Khronos glTF-Validator to 2.0.0-dev.2.1
* Fix broken documentation link in Babylon settings. [#107](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/107)
* Update Babylon to 3.2.0-rc.1
* Update ThreeJS to r92
* Update Cesium to master@7307f816c1e4ed (post v1.44)
* Fix Cesium logo. [#105](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/105)

### 2.1.11 - 2018-04-04

* Fixed a problem that made models in the ThreeJS preview too dark. [#99](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/99)
* Add error reporting to ThreeJS preview window.
* Fixed an issue with hovering image MIME types. [#101](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/101)
* Update Babylon to 3.2.0-beta.4
* Update Khronos glTF-Validator to 2.0.0-dev.2.0
* Update Cesium to master@091200cd096 (version 1.44 plus two glTF fixes that got merged just afterwards)

### 2.1.10 - 2018-03-28

* Update Khronos glTF-Validator to 2.0.0-dev.1.8

### 2.1.9 - 2018-03-27

* Fixed an issue with previewing data from a temporary document on a case-sensitive file system. [#95](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/95)
* Added animation controls to Babylon preview UI. [#97](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/97)
* Update Babylon to 3.2.0-beta.3

### 2.1.8 - 2018-03-22

* Fixed an issue where the glTF outline for a Draco-compressed model could show negative sizes. [#91](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/91)
* Fixed an issue where "Go To Definition" on a temporary document didn't work. [#89 (comment)](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/89#issuecomment-374876626)
* Fix Babylon camera zoom speed to be relative to distance from model.

### 2.1.7 - 2018-03-20

* Add support for Draco mesh decompression.  Use "Peek Definition (Alt+F12)" on one of the mesh attributes inside the extension to decode mesh data. [#90](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/90)
* Update Babylon to 3.2.0-beta.1, enabling Draco mesh decompression.
* Update ThreeJS to r91, enabling Draco mesh decompression.
* Update Cesium to master@3f075ade3c6 (a pre-release of 1.44), enabling Draco mesh decompression.
* Allow Cesium camera to move much closer to the model.
* Tweak Babylon camera to not zoom so fast.

### 2.1.6 - 2018-03-12

* Added size estimate breakdowns to the glTF tree view. [#88](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/88)

### 2.1.5 - 2018-03-12

* Added animation controls to the ThreeJS preview window. [#86](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/86)
* Fixed an issue where Cesium animations stopped, introduced in the previous version.

### 2.1.4 - 2018-03-08

* Added separate file for the Cesium [Code of Conduct](https://github.com/AnalyticalGraphicsInc/gltf-vscode/blob/master/CODE_OF_CONDUCT.md). [#82](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/82)
* Updated GLB import to fix [#80](https://github.com/AnalyticalGraphicsInc/gltf-vscode/issues/80).
* Updated Three.js to r90
* Updated CesiumJS to 1.43
* Updated README wording about how images are stored in GLB files. [#83](https://github.com/AnalyticalGraphicsInc/gltf-vscode/pull/83)
* Update glTF-Validator to 2.0.0-dev.1.7
* Update to latest glTF Schema.

### 2.1.3 - 2017-12-22

* Fixed a broken animation control in the Cesium preview.
* Fixed some bugs exposed by Project Polly from the Khronos Blender Exporter.
* Updated to latest ThreeJS glTF loader for preview window.
* Updated to Babylon 3.1.1 stable.

### 2.1.2 - 2017-12-01

* Fixed file path problems in glTF Preview window for Mac and Linux systems.
* Hover shows a snapshot of textures and colors.
* Definition provider allows navigation on any index reference.
* View buffer data provided by Accessor (Go to Definition (F12)).
* Changed viewing texture data to match VSCode inline viewer.
* Updated to latest glTF Validator and glTF schemas.
* Clarified error sources, from glTF Validator vs glTF Language Server.
* Checkerboard appears behind images viewed with "Inspect Data URI".
* Moved GLB import/export code to an npm package, for use outside this project.
* Fixed a byte alignment issue with GLB import.
* Preview window updated to Cesium 1.40 and Babylon 3.1.0-beta6.

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
