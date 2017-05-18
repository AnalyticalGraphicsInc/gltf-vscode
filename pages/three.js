var orbitControls = null;
var container, camera, scene, renderer, loader;

var cameraIndex = 0;
var cameras = [];
var cameraNames = [];
var defaultCamera = null;
var gltf = null;
var mixer = null;
var clock = new THREE.Clock();

function onload() {

    window.addEventListener( 'resize', onWindowResize, false );
    document.addEventListener( 'keydown', function(e) { onKeyDown(e); }, false );

    buildSceneList();
    switchScene(0);
    animate();

}

function initScene(index) {

    container = document.getElementById( 'container' );

    scene = new THREE.Scene();

    defaultCamera = new THREE.PerspectiveCamera( 45, container.offsetWidth / container.offsetHeight, 1, 20000 );

    //defaultCamera.up = new THREE.Vector3( 0, 1, 0 );
    scene.add( defaultCamera );
    camera = defaultCamera;

    var sceneInfo = sceneList[index];

    var spot1 = null;

    if (sceneInfo.addLights) {

        var ambient = new THREE.AmbientLight( 0x222222 );
        scene.add( ambient );

        var directionalLight = new THREE.DirectionalLight( 0xdddddd );
        directionalLight.position.set( 0, 0, 1 ).normalize();
        scene.add( directionalLight );

        spot1   = new THREE.SpotLight( 0xffffff, 1 );
        spot1.position.set( 10, 20, 10 );
        spot1.angle = 0.25;
        spot1.distance = 1024;
        spot1.penumbra = 0.75;

        if ( sceneInfo.shadows ) {

            spot1.castShadow = true;
            spot1.shadow.bias = 0.0001;
            spot1.shadow.mapSize.width = 2048;
            spot1.shadow.mapSize.height = 2048;

        }

        scene.add( spot1 );

    }

    // RENDERER

    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setClearColor( 0x222222 );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );

    if (sceneInfo.shadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.appendChild( renderer.domElement );

    var ground = null;

    if (sceneInfo.addGround) {
        var groundMaterial = new THREE.MeshPhongMaterial({
                color: 0xFFFFFF,
                shading: THREE.SmoothShading
            });
        ground = new THREE.Mesh( new THREE.PlaneBufferGeometry(512, 512), groundMaterial);

        if (sceneInfo.shadows) {
            ground.receiveShadow = true;
        }

        if (sceneInfo.groundPos) {
            ground.position.copy(sceneInfo.groundPos);
        } else {
            ground.position.z = -70;
        }

        ground.rotation.x = -Math.PI / 2;

        scene.add(ground);
    }

    loader = new THREE.GLTF2Loader();

    for (var i = 0; i < extensionSelect.children.length; i++) {
        var child = extensionSelect.children[i];
        child.disabled = sceneInfo.extensions.indexOf(child.value) === -1;
        if (child.disabled && child.selected) {
            extensionSelect.value = extension = 'glTF';
        }
    }

    var url = sceneInfo.url;
    var r = eval("/" + '\%s' + "/g");
    url = url.replace(r, extension);

    if (extension === 'glTF-Binary') {
        url = url.replace('.gltf', '.glb');
    }

    var loadStartTime = performance.now();
    var status = document.getElementById("status");
    status.innerHTML = "Loading...";

    loader.load( url, function(data) {

        gltf = data;

        var object = gltf.scene;

        status.innerHTML = "Load time: " + ( performance.now() - loadStartTime ).toFixed( 2 ) + " ms.";

        if (sceneInfo.cameraPos)
            defaultCamera.position.copy(sceneInfo.cameraPos);

        if (sceneInfo.center) {
            orbitControls.target.copy(sceneInfo.center);
        }

        if (sceneInfo.objectPosition) {
            object.position.copy(sceneInfo.objectPosition);

            if (spot1) {
                spot1.position.set(sceneInfo.objectPosition.x - 100, sceneInfo.objectPosition.y + 200, sceneInfo.objectPosition.z - 100 );
                spot1.target.position.copy(sceneInfo.objectPosition);
            }
        }

        if (sceneInfo.objectRotation)
            object.rotation.copy(sceneInfo.objectRotation);

        if (sceneInfo.objectScale)
            object.scale.copy(sceneInfo.objectScale);

        cameraIndex = 0;
        cameras = [];
        cameraNames = [];

        if (gltf.cameras && gltf.cameras.length) {

            var i, len = gltf.cameras.length;

            for (i = 0; i < len; i++) {

                var addCamera = true;
                var cameraName = gltf.cameras[i].parent.name;

                if (sceneInfo.cameras && !(cameraName in sceneInfo.cameras)) {
                        addCamera = false;
                }

                if (addCamera) {
                    cameraNames.push(cameraName);
                    cameras.push(gltf.cameras[i]);
                }

            }

            updateCamerasList();
            switchCamera(1);

        } else {

            updateCamerasList();
            switchCamera(0);

        }

        var animations = gltf.animations;

        if ( animations && animations.length ) {

            mixer = new THREE.AnimationMixer( object );

            for ( var i = 0; i < animations.length; i ++ ) {

                var animation = animations[ i ];

                // There's .3333 seconds junk at the tail of the Monster animation that
                // keeps it from looping cleanly. Clip it at 3 seconds
                if ( sceneInfo.animationTime )
                    animation.duration = sceneInfo.animationTime;

                mixer.clipAction( animation ).play();

            }

        }

        scene.add( object );
        onWindowResize();

    });

orbitControls = new THREE.OrbitControls(defaultCamera, renderer.domElement);

}

function onWindowResize() {

    defaultCamera.aspect = container.offsetWidth / container.offsetHeight;
    defaultCamera.updateProjectionMatrix();

    var i, len = cameras.length;

    for (i = 0; i < len; i++) { // just do it for default
        cameras[i].aspect = container.offsetWidth / container.offsetHeight;
        cameras[i].updateProjectionMatrix();
    }

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {
    requestAnimationFrame( animate );
    if (mixer) mixer.update(clock.getDelta());
    if (cameraIndex == 0)
        orbitControls.update();
    render();
}

function render() {
    renderer.render( scene, camera );
}

function onKeyDown(event) {

    var chr = String.fromCharCode(event.keyCode);

    if (chr == ' ') {

        index = cameraIndex + 1;
        if (index > cameras.length)
        index = 0;
        switchCamera(index);

    } else {

        var index = parseInt(chr);
        if (!isNaN(index)	&& (index <= cameras.length)) {
            switchCamera(index);
        }

    }

}


var rootPath = document.getElementById("gltfRootPath").textContent.replace(/\\/g, '/');
if (!rootPath.endsWith("/")) { rootPath += "/"; }
var fileName = document.getElementById("gltfFileName").textContent;

var sceneList = [
    {
        name : "glTF Preview", url : rootPath + fileName,
        cameraPos: new THREE.Vector3(2, 1, 3),
        objectRotation: new THREE.Euler(0, Math.PI, 0),
        addLights:true,
        extensions: ["glTF", "glTF-Binary"],
        addEnvMap: true
    }
];

function buildSceneList() {

    var elt = document.getElementById('scenes_list');

    while( elt.hasChildNodes() ){
        elt.removeChild(elt.lastChild);
    }

    var i, len = sceneList.length;

    for (i = 0; i < len; i++) {
        option = document.createElement("option");
        option.text=sceneList[i].name;
        elt.add(option);
    }

}

function switchScene(index) {

    cleanup();
    initScene(index);
    var elt = document.getElementById('scenes_list');
    elt.selectedIndex = index;

}

function selectScene() {

    var select = document.getElementById("scenes_list");
    var index = select.selectedIndex;

    if (index >= 0) {
        switchScene(index);
    }

}

function switchCamera(index) {

    cameraIndex = index;

    if (cameraIndex == 0) {
        camera = defaultCamera;
    }

    if (cameraIndex >= 1 && cameraIndex <= cameras.length) {
        camera = cameras[cameraIndex - 1];
    }

    var elt = document.getElementById('cameras_list');
    elt.selectedIndex = cameraIndex;

}

function updateCamerasList() {

    var elt = document.getElementById('cameras_list');

    while( elt.hasChildNodes() ){
        elt.removeChild(elt.lastChild);
    }

    option = document.createElement("option");
    option.text="[default]";
    elt.add(option);

    var i, len = cameraNames.length;

    for (i = 0; i < len; i++) {
        option = document.createElement("option");
        option.text=cameraNames[i];
        elt.add(option);
    }

}

function selectCamera() {

    var select = document.getElementById("cameras_list");
    var index = select.selectedIndex;

    if (index >= 0) {
        switchCamera(index);
    }

}

function toggleAnimations() {

    var i, len = gltf.animations.length;

    for (i = 0; i < len; i++) {

        var clip = gltf.animations[i];
        var action = mixer.existingAction( clip );

        if (action.isRunning()) {
            action.stop();
        } else {
            action.play();
        }

    }

}

var extensionSelect = document.getElementById("extensions_list");
var extension = extensionSelect.value;
function selectExtension()
{
    extension = extensionSelect.value;
    selectScene();
}

function cleanup() {

    if (container && renderer) {
        container.removeChild(renderer.domElement);
    }

    cameraIndex = 0;
    cameras = [];
    cameraNames = [];
    defaultCamera = null;

    if (!loader || !mixer)
        return;

    mixer.stopAllAction();

}

onload();
