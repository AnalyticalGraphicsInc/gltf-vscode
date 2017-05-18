var engines = [
    "Babylon.js",
    "Cesium",
    "Three.js"
];

var Options = function() {
    // Set defaults
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

function readFile(file, fn) {
    var rawFile = new XMLHttpRequest();
    rawFile.open("GET", file, false);
    rawFile.onreadystatechange = function() {
        if (rawFile.readyState === 4) {
            if (rawFile.status === 200 || rawFile.status == 0) {
                fn(rawFile.responseText);
            }
        }
    }

    rawFile.send(null);
}

function updatePreviewFS() {
    var scriptPath = document.getElementById("previewModel").getAttribute('scriptPath');
    var content = document.getElementById("content");

    var rendererElementId = options.engine.toLocaleLowerCase();
    var extensionRootPath = "file:///" + document.getElementById('extensionRootPath').textContent;
    var engineHtmlPath = extensionRootPath + "pages/" + rendererElementId + ".html";

    readFile(engineHtmlPath, function(fileContent) {
        content.innerHtml = fileContent.replace(/{extensionRootPath}/g, extensionRootPath);

        // Now, unfortunately, scripts that are added to the DOM won't be executed, but if
        // we add them to the head, they will.  So, we'll iterate through all script tags
        // in the code we just inserted and we'll add them to the Head.  Along the way, we'll
        // give them all the same special ID so that we can easily remove them later.
        clearRemovableHeadElements();
        var scriptElements = content.getElementsByTagName('script')
        for (var i = 0; i < scriptElements.length; i++) {
            addHeadScript(scriptElements[i].src, scriptElements[i].innerHTML);
        }

        var linkElements = content.getElementsByTagName('link')
        for (var i = 0; i < linkElements.length; i++) {
            addHeadLink(linkElements[i].href, linkElements[i].innerHTML);
        }
    });
}

function updatePreview() {
    var scriptPath = document.getElementById("previewModel").getAttribute('scriptPath');
    var content = document.getElementById("content");

    var rendererElementId = options.engine.toLocaleLowerCase();
    var extensionRootPath = "file:///" + document.getElementById('extensionRootPath').textContent;
    var engineHtmlPath = extensionRootPath + "pages/" + rendererElementId + ".html";

    var rendererHtml = decodeURI(document.getElementById(rendererElementId).textContent);
    rendererHtml = rendererHtml.replace(/{extensionRootPath}/g, extensionRootPath);
    content.innerHTML = rendererHtml;

    // Now, unfortunately, scripts that are added to the DOM won't be executed, but if
    // we add them to the head, they will.  So, we'll iterate through all script tags
    // in the code we just inserted and we'll add them to the Head.  Along the way, we'll
    // give them all the same special ID so that we can easily remove them later.
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

var gui = new dat.GUI();
gui.add(options, "engine", engines).onChange(updatePreview);
//gui.addColor(options, "background").onChange(updatePreview);
gui.add(options, "help");

window.onload = updatePreview;
