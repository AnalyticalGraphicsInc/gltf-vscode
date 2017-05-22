// Tracks if this engine is currently the active engine.
var enabled = false;

/**
* @function cleanup
* Perform any cleanup that needs to happen to stop rendering the current model.
* This is called right before the active engine for the preview window is switched.
*/
function cleanup() {
    enabled = false;
    window.removeEventListener('resize', onWindowResize);
    engine.stopRenderLoop(render);
}

var errorContainer = document.getElementById('errorContainer');
window.onerror = function(error) {
    errorContainer.style.display = 'block';
    errorContainer.textContent = error.toString();
};

enabled = true;
BABYLON.SceneLoader.ShowLoadingScreen = false;
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true);
var scene = null;
engine.enableOfflineSupport = false;

var rootPath = document.getElementById("gltfRootPath").textContent;
var fileName = document.getElementById("gltfFileName").textContent;

BABYLON.SceneLoader.Load(rootPath, fileName, engine, function(newScene) {
    scene = newScene;
    scene.createDefaultCameraOrLight(true);
    scene.activeCamera.attachControl(canvas);
    engine.runRenderLoop(render);
}, null, window.onerror);

function render()
{
    scene.render();
}

function onWindowResize() {
    engine.resize();
}

window.addEventListener("resize", onWindowResize);
