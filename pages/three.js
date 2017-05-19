var orbitControls = null;
var container, camera, scene, renderer, loader;

var defaultCamera = null;
var gltf = null;
var mixer = null;
var clock = new THREE.Clock();

function onload() {

    window.addEventListener('resize', onWindowResize, false);

    switchScene(0);
    animate();

}

function initScene(index) {

    container = document.getElementById('container');

    scene = new THREE.Scene();

    defaultCamera = new THREE.PerspectiveCamera(45, container.offsetWidth / container.offsetHeight, 1, 20000);

    //defaultCamera.up = new THREE.Vector3( 0, 1, 0 );
    scene.add(defaultCamera);
    camera = defaultCamera;

    var sceneInfo = sceneList[0];

    var spot1 = null;

    if (sceneInfo.addLights) {

        var ambient = new THREE.AmbientLight(0x222222);
        scene.add(ambient);

        var directionalLight = new THREE.DirectionalLight(0xdddddd);
        directionalLight.position.set(0, 0, 1).normalize();
        scene.add(directionalLight);

        spot1 = new THREE.SpotLight(0xffffff, 1);
        spot1.position.set(10, 20, 10);
        spot1.angle = 0.25;
        spot1.distance = 1024;
        spot1.penumbra = 0.75;

        if (sceneInfo.shadows) {

            spot1.castShadow = true;
            spot1.shadow.bias = 0.0001;
            spot1.shadow.mapSize.width = 2048;
            spot1.shadow.mapSize.height = 2048;

        }

        scene.add(spot1);

    }

    // RENDERER

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x222222);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (sceneInfo.shadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.appendChild(renderer.domElement);

    var ground = null;

    if (sceneInfo.addGround) {
        var groundMaterial = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,
            shading: THREE.SmoothShading
        });
        ground = new THREE.Mesh(new THREE.PlaneBufferGeometry(512, 512), groundMaterial);

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

    var url = sceneInfo.url;
    var loadStartTime = performance.now();
    var status = document.getElementById("status");
    status.innerHTML = "Loading...";

    loader.load(url, function(data) {

        gltf = data;

        var object = gltf.scene;

        status.innerHTML = "Load time: " + (performance.now() - loadStartTime).toFixed(2) + " ms.";

        if (sceneInfo.cameraPos)
            defaultCamera.position.copy(sceneInfo.cameraPos);

        if (sceneInfo.center) {
            orbitControls.target.copy(sceneInfo.center);
        }

        if (sceneInfo.objectPosition) {
            object.position.copy(sceneInfo.objectPosition);

            if (spot1) {
                spot1.position.set(sceneInfo.objectPosition.x - 100, sceneInfo.objectPosition.y + 200, sceneInfo.objectPosition.z - 100);
                spot1.target.position.copy(sceneInfo.objectPosition);
            }
        }

        if (sceneInfo.objectRotation)
            object.rotation.copy(sceneInfo.objectRotation);

        if (sceneInfo.objectScale)
            object.scale.copy(sceneInfo.objectScale);

        if (sceneInfo.addEnvMap) {

            var envMap = getEnvMap();

            object.traverse(function(node) {

                if (node.material && node.material.isMeshStandardMaterial) {

                    node.material.envMap = envMap;
                    node.material.needsUpdate = true;

                }

            });

            scene.background = envMap;

        }

        var animations = gltf.animations;

        if (animations && animations.length) {

            mixer = new THREE.AnimationMixer(object);

            for (var i = 0; i < animations.length; i++) {

                var animation = animations[i];

                // There's .3333 seconds junk at the tail of the Monster animation that
                // keeps it from looping cleanly. Clip it at 3 seconds
                if (sceneInfo.animationTime)
                    animation.duration = sceneInfo.animationTime;

                mixer.clipAction(animation).play();

            }
        }

        scene.add(object);
        onWindowResize();

    });

    orbitControls = new THREE.OrbitControls(defaultCamera, renderer.domElement);

}

function onWindowResize() {

    defaultCamera.aspect = container.offsetWidth / container.offsetHeight;
    defaultCamera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    if (mixer) mixer.update(clock.getDelta());
    orbitControls.update();
    render();
}

function render() {
    renderer.render(scene, camera);
}

var envMap;

function getEnvMap() {

    if (envMap) {

        return envMap;

    }

    var path = 'textures/cube/Park2/';
    var format = '.jpg';
    var urls = [
        path + 'posx' + format, path + 'negx' + format,
        path + 'posy' + format, path + 'negy' + format,
        path + 'posz' + format, path + 'negz' + format
    ];

    envMap = new THREE.CubeTextureLoader().load(urls);
    envMap.format = THREE.RGBFormat;
    return envMap;

}

var rootPath = "file:///" + document.getElementById("gltfRootPath").textContent;
var fileName = document.getElementById("gltfFileName").textContent;
var sceneList = [
    {
        name: "glTF Preview", url: rootPath + fileName,
        cameraPos: new THREE.Vector3(2, 1, 3),
        objectRotation: new THREE.Euler(0, Math.PI, 0),
        addLights: true,
        extensions: ["glTF", "glTF-Binary"],
        addEnvMap: true
    }
];

function switchScene(index) {

    cleanup();
    initScene(index);
}

function cleanup() {

    if (container && renderer) {
        container.removeChild(renderer.domElement);
    }

    defaultCamera = null;

    if (!loader || !mixer)
        return;

    mixer.stopAllAction();

}

onload();
