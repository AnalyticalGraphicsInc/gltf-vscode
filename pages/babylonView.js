/// <reference path="../node_modules/babylonjs/babylon.module.d.ts" />
/// <reference path="../node_modules/babylonjs-loaders/babylonjs.loaders.module.d.ts" />

/*global BABYLON,mainViewModel,ko*/
(function () {
    'use strict';

    window.BabylonView = function () {
        // Tracks if this engine is currently the active engine.
        var enabled = false;

        var canvas = null;
        var engine = null;
        var scene = null;
        var skybox = null;
        var skyboxBlur = 0.0;
        var backgroundSubscription = null;
        var debug = null;

        /**
         * @function cleanup
         * Perform any cleanup that needs to happen to stop rendering the current model.
         * This is called right before the active engine for the preview window is switched.
         */
        this.cleanup = function () {
            if (debug) {
                debug.dispose();
                debug = null;
            }

            if (backgroundSubscription) {
                backgroundSubscription.dispose();
                backgroundSubscription = null;
            }

            mainViewModel.animations([]);
            enabled = false;
            window.removeEventListener('resize', onWindowResize);

            if (engine) {
                engine.dispose();
                engine = null;
            }
        };

        function render() {
            scene.render();
        }

        function onWindowResize() {
            if (!enabled) {
                return;
            }

            engine.resize();
        }

        function subscribeToAnimUI(anim) {
            anim.active.subscribe(function(newValue) {
                mainViewModel.anyAnimChanged();
                var animGroup = anim.animationGroup;
                if (!newValue) {
                    animGroup.reset();
                    animGroup.stop();
                } else {
                    animGroup.start(true);
                }
            });
        }

        this.startPreview = function () {
            enabled = true;
            document.getElementById('babylonVersion').textContent = BABYLON.Engine.Version;

            BABYLON.DracoCompression.Configuration = {
                decoder: {
                    wasmUrl: document.getElementById('dracoLoaderPath').textContent,
                    wasmBinaryUrl: document.getElementById('dracoLoaderWasmPath').textContent
                }
            };

            var extensionRootPath = document.getElementById('extensionRootPath').textContent;
            var previewPath = extensionRootPath + '/engines/Babylon/preview/';

            // This doesn't appear present in Babylon 4.2.0, maybe it's in 5.x alpha?
            //BABYLON.GLTF2.Loader.Extensions.EXT_meshopt_compression.DecoderPath =
            //    previewPath + 'meshopt_decoder.js';

            // via https://github.com/BabylonJS/Babylon.js/blob/76ee91e726ef057a5173fb5bd2e99dcb438e64ed/localDev/index-views.html#L129-L137
            BABYLON.KhronosTextureContainer2.URLConfig = {
                jsDecoderModule: previewPath + 'babylon.ktx2Decoder.js',
                wasmUASTCToASTC: previewPath + 'ktx2Transcoders/uastc_astc.wasm',
                wasmUASTCToBC7: previewPath + 'ktx2Transcoders/uastc_bc7.wasm',
                wasmUASTCToRGBA_UNORM: previewPath + 'ktx2Transcoders/uastc_rgba32_unorm.wasm',
                wasmUASTCToRGBA_SRGB: previewPath + 'ktx2Transcoders/uastc_rgba32_srgb.wasm',
                jsMSCTranscoder: previewPath + 'ktx2Transcoders/msc_basis_transcoder.js',
                wasmMSCTranscoder: previewPath + 'ktx2Transcoders/msc_basis_transcoder.wasm'
            };

            //BABYLON.ZSTDDecoder.WasmModuleURL = previewPath + 'zstddec.wasm';

            BABYLON.SceneLoader.ShowLoadingScreen = false;
            canvas = document.getElementById('babylonRenderCanvas');
            engine = new BABYLON.Engine(canvas, true, { limitDeviceRatio: false });
            engine.enableOfflineSupport = false;
            scene = new BABYLON.Scene(engine);
            debug = new window.BabylonDebug(scene);

            BABYLON.SceneLoader.OnPluginActivatedObservable.addOnce(function (plugin) {
                plugin.animationStartMode = BABYLON.GLTFLoaderAnimationStartMode.NONE;
                plugin.validate = false;
            });

            var defaultBabylonReflection = document.getElementById('defaultBabylonReflection').textContent;
            var rootPath = document.getElementById('gltfRootPath').textContent;
            var gltfContent = document.getElementById('gltf').textContent;

            BABYLON.GLTFFileLoader.IncrementalLoading = false;
            BABYLON.SceneLoader.AppendAsync(rootPath, 'data:' + gltfContent, scene, undefined, '.gltf').then(function () {
                scene.createDefaultCameraOrLight(true);
                scene.activeCamera.attachControl(canvas);
                scene.activeCamera.wheelDeltaPercentage = 0.005;

                // Hook up animations to the UI.
                let numAnimations = scene.animationGroups.length;
                let koAnimations = [];
                for (let i = 0; i < numAnimations; ++i) {
                    let animGroup = scene.animationGroups[i];
                    let anim = {
                        index: i,
                        name: animGroup.name || i,
                        active: ko.observable(false),
                        animationGroup: animGroup
                    };
                    subscribeToAnimUI(anim);
                    koAnimations.push(anim);
                }
                mainViewModel.animations(koAnimations);
                mainViewModel.anyAnimChanged();

                // glTF assets use a +Z forward convention while the default camera faces +Z.
                // Rotate the camera to look at the front of the asset.
                scene.activeCamera.alpha += Math.PI;

                if (!scene.environmentTexture) {
                    if (!/\.hdr$/.test(defaultBabylonReflection.toLowerCase())) {
                        // Pre-filtered environments, such as DDS
                        scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
                            defaultBabylonReflection, scene);
                    } else {
                        // HDR environments
                        scene.environmentTexture = new BABYLON.HDRCubeTexture(defaultBabylonReflection,
                            scene, 128, false, true, false, true);
                    }
                }

                mainViewModel.hasBackground(true);
                function applyBackground(showBackground) {
                    if (showBackground) {
                        skybox = scene.createDefaultSkybox(scene.environmentTexture.clone(), true,
                            (scene.activeCamera.maxZ - scene.activeCamera.minZ) / 2, skyboxBlur);
                    } else if (skybox) {
                        skybox.material.reflectionTexture.dispose();
                        skybox.dispose();
                        skybox = null;
                    }
                }
                applyBackground(mainViewModel.showBackground());
                backgroundSubscription = mainViewModel.showBackground.subscribe(applyBackground);

                engine.runRenderLoop(render);

                mainViewModel.onReady();
            }, function (error) {
                mainViewModel.showErrorMessage(error.message);
            });

            window.addEventListener('resize', onWindowResize);
        };

        this.enableDebugMode = function () {
            debug.showInspector();
        };

        this.disableDebugMode = function () {
            debug.hideInspector();
        };

        this.isDebugModeEnabled = function () {
            return debug.isInspectorVisible();
        };
    };
})();
