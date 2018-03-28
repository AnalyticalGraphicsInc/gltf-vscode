/*global BABYLON,mainViewModel,ko*/
(function() {
    'use strict';

window.BabylonView = function() {
    // Tracks if this engine is currently the active engine.
    var enabled = false;

    var canvas = null;
    var engine = null;
    var scene = null;
    var skybox = null;
    var skyboxBlur = 0.0;
    var backgroundSubscription;

    /**
    * @function cleanup
    * Perform any cleanup that needs to happen to stop rendering the current model.
    * This is called right before the active engine for the preview window is switched.
    */
    this.cleanup = function() {
        if (backgroundSubscription) {
            backgroundSubscription.dispose();
            backgroundSubscription = undefined;
        }
        mainViewModel.animations([]);
        enabled = false;
        window.removeEventListener('resize', onWindowResize);
        engine.stopRenderLoop(render);
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

    this.startPreview = function() {
        enabled = true;
        BABYLON.DracoCompression.DecoderUrl = document.getElementById('dracoLoaderPath').textContent;
        BABYLON.SceneLoader.ShowLoadingScreen = false;
        canvas = document.getElementById('babylonRenderCanvas');
        engine = new BABYLON.Engine(canvas, true);
        engine.enableOfflineSupport = false;
        scene = new BABYLON.Scene(engine);
        scene.useRightHandedSystem = true; // This is needed for correct glTF normal maps.

        BABYLON.SceneLoader.OnPluginActivatedObservable.add(function (plugin) {
            plugin.animationStartMode = BABYLON.GLTFLoaderAnimationStartMode.NONE;
        });

        var defaultBabylonReflection = document.getElementById('defaultBabylonReflection').textContent;
        var rootPath = document.getElementById('gltfRootPath').textContent;
        var gltfContent = document.getElementById('gltf').textContent;

        BABYLON.GLTFFileLoader.IncrementalLoading = false;
        BABYLON.SceneLoader.Append(rootPath, 'data:' + gltfContent, scene, function() {
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
        }, null, function(error, longMessage) {
            if (longMessage && typeof longMessage === 'string') {
                var lines = longMessage.split('\n');
                var lastLine = lines.pop();
                var pos = lastLine.indexOf(': ');
                if (pos >= 0) {
                    lastLine = lastLine.substring(pos + 2);
                }
                error = lastLine;
            }
            mainViewModel.errorText(error.toString());
        });

        window.addEventListener('resize', onWindowResize);
    };
};
})();
