/*global mainViewModel,ko*/
import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from '../node_modules/three/examples/jsm/loaders/RGBELoader.js';
import { DRACOLoader } from '../node_modules/three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';

export class ThreeView {
    constructor() {
        // Tracks if this engine is currently the active engine.
        this._enabled = false;

        this._container = null;
        this._camera = null;
        this._clock = null;
        this._scene = null;
        this._renderer = null;
        this._mixer = null;
        this._orbitControls = null;
        this._backgroundSubscription = undefined;
    }

    _subscribeToAnimUI(anim) {
        anim.active.subscribe(function(newValue) {
            mainViewModel.anyAnimChanged();
            var action = anim.clipAction;
            if (!newValue) {
                action.stop();
            } else {
                action.play();
            }
        });
    }

    _initScene(rootPath, gltfContent) {
        this._clock = new THREE.Clock();

        this._container = document.getElementById('threeContainer');

        var scene = this._scene = new THREE.Scene();

        // Note: The near and far planes can be set this way due to the use of "logarithmicDepthBuffer" in the renderer below.
        var camera = this._camera = new THREE.PerspectiveCamera(45, this._container.offsetWidth / this._container.offsetHeight, 1e-5, 1e10);

        scene.add(camera);

        var hemispheric = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);
        scene.add(hemispheric);

        // RENDERER
        var renderer = this._renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setClearColor(0x222222);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.outputEncoding = THREE.sRGBEncoding;

        this._container.appendChild(renderer.domElement);

        var loader = new GLTFLoader();

        var dracoLoaderPathAndFile = document.getElementById('dracoLoaderPath').textContent;
        // Replace a slash followed by anything but a slash, to the end, with just a slash.
        var dracoLoaderPath = dracoLoaderPathAndFile.replace(/\/[^\/]*$/, '/');
        var dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(dracoLoaderPath);

        loader.setDRACOLoader( dracoLoader );

        var cameraPos = new THREE.Vector3(-0.2, 0.4, 1.4);
        var orbitControls = this._orbitControls = new OrbitControls(this._camera, renderer.domElement);

        loader.parse(gltfContent, rootPath, data => {
            var gltf = data;
            var object = gltf.scene;

            var defaultThreeReflection = document.getElementById('defaultThreeReflection').textContent.split('{face}');
            var envMap;
            var envPath = defaultThreeReflection[0];
            if (defaultThreeReflection.length === 2) {
                // Backwards compatibility for older, standard dynamic range backgrounds.
                var envFormat = defaultThreeReflection[1];

                envMap = new THREE.CubeTextureLoader().load([
                    envPath + 'posx' + envFormat, envPath + 'negx' + envFormat,
                    envPath + 'posy' + envFormat, envPath + 'negy' + envFormat,
                    envPath + 'posz' + envFormat, envPath + 'negz' + envFormat
                ]);
                envMap.format = THREE.RGBFormat;
                scene.environment = envMap;
            } else {
                // Recommended path: HDR environments have details revealed by bright and dark reflective surfaces on models.
                var pmremGenerator = new THREE.PMREMGenerator( renderer );
                pmremGenerator.compileEquirectangularShader();

                new RGBELoader()
                    .setDataType(THREE.UnsignedByteType)
                    .load(envPath, (texture) => {
                        envMap = pmremGenerator.fromEquirectangular(texture).texture;
                        pmremGenerator.dispose();
                        scene.environment = envMap;
                        applyBackground(mainViewModel.showBackground());
                    });
            }

            mainViewModel.hasBackground(true);
            function applyBackground(showBackground) {
                scene.background = showBackground ? envMap : null;
            }
            applyBackground(mainViewModel.showBackground());
            this._backgroundSubscription = mainViewModel.showBackground.subscribe(applyBackground);

            // Center the model on screen based on bounding box information.
            object.updateMatrixWorld();
            var boundingBox = new THREE.Box3().setFromObject(object);
            var modelSizeVec3 = new THREE.Vector3();
            boundingBox.getSize(modelSizeVec3);
            var modelSize = modelSizeVec3.length();
            var modelCenter = new THREE.Vector3();
            boundingBox.getCenter(modelCenter);

            // Set up mouse orbit controls.
            orbitControls.reset();
            orbitControls.maxDistance = modelSize * 50;
            orbitControls.enableDamping = true;
            orbitControls.dampingFactor = 0.07;
            orbitControls.rotateSpeed = 0.4;
            orbitControls.panSpeed = 0.4;
            orbitControls.screenSpacePanning = true;

            // Position the camera accordingly.
            object.position.x = -modelCenter.x;
            object.position.y = -modelCenter.y;
            object.position.z = -modelCenter.z;
            camera.position.copy(modelCenter);
            camera.position.x += modelSize * cameraPos.x;
            camera.position.y += modelSize * cameraPos.y;
            camera.position.z += modelSize * cameraPos.z;
            camera.near = modelSize / 100;
            camera.far = modelSize * 100;
            camera.updateProjectionMatrix();
            camera.lookAt(modelCenter);

            // Set up UI controls for any animations in the model.
            var gltfAnimations = gltf.animations;
            var koAnimations = [];
            if (gltfAnimations && gltfAnimations.length) {
                this._mixer = new THREE.AnimationMixer(object);

                for (let i = 0; i < gltfAnimations.length; i++) {
                    var animation = gltfAnimations[i];
                    var clipAction = this._mixer.clipAction(animation);

                    var anim = {
                        index: i,
                        name: gltfAnimations[i].name || i,
                        active: ko.observable(false),
                        clipAction: clipAction
                    };
                    this._subscribeToAnimUI(anim);
                    koAnimations.push(anim);
                }

                mainViewModel.animations(koAnimations);
                mainViewModel.anyAnimChanged();
            }

            scene.add(object);
            this._onWindowResize();

            mainViewModel.onReady();
        }, function(error) {
            console.error(error);
            mainViewModel.showErrorMessage(error.stack);
        });
    }

    _onWindowResize() {
        if (!this._enabled) {
            return;
        }

        this._camera.aspect = this._container.offsetWidth / this._container.offsetHeight;
        this._camera.updateProjectionMatrix();

        this._renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _animate() {
        if (!this._enabled) {
            return;
        }

        requestAnimationFrame(() => this._animate());

        if (this._mixer) {
            this._mixer.update(this._clock.getDelta());
        }

        this._orbitControls.update();
        this._renderer.render(this._scene, this._camera);
    }

    /**
    * @function cleanup
    * Perform any cleanup that needs to happen to stop rendering the current model.
    * This is called right before the active engine for the preview window is switched.
    */
    cleanup() {
        if (this._backgroundSubscription) {
            this._backgroundSubscription.dispose();
            this._backgroundSubscription = undefined;
        }
        this._enabled = false;

        if (this._container && this._renderer) {
            this._container.removeChild(this._renderer.domElement);
        }

        this._camera = null;

        mainViewModel.animations([]);
        if (this._mixer) {
            this._mixer.stopAllAction();
        }

        window.removeEventListener('resize', this._resizeHandler, false);
    }

    startPreview() {
        var rev = document.getElementById('threeRevision');
        rev.textContent = 'r' + THREE.REVISION;

        var rootPath = document.getElementById('gltfRootPath').textContent;
        var gltfContent = document.getElementById('gltf').textContent;

        this._resizeHandler = () => this._onWindowResize();
        this._enabled = true;
        this._initScene(rootPath, gltfContent);
        this._animate();
        window.addEventListener('resize', this._resizeHandler, false);
    }
}
