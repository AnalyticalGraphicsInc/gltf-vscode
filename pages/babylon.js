
var BabylonPreview = function() {
    // Tracks if this engine is currently the active engine.
    var enabled = false;

    var canvas = null;
    var engine = null;
    var scene = null;

    /**
    * @function cleanup
    * Perform any cleanup that needs to happen to stop rendering the current model.
    * This is called right before the active engine for the preview window is switched.
    */
    this.cleanup = function() {
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

    this.startPreview = function() {
        var errorContainer = document.getElementById('errorContainer');
        window.onerror = function(error) {
            errorContainer.style.display = 'block';
            errorContainer.textContent = error.toString();
        };

        enabled = true;
        BABYLON.SceneLoader.ShowLoadingScreen = false;
        canvas = document.getElementById("renderCanvas");
        engine = new BABYLON.Engine(canvas, true);
        scene = null;
        engine.enableOfflineSupport = false;

        var rootPath = document.getElementById("gltfRootPath").textContent;
        var gltfContent = document.getElementById('gltf').textContent;

        BABYLON.GLTFFileLoader.IncrementalLoading = false;
        BABYLON.SceneLoader.Load(rootPath, 'data:' + gltfContent, engine, function(newScene) {
            scene = newScene;
            scene.createDefaultCameraOrLight(true);
            scene.activeCamera.attachControl(canvas);
            engine.runRenderLoop(render);
        }, null, window.onerror);

        window.addEventListener("resize", onWindowResize);
    };
};

/**
* @function cleanup
* Perform any cleanup that needs to happen to stop rendering the current model.
* This is called right before the active engine for the preview window is switched.
*/
function cleanup() {
    babylonPreview.cleanup();
}

var babylonPreview = new BabylonPreview();
babylonPreview.startPreview();
