// Defines the 3D engines that the menu allows the users to choose from.
var engineInfo = [{
    name: 'Babylon.js',
    html: 'babylonHtml',
    view: BabylonView
}, {
    name: 'Cesium',
    html: 'cesiumHtml',
    view: CesiumView
}, {
    name: 'Three.js',
    html: 'threeHtml',
    view: ThreeView
}];

// Use Cesium's built-in copy of Knockout as the global UI manager
window.ko = Cesium.knockout;

// Keep a reference to the active view engine, for cleanup.
var activeView;

// This is the main view model for the UI controls.
var mainViewModel = {
    engineInfo: ko.observableArray(engineInfo),
    selectedEngine: ko.observable(engineInfo.find(e => e.name === document.getElementById("defaultEngine").textContent)),
    showControls: ko.observable(true),
    hasBackground: ko.observable(false),
    showBackground: ko.observable(false),
    errorText: ko.observable(),
    hasErrorText: () => !!mainViewModel.errorText(),
    toggleControls: () => mainViewModel.showControls(!mainViewModel.showControls()),
    controlText: () => (mainViewModel.showControls() ? 'Close Controls' : 'Open Controls'),
    animations: ko.observableArray([]),
    playAll: () => {
        mainViewModel.animations().forEach(function(anim) {
            anim.active(true);
        });
    },
    playNone: () => {
        mainViewModel.animations().forEach(function(anim) {
            anim.active(false);
        });
    }
};

/**
* @function updatePreview
* Stops any any ction from the active engine, and then updates
* the DOM to use the newly selected engine.
*/
function updatePreview() {
    if (activeView) {
        activeView.cleanup();
        activeView = undefined;
    }

    // Clear errors/warnings.
    mainViewModel.errorText(undefined);

    var content = document.getElementById("content");

    // Update the DOM's "content" div with the HTML content for the currently selected
    // 3D engine.
    var activeEngineInfo = mainViewModel.selectedEngine();
    var engineHtml = decodeURI(document.getElementById(activeEngineInfo.html).textContent);
    var extensionRootPath = "file:///" + document.getElementById('extensionRootPath').textContent;
    content.innerHTML = engineHtml.replace(/{extensionRootPath}/g, extensionRootPath);

    // Cesium has some external assets that it will need to locate.  We configure the hint here,
    // before any of the 3D engines have loaded.
    window.CESIUM_BASE_URL = extensionRootPath + 'engines/Cesium/';

    activeView = new activeEngineInfo.view();
    activeView.startPreview();
}

function initPreview()
{
    // Bind the viewModel to the main UI panel.
    var mainUI = document.getElementById('mainUI');
    ko.applyBindings(mainViewModel, mainUI);

    // Bind the viewModel to the warning UI
    var errorUI = document.getElementById('warningContainer');
    ko.applyBindings(mainViewModel, warningContainer);

    // Subscribe to changes in the viewModel
    mainViewModel.selectedEngine.subscribe(updatePreview);

    // Capture JavaScript errors and display them.
    window.addEventListener('error', function(error) {
        var message = error.toString();
        if (error && error.message) {
            message = error.message;
        }
        mainViewModel.errorText(message);
    });

    updatePreview();
}

window.addEventListener('load', initPreview, false);
