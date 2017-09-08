// Defines the 3D engines that the menu allows the users to choose from.
var engines = [
    "Babylon.js",
    "Cesium",
    "Three.js"
];

var engineInfo = {
    'Babylon.js': {
        html: 'babylonHtml',
        view: BabylonView
    },
    'Cesium': {
        html: 'cesiumHtml',
        view: CesiumView
    },
    'Three.js': {
        html: 'threeHtml',
        view: ThreeView
    }
};

// This is the main interface object for dat.gui.  We define the initial
// default values for each option within here, and the current menu
// values will always be reflected here.
var Options = function() {
    this.engine = document.getElementById("defaultEngine").textContent;
    this.showBackground = false;
    this.help = "Press 'h' to show / hide";
    this.backgroundGuiCallback = function() {};
};

var options = new Options();
var mainGui;
var backgroundGuiElement;
var activeView;

// The id that we'll add to any element that we're dynamically adding/removing
// from the head when the active 3D engine changes.
var removableElementId = 'removableHeadElement';

/**
* @function clearRemovableHeadElements
* Removes any element from the DOM that has the
* removableElementId id (since the DOM supports multiple
* elements with the same id.)
*/
function clearRemovableHeadElements()
{
    while (true)
    {
        var element = document.getElementById(removableElementId);
        if (element === null) {
            break;
        }

        element.remove();
    }
}

/**
* @function addHeadScript
* Dynamically adds a script to the "head" element of the DOM.
* This is the only reliable way to get dynamically added script
* elements to be evaluated. (eval() can't be used because it only
* evaluates in-lined script bodies and not scripts that are
* referenced by the "src" attribute.)
* All scripts added this way will use the id defined by
* removableElementId so that they can be easily removed via
* clearRemovableHeadElements.
* @param  {string} src  The src link for the external script.
* @param  {string} body The body content of the script element if it's not a remote script.
*/
function addHeadScript(src, body)
{
    var head = document.getElementsByTagName("head")[0];
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = src;
    script.id = removableElementId;
    script.innerHTML = body;
    head.appendChild(script);
}

/**
* @function addHeadLink
* Dynamically adds a CSS link element to the "head" element of the DOM.
* This was the only reliable way identified that would evaluate
* CSS that is dynamically injected into an HTML body.
* All link elements added this way will use the id defined by
* removableElementId so that they can be easily removed via
* clearRemovableHeadElements.
* @param  {string} src  The src link for the external CSS file.
* @param  {string} body The body content of the CSS element if it's not a remote file.
*/
function addHeadLink(href, body) {
    var head = document.getElementsByTagName("head")[0];
    var link = document.createElement("link");
    link.rel = 'stylesheet';
    link.type = "text/css";
    link.href = href;
    link.id = removableElementId;
    link.innerHTML = body;
    head.appendChild(link);
}

/**
* @function updatePreview
* Stops any any ction from the active engine, and then updates
* the DOM to use the newly selected engine.
*/
function updatePreview() {
    if (activeView) {
        activeView.cleanup();
    }
    clearWarning();

    var content = document.getElementById("content");

    // Update the DOM's "content" div with the HTML content for the currently selected
    // 3D engine.
    var activeEngineInfo = engineInfo[options.engine];
    var engineHtml = decodeURI(document.getElementById(activeEngineInfo.html).textContent);
    var extensionRootPath = "file:///" + document.getElementById('extensionRootPath').textContent;
    content.innerHTML = engineHtml.replace(/{extensionRootPath}/g, extensionRootPath);

    // Cesium has some external assets that it will need to locate.  We configure the hint here,
    // before any of the 3D engines have loaded.
    window.CESIUM_BASE_URL = extensionRootPath + 'engines/Cesium/';

    activeView = new activeEngineInfo.view();
    activeView.startPreview();
}

/**
* @function fadeOut
* Fades out an HTML element
* @param  {object} element The HTML element being faded out.
* @credit http://idiallo.com/javascript/using-requestanimationframe
*/
function fadeOut(element) {
    var opacity = element.style.opacity;

    function decrease () {
        opacity -= 0.05;
        if (opacity <= 0) {
            element.style.opacity = 0;
            return true;
        }

        element.style.opacity = opacity;
        requestAnimationFrame(decrease);
    }

    decrease();
}

/**
* @function fadeIn
* Fades in an HTML element
* @param  {object} element The HTML element being faded in.
* @credit http://idiallo.com/javascript/using-requestanimationframe
*/
function fadeIn(element) {
    var opacity = element.style.opacity;

    function increase () {
        opacity += 0.05;
        if (opacity >= 1) {
            element.style.opacity = 1;
            return true;
        }

        element.style.opacity = opacity;
        requestAnimationFrame(increase);
    }

    increase();
}

/**
* @function clearWarning
* Hides any warning currently being displayed.
*/
function clearWarning() {
    showWarning(null);
}

/**
* @function showWarning
* Displays (or hides) a warning overlay indefinitely, or for the provided duration.
* @param  {string} message  The warning to display.  If null, hides the message.
* @param  {type} durationMs The number of milliseconds to display the warning before auto-hiding it.  Defaults to null (indefinite timeout).
*/
function showWarning(message, durationMs = null) {
    var warning = document.getElementById("warningContainer");
    warningContainer.style.display = 'block';

    if (null === message) {
        fadeOut(warning);
    } else {
        warning.textContent = message;
        fadeIn(warning);
    }

    if (null !== durationMs) {
        setTimeout(function() {
            clearWarning();
        }, durationMs);
    }
}

function initPreview()
{
    // Create and initialize the dat.gui menu UI
    var gui = new dat.GUI();
    gui.add(options, "engine", engines).onChange(updatePreview);
    var backgroundGui = gui.add(options, "showBackground").name('show background').onChange(
        function() { options.backgroundGuiCallback(options.showBackground); });
    gui.add(options, "help");

    mainGui = gui;
    backgroundGuiElement = backgroundGui.__li;

    updatePreview();
}

window.addEventListener('load', initPreview, false);
