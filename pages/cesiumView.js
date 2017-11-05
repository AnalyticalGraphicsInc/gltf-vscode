var CesiumView = function() {

    // Tracks if this engine is currently the active engine.
    var enabled = false;
    var scene = null;
    var canvas = null;
    var clock = new Cesium.Clock();

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

    function addAnimUpdate(model, anim) {
        anim.active.subscribe(function(newValue) {
            mainViewModel.oneAnimChanged();
            if (!newValue) {
                model.activeAnimations.remove(anim.animation);
                anim.animation = undefined;
            } else {
                anim.animation = model.activeAnimations.add({
                    name: anim.index,
                    loop: Cesium.ModelAnimationLoop.REPEAT
                });
            }
        });
    }

    function updateAnimations(model) {
        var gltfAnimations = model.gltf.animations;
        var animations = [];

        for (var i = 0; i < gltfAnimations.length; i++) {
            var anim = {
                index: i,
                name: gltfAnimations[i].name || i,
                active: ko.observable(false)
            };
            addAnimUpdate(model, anim);
            animations.push(anim);
        }
        mainViewModel.animations(animations);
        mainViewModel.oneAnimChanged();
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
            basePath: gltfRootPath
        }));

        loadModel(model, resetCamera);
    }

    function loadModelFromFile(gltfFileName, gltfRootPath, resetCamera) {
        scene.primitives.removeAll();

        var model = scene.primitives.add(Cesium.Model.fromGltf({
            url: gltfRootPath + gltfFileName,
            basePath: gltfRootPath
        }));

        loadModel(model, resetCamera);
    }

    function loadModel(model, resetCamera) {
        Cesium.when(model.readyPromise).then(function(model) {
            if (Cesium.Cartesian3.magnitude(Cesium.Cartesian3.subtract(model.boundingSphere.center, Cesium.Cartesian3.ZERO, new Cesium.Cartesian3())) < 5000000) {
                model.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(new Cesium.Cartesian3.fromDegrees(0.0, 89.999, 0.0));
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

        var cesiumLogoData = 'data:image/png;base64,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';

        var cesiumCredit = new Cesium.Credit('Cesium', cesiumLogoData, 'http://cesiumjs.org/');
        scene.frameState.creditDisplay.addDefaultCredit(cesiumCredit);

        enabled = true;
        startRenderLoop();

        var gltfFileName = document.getElementById('gltfFileName').textContent;
        var gltfRootPath = "file:///" + document.getElementById('gltfRootPath').textContent;

        try {
            var gltfContent = JSON.parse(document.getElementById('gltf').textContent);
            loadModelFromContent(gltfContent, gltfRootPath, true);
        }
        catch (ex) {
            console.warn("Cesium: Loading glTF content from saved file.");

            // If the glTF content is missing or not valid JSON, then try to load the
            // model directly from the glTF file.
            loadModelFromFile(gltfFileName, gltfRootPath, true);
        }
    };
};
