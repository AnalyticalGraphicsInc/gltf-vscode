/*global Cesium,ko,mainViewModel*/
(function() {
    'use strict';
window.CesiumView = function() {

    // Tracks if this engine is currently the active engine.
    var enabled = false;
    var scene = null;
    var canvas = null;
    var fixLogo = true;

    // The model is placed at the North Pole so the star map is completely right-side up.
    // But the pole doesn't get much sunlight.  STK says 23.444 degrees solar elevation
    // on 20 Jun 2020 12:11:47.754.  But that puts the Sun straight behind the camera, so
    // I moved it a little.  The Sun stays close to that elevation all day.
    var startTime = Cesium.JulianDate.fromIso8601('2020-06-20T14:00:00Z');

    // Still need to animate time forwards, to enable glTF animations.
    var clock = new Cesium.Clock({
        startTime: startTime,
        currentTime: startTime,
        shouldAnimate: true
    });

    function resize() {
        var zoomFactor = Cesium.defaultValue(window.devicePixelRatio, 1.0);
        var width = canvas.clientWidth * zoomFactor;
        var height = canvas.clientHeight * zoomFactor;

        canvas.width = width;
        canvas.height = height;

        if (width !== 0 && height !== 0) {
            var frustum = scene.camera.frustum;
            if (Cesium.defined(frustum.aspectRatio)) {
                frustum.aspectRatio = width / height;
            } else {
                frustum.top = frustum.right * (height / width);
                frustum.bottom = -frustum.top;
            }
        }
    }

    function subscribeToAnimUI(model, anim) {
        anim.active.subscribe(function(newValue) {
            mainViewModel.anyAnimChanged();
            if (!newValue) {
                model.activeAnimations.remove(anim.animation);
                anim.animation = undefined;
            } else {
                anim.animation = model.activeAnimations.add({
                    index: anim.index,
                    loop: Cesium.ModelAnimationLoop.REPEAT
                });
            }
        });
    }

    function updateAnimations(model) {
        var gltfAnimations = model.gltf.animations || [];
        var animations = [];

        for (var i = 0; i < gltfAnimations.length; i++) {
            var anim = {
                index: i,
                name: gltfAnimations[i].name || i,
                active: ko.observable(false)
            };
            subscribeToAnimUI(model, anim);
            animations.push(anim);
        }
        mainViewModel.animations(animations);
        mainViewModel.anyAnimChanged();
    }

    function startRenderLoop() {
        if (!enabled) {
            return;
        }

        scene.initializeFrame();
        resize();
        var currentTime = clock.tick();
        scene.render(currentTime);
        Cesium.requestAnimationFrame(startRenderLoop);

        if (fixLogo) {
            fixLogo = false;
            const element = document.querySelector('.cesium-credit-logoContainer img');
            if (element) {
                element.src = Cesium.buildModuleUrl('Assets/Images/cesium_credit.png');
            }
        }
    }

    function setCamera(scene, model) {
        var controller = scene.screenSpaceCameraController;
        controller.ellipsoid = Cesium.Ellipsoid.UNIT_SPHERE;
        controller.enableTilt = false;
        var r = model.boundingSphere.radius;
        controller.minimumZoomDistance = 0.0;

        var center = Cesium.Matrix4.multiplyByPoint(model.modelMatrix, model.boundingSphere.center, new Cesium.Cartesian3());
        var heading = Cesium.Math.toRadians(10);
        var pitch = Cesium.Math.toRadians(-15);
        var range = r * 2.5;

        scene.camera.lookAt(center, new Cesium.HeadingPitchRange(heading, pitch, range));
    }

    function loadModelFromContent(gltfContent, gltfRootPath, resetCamera) {
        scene.primitives.removeAll();

        var model = scene.primitives.add(new Cesium.Model({
            gltf: gltfContent,
            basePath: gltfRootPath,
            forwardAxis: Cesium.Axis.X,
            scale: 100  // Increasing the scale allows the camera to get much closer to small models.
        }));

        loadModel(model, resetCamera);
    }

    function loadModelFromFile(gltfFileName, gltfRootPath, resetCamera) {
        scene.primitives.removeAll();

        var model = scene.primitives.add(Cesium.Model.fromGltf({
            url: gltfRootPath + gltfFileName,
            basePath: gltfRootPath,
            forwardAxis: Cesium.Axis.X,
            scale: 100
        }));

        loadModel(model, resetCamera);
    }

    function loadModel(model, resetCamera) {
        Cesium.when(model.readyPromise).then(function(model) {
            if (Cesium.Cartesian3.magnitude(Cesium.Cartesian3.subtract(model.boundingSphere.center, Cesium.Cartesian3.ZERO, new Cesium.Cartesian3())) < 5000000) {
                model.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(new Cesium.Cartesian3.fromDegrees(0.0, 89.98, 0.0));
            }

            if (resetCamera) {
                setCamera(scene, model);
            }

            updateAnimations(model);
        }).otherwise(function(e) {
            mainViewModel.errorText('Error: ' + e);
        });
    }

    /**
    * @function cleanup
    * Perform any cleanup that needs to happen to stop rendering the current model.
    * This is called right before the active engine for the preview window is switched.
    */
    this.cleanup = function() {
        enabled = false;
        mainViewModel.animations([]);
        scene = scene && scene.destroy();
    };

    this.startPreview = function() {
        mainViewModel.hasBackground(false);
        canvas = document.getElementById('cesiumCanvas');
        canvas.addEventListener('contextmenu', function() {
            return false;
        }, false);
        canvas.addEventListener('selectstart', function() {
            return false;
        }, false);

        scene = new Cesium.Scene({
            canvas: canvas,
            creditContainer: document.getElementById('cesiumCreditContainer')
        });
        scene.rethrowRenderErrors = true;
        scene.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
        scene.backgroundColor = Cesium.Color.SLATEGRAY;

        enabled = true;
        startRenderLoop();

        var gltfFileName = document.getElementById('gltfFileName').textContent;
        var gltfRootPath = document.getElementById('gltfRootPath').textContent;

        try {
            var gltfContent = JSON.parse(document.getElementById('gltf').textContent);
            loadModelFromContent(gltfContent, gltfRootPath, true);
        }
        catch (ex) {
            console.warn('Cesium: Loading glTF content from saved file.');

            // If the glTF content is missing or not valid JSON, then try to load the
            // model directly from the glTF file.
            loadModelFromFile(gltfFileName, gltfRootPath, true);
        }
    };
};
})();
