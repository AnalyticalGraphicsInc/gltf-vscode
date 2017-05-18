# Babylon.js 3D Engine
![Babylon.js logo](logo.png)

## Geting an updated engine

To minimize the download size, we create a custom, minified version of Babylon.js
that has the subset of the features that are relevant for use within the context
of this VS Code extension.

1. Go here: [Babylon.js Generator](http://www.babylonjs.com/versionbuilder/)

2. Select the following items:
   * Materials
      * Shadow only material
   * Loaders
      * glTF
   * Release
      * v3.0 preview
   * Minification
      * Minified

3. Replace the current `babylon.custom.js` file the one that you just downloaded.

