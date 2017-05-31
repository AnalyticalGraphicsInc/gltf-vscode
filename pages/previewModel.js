// Defines the 3D engines that the menu allows the users to choose from.
var engines = [
    "Babylon.js",
    "Cesium",
    "Three.js"
];

// This is the main interface object for dat.gui.  We define the initial
// default values for each option within here, and the current menu
// values will always be reflected here.
var Options = function() {
    this.engine = document.getElementById("defaultEngine").textContent;
    this.help = "Press 'h' to show / hide"
};

var options = new Options();

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
* @function cleanup
* Perform any cleanup that needs to happen to stop rendering the current model.
* This is called right before the active engine for the preview window is switched.
* This method will get overridden by whatever 3D engine is currently loaded.
* It has to be defined here though since we always call cleanup before switching
* engines, so on initial load, this is the version that will be called.
*/
function cleanup() {

}

/**
* @function updatePreview
* Stops any any ction from the active engine, and then updates
* the DOM to use the newly selected engine.
*/
function updatePreview() {
    cleanup();
    clearWarning();

    var content = document.getElementById("content");

    // Update the DOM's "content" div with the HTML content for the currently selected
    // 3D engine.
    var engineElementId = options.engine.toLocaleLowerCase();
    var engineHtml = decodeURI(document.getElementById(engineElementId).textContent);
    var extensionRootPath = "file:///" + document.getElementById('extensionRootPath').textContent;
    content.innerHTML = engineHtml.replace(/{extensionRootPath}/g, extensionRootPath);

    // Now, unfortunately, scripts that are added to the DOM won't be executed, but if
    // we add them to the head, they will.  So, we'll iterate through all script tags
    // in the code we just inserted and we'll add them to the Head.  Along the way, we'll
    // give them all the same special ID so that we can easily remove them later.
    // We then do something similar for link (CSS) elements.
    clearRemovableHeadElements();
    var scriptElements = content.getElementsByTagName('script')
    for (var i = 0; i < scriptElements.length; i++) {
        addHeadScript(scriptElements[i].src, scriptElements[i].innerHTML);
    }

    var linkElements = content.getElementsByTagName('link')
    for (var i = 0; i < linkElements.length; i++) {
        addHeadLink(linkElements[i].href, linkElements[i].innerHTML);
    }
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
    gui.add(options, "help");

    updatePreview();
}

initPreview();
