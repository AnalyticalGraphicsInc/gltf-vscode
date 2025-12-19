/*global Cesium,ko,CesiumView,BabylonView,acquireVsCodeApi*/
import { FilamentView } from './filamentView.js';
import { ThreeView } from './threeView.js';

(function() {
    'use strict';

window.vscode = acquireVsCodeApi();

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
    name: 'Filament',
    html: 'filamentHtml',
    view: FilamentView
}, {
    name: 'Three.js',
    html: 'threeHtml',
    view: ThreeView
}];

// Use Cesium's built-in copy of Knockout as the global UI manager
window.ko = Cesium.knockout;

// Keep a reference to the active view engine, for cleanup.
var activeView;

var ANIM_PLAY_ALL = 'All';
var ANIM_PLAY_NONE = 'None';

// This is the main view model for the UI controls.
var mainViewModel = window.mainViewModel = {
    engineInfo: ko.observableArray(engineInfo),
    engineUI: ko.observable('blankTemplate'),
    selectedEngine: ko.observable(engineInfo.find(e => e.name === document.getElementById('defaultEngine').textContent)),
    showControls: ko.observable(true),
    hasBackground: ko.observable(false),
    showBackground: ko.observable(false),
    toggleControls: () => mainViewModel.showControls(!mainViewModel.showControls()),
    controlText: () => (mainViewModel.showControls() ? 'Close Controls' : 'Open Controls'),
    animations: ko.observableArray([]),
    animPlayAllNone: ko.observable(ANIM_PLAY_NONE),
    animPlayAllNoneOptions: ko.observableArray([ANIM_PLAY_ALL, ANIM_PLAY_NONE]),
    anyAnimChanged: () => {
        // After any animation is toggled individually, we must check if all animations
        // have become the same state, or if there are different states in use now,
        // so that the All/None radio buttons can update accordingly.
        var activeList = mainViewModel.animations().map(a => a.active());
        if ((activeList.length === 0) || (activeList.every(a => a === false))) {
            mainViewModel.animPlayAllNone(ANIM_PLAY_NONE);
        } else if (activeList.every(a => a === true)) {
            mainViewModel.animPlayAllNone(ANIM_PLAY_ALL);
        } else {
            mainViewModel.animPlayAllNone(undefined);
        }
    },
    showErrorMessage: (message) => window.vscode.postMessage({ command: 'showErrorMessage', message: message }),
    showWarningMessage: (message) => window.vscode.postMessage({ command: 'showWarningMessage', message: message }),
    setDebugActive: (value) => window.vscode.postMessage({ command: 'setDebugActive', value: value }),
    onReady: () => window.vscode.postMessage({ command: 'onReady' })
};

/**
* @function playAllOrNoAnimations
* Plays or stops all animations when the user clicks the 'All' or 'None' radio buttons.
* No action is taken if neither 'All' nor 'None' is selected, because
* the user may be playing only some of the animations, in which case the
* selected option will be undefined.
*/
function playAllOrNoAnimations(option) {
    if (option === ANIM_PLAY_ALL) {
        mainViewModel.animations().forEach(function(anim) {
            anim.active(true);
        });
    } else if (option === ANIM_PLAY_NONE) {
        mainViewModel.animations().forEach(function(anim) {
            anim.active(false);
        });
    }
}

/**
* @function updatePreview
* Stops any action from the active engine, and then updates
* the DOM to use the newly selected engine.
*/
function updatePreview() {
    if (activeView) {
        activeView.cleanup();
        activeView = undefined;
    }

    var content = document.getElementById('content');

    // Update the DOM's "content" div with the HTML content for the currently selected
    // 3D engine.
    var activeEngineInfo = mainViewModel.selectedEngine();
    content.innerHTML = decodeURI(document.getElementById(activeEngineInfo.html).textContent);

    // Cesium has some external assets that it will need to locate.  We configure the hint here,
    // before any of the 3D engines have loaded.
    var extensionRootPath = document.getElementById('extensionRootPath').textContent;
    window.CESIUM_BASE_URL = extensionRootPath + '/node_modules/cesium/Build/Cesium/';

    activeView = new activeEngineInfo.view();
    activeView.startPreview();
}

function initPreview()
{
    // Bind the viewModel to the main UI panel.
    var mainUI = document.getElementById('mainUI');
    ko.applyBindings(mainViewModel, mainUI);

    // Subscribe to changes in the viewModel
    mainViewModel.selectedEngine.subscribe(updatePreview);
    mainViewModel.animPlayAllNone.subscribe(playAllOrNoAnimations);

    // Capture JavaScript errors and display them.
    window.addEventListener('error', function(error) {
        var message = error.toString();
        if (error && error.message) {
            message = error.message;
        }
        mainViewModel.showErrorMessage(message);
    });

    // Disallow the WebView context menu, which has copy/paste controls.
    var content = document.getElementById('content');
    content.addEventListener('contextmenu', function(event) {
        event.preventDefault();
    });

    window.addEventListener('message', function(event) {
        switch (event.data.command) {
            case 'refresh': {
                updatePreview();
                break;
            }
            case 'enableDebugMode':
            case 'disableDebugMode': {
                if (mainViewModel.selectedEngine().name === 'Babylon.js') {
                    const mainUI = document.getElementById('mainUI');
                    if (event.data.command === 'enableDebugMode') {
                        mainUI.style.display = 'none';
                        activeView.enableDebugMode();
                    }
                    else {
                        activeView.disableDebugMode();
                        mainUI.style.display = 'block';
                    }
                    mainViewModel.setDebugActive(activeView.isDebugModeEnabled());
                }
                else {
                    mainViewModel.showWarningMessage('Only Babylon.js supports debug mode');
                }
                break;
            }
            case 'updateDebugMode': {
                if (mainViewModel.selectedEngine().name === 'Babylon.js') {
                    mainViewModel.setDebugActive(activeView.isDebugModeEnabled());
                }
                break;
            }
        }
    });

    updatePreview();
}

window.addEventListener('load', initPreview, false);

window.launchKtxViewer = function() {
    window.vscode.postMessage({ command: 'launchKtxViewer' });
};
})();
