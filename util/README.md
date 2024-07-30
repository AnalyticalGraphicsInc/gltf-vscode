# Util folder

## importAll.sh

With the introduction of glTF extension support, running importSchema.js by hand became unwieldy.  This is a shell script that runs importSchema.js for each of the main schema folders, and then for each of the supported extensions.  It has a requirement that the main `glTF` repository and the `gltf-vscode` repository be side-by-side in some parent folder.

To run it, first `cd` into the `util` folder, then run `./importAll.sh`.

## importSchema.js

The official glTF 2.0 schema is published by Khronos in their [glTF repository](https://github.com/KhronosGroup/glTF).  However, the published schema by itself has some aspects that don't function optimally when read into VSCode's automated JSON validation.

This folder contains a NodeJS script `importSchema.js` that will read in the official glTF schema and make a few non-breaking changes to the way descriptions are presented in the schema.  Here is a list of the changes being applied:

* `gltf_enumNames` - The glTF 1.0 schema contained this non-standard identifier to indicate a list of enum values with descriptions.  The import script converts occurrences of this to an array of `oneOf`, with one description per enum value.  This allows the user to hover over a particular enum value and read its description, and to choose from a list of available enum values with descriptions per value.  VSCode does not show the parent's description, so this script adds that description to the end of the value description (for example, `texture.type` has an enum `5121` with the description `UNSIGNED_BYTE`.  This script changes that description to include the parent description, making it: `UNSIGNED_BYTE - Texel datatype.`  Otherwise the user may not know what `type` means.)

* `anyOf` - The glTF 2.0 schema uses this to describe enums, with descriptions.  Similar to the above, the import script adds the parent description onto the end of each enum value description, as otherwise VSCode does not display the parent description.  For example, `accessor.componentType` value `5121` has its description lengthened from `UNSIGNED_BYTE` to `UNSIGNED_BYTE - The datatype of components in the attribute.`

* `gltf_detailedDescription` - glTF uses this for a more detailed description of some fields.  The import script looks for this, and when present, will use it to overwrite the `description` field of the same object.  This makes for more wordy, but more informative, descriptions.

* `textureInfo.description` - This particular description field is rather simplistic: `"Reference to a texture."`.  This schema object is referred to by several texture channels (`baseColorTexture`, `metallicRoughnessTexture`, `normalTexture`, `occlusionTexture`, `emissiveTexture`).  Each of these parents has its own detailed description with usage instructions, and VSCode was ignoring all that in favor of showing `Reference to a texture`.  So, `textureInfo.description` is deliberately removed from the schema, causing the more informative parent descriptions to be revealed.

* `glTF Property` title and `glTF Child of Root Property` title - Both of these are removed, to allow many more descriptive titles to show through instead.  This reveals the titles of most objects (such as Node objects, Mesh objects, etc.) as well as the titles of glTF extension objects.

* Whitespace - The whitespace in the schema is changed as a side-effect of parsing and re-serializing the schema in this script.

## validateSchema.js

This is a final check at the end of `importAll.sh` to ensure that all external file references between schemas are to existing files.

# Extensions

To add a new extension schema here, once the extension's schema is merged into the main glTF repository, follow these steps:

1. Edit `util/extensionMap2.0.json` to assign the new extension schema to one of the glTF core schema extension objects.

2. Edit `util/importAll.sh` to include a command to import the extension's schema.

3. Run `./importAll.sh` from the `util` folder, to pick up edits from above.

4. Add the extension to the list of supported extension schemas in the main `README.md` file.

Now, build and launch this VSCode extension, and it should offer autocomplete and tooltips for the newly added glTF extension.
