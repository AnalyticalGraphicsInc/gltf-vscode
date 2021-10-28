#!/bin/sh
# Re-import all the schemas.
# This presumes the glTF repo is at the same level as the gltf-vscode repo.
echo "~~~ glTF 1.0 ~~~"
./importSchema.js -i ../../glTF/specification/1.0/schema -o ../schemas/gltf-1.0
echo "~~~ glTF 2.0 ~~~"
./importSchema.js -i ../../glTF/specification/2.0/schema -o ../schemas/gltf-2.0 -e extensionMap2.0.json
echo "~~~ KHR_draco_mesh_compression ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_draco_mesh_compression/schema -o ../schemas/gltf-2.0/extensions/KHR_draco_mesh_compression -s ../../
echo "~~~ KHR_lights_punctual ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_lights_punctual/schema -o ../schemas/gltf-2.0/extensions/KHR_lights_punctual -s ../../
echo "~~~ KHR_materials_clearcoat ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_clearcoat/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_clearcoat -s ../../
echo "~~~ KHR_materials_ior ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_ior/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_ior -s ../../
echo "~~~ KHR_materials_sheen ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_sheen/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_sheen -s ../../
echo "~~~ KHR_materials_specular ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_specular/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_specular -s ../../
echo "~~~ KHR_materials_transmission ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_transmission/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_transmission -s ../../
echo "~~~ KHR_materials_unlit ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_unlit/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_unlit -s ../../
echo "~~~ KHR_materials_variants ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_variants/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_variants -s ../../
echo "~~~ KHR_materials_volume ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_volume/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_volume -s ../../
# Note that KHR_mesh_quantization does not contribute a schema, so is not listed here.
echo "~~~ KHR_texture_basisu ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_texture_basisu/schema -o ../schemas/gltf-2.0/extensions/KHR_texture_basisu -s ../../
echo "~~~ KHR_texture_transform ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_texture_transform/schema -o ../schemas/gltf-2.0/extensions/KHR_texture_transform -s ../../
echo "~~~ KHR_xmp_json_ld ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_xmp_json_ld/schema -o ../schemas/gltf-2.0/extensions/KHR_xmp_json_ld -s ../../

# Archived extensions
#
echo "~~~ KHR_materials_pbrSpecularGlossiness (Archived) ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Archived/KHR_materials_pbrSpecularGlossiness/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_pbrSpecularGlossiness -s ../../
echo "~~~ KHR_techniques_webgl (Archived) ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Archived/KHR_techniques_webgl/schema -o ../schemas/gltf-2.0/extensions/KHR_techniques_webgl -s ../../
echo "~~~ KHR_xmp (Archived) ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Archived/KHR_xmp/schema -o ../schemas/gltf-2.0/extensions/KHR_xmp -s ../../

# PBR Next
# Any extensions listed here require a particular branch to be checked out before importing.
#
echo "~~~ KHR_materials_emissive_strength ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Khronos/KHR_materials_emissive_strength/schema -o ../schemas/gltf-2.0/extensions/KHR_materials_emissive_strength -s ../../

# Vendor and Multi-vendor extensions
#
echo "~~~ EXT_lights_image_based ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Vendor/EXT_lights_image_based/schema -o ../schemas/gltf-2.0/extensions/EXT_lights_image_based -s ../../
echo "~~~ EXT_mesh_gpu_instancing ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Vendor/EXT_mesh_gpu_instancing/schema -o ../schemas/gltf-2.0/extensions/EXT_mesh_gpu_instancing -s ../../
echo "~~~ EXT_meshopt_compression ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Vendor/EXT_meshopt_compression/schema -o ../schemas/gltf-2.0/extensions/EXT_meshopt_compression -s ../../
echo "~~~ EXT_texture_webp ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Vendor/EXT_texture_webp/schema -o ../schemas/gltf-2.0/extensions/EXT_texture_webp -s ../../
echo "~~~ AGI_articulations ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Vendor/AGI_articulations/schema -o ../schemas/gltf-2.0/extensions/AGI_articulations -s ../../
echo "~~~ AGI_stk_metadata ~~~"
./importSchema.js -i ../../glTF/extensions/2.0/Vendor/AGI_stk_metadata/schema -o ../schemas/gltf-2.0/extensions/AGI_stk_metadata -s ../../
