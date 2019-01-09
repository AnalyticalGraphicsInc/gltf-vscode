/// <reference path="../node_modules/babylonjs/babylon.d.ts" />
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
            BABYLON.DracoCompression.DecoderUrl = document.getElementById('dracoLoaderPath').textContent;
            BABYLON.SceneLoader.ShowLoadingScreen = false;
            canvas = document.getElementById('babylonRenderCanvas');
            engine = new BABYLON.Engine(canvas, true);
            engine.enableOfflineSupport = false;
            scene = new BABYLON.Scene(engine);
            scene.useRightHandedSystem = true;
            debug = new window.BabylonDebug(scene);

            BABYLON.SceneLoader.OnPluginActivatedObservable.addOnce(function (plugin) {
                plugin.animationStartMode = BABYLON.GLTFLoaderAnimationStartMode.NONE;
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
                scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
                    defaultBabylonReflection, scene);

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
