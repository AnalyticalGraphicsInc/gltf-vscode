/**
* @function cleanup
* Perform any cleanup that needs to happen to stop rendering the current model.
* This is called right before the active engine for the preview window is switched.
*/
function cleanup() {
}

var errorContainer = document.getElementById('errorContainer');
window.onerror = function(error) {
    errorContainer.style.display = 'block';
    errorContainer.textContent = error.toString();
};

BABYLON.SceneLoader.ShowLoadingScreen = false;
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true);
engine.enableOfflineSupport = false;

var rootPath = document.getElementById("gltfRootPath").textContent;
var fileName = document.getElementById("gltfFileName").textContent;

BABYLON.SceneLoader.Load(rootPath, fileName, engine, function (scene) {
    scene.createDefaultCameraOrLight(true);
    scene.activeCamera.attachControl(canvas);

    engine.runRenderLoop(function () {
        scene.render();
    });
});

window.addEventListener("resize", function () {
    engine.resize();
});
