/*global Filament,ko,mainViewModel*/
(function() {
    'use strict';
window.FilamentView = function() {

    // Tracks if this engine is currently the active engine.
    var enabled = false;

    function start(canvas) {
        this.canvas = canvas;
        const engine = this.engine = Filament.Engine.create(this.canvas);
        this.scene = engine.createScene();
        this.trackball = new Filament.Trackball(canvas, {startSpin: 0.000});
        const sunlight = Filament.EntityManager.get().create();
        Filament.LightManager.Builder(LightType.SUN)
            .color([0.98, 0.92, 0.89])
            .intensity(50000.0)
            .direction([0.6, -1.0, -0.8])
            .sunAngularRadius(1.9)
            .sunHaloSize(10.0)
            .sunHaloFalloff(80.0)
            .build(engine, sunlight);
        this.scene.addEntity(sunlight);

        const indirectLight = this.ibl = engine.createIblFromKtx(ibl_url);
        this.scene.setIndirectLight(indirectLight);
        indirectLight.setIntensity(50000);

        const skybox = engine.createSkyFromKtx(sky_url);
        this.scene.setSkybox(skybox);

        const loader = engine.createAssetLoader();
        if (mesh_url.split('.').pop() == 'glb') {
            this.asset= loader.createAssetFromBinary(mesh_url);
        } else {
            this.asset= loader.createAssetFromJson(mesh_url);
        }
        const asset = this.asset;
        const messages = document.getElementById('messages');

        // Crudely indicate progress by printing the URI of each resource as it is loaded.
        const onFetched = (uri) => messages.innerText += `Downloaded ${uri}\n`;
        const onDone = () => {
            // Destroy the asset loader.
            loader.delete();

            // Enable shadows on every renderable.
            const entities = asset.getEntities();
            const rm = engine.getRenderableManager();
            for (const entity of entities) {
                const instance = rm.getInstance(entity);
                rm.setCastShadows(instance, true);
                instance.delete();
            }

            /*
            const cameras = asset.getCameraEntities();
            // TODO: Since TransmissionTest.gltf looks better when rotated, it temporarily ignores the built-in camera.
            if (cameras.length > 0 && modelInfo.name != "TransmissionTest") {
                const index = Math.floor(Math.random() * cameras.length);
                const c = engine.getCameraComponent(cameras[index]);
                const aspect = window.innerWidth / window.innerHeight;
                c.setScaling([1 / aspect, 1, 1, 1]);
                this.view.setCamera(c);
            }
            */

            messages.remove();
            this.animator = asset.getAnimator();
            this.animationStartTime = Date.now();
        };
        asset.loadResources(onDone, onFetched, basePath);

        this.swapChain = engine.createSwapChain();
        this.renderer = engine.createRenderer();
        this.camera = engine.createCamera(Filament.EntityManager.get().create());
        this.view = engine.createView();
        this.view.setCamera(this.camera);
        this.view.setScene(this.scene);
        this.renderer.setClearOptions({clearColor: [1.0, 1.0, 1.0, 1.0], clear: true});
        this.resize();
        this.render = this.render.bind(this);
        this.resize = this.resize.bind(this);
        window.addEventListener('resize', this.resize);
        window.requestAnimationFrame(this.render);
    }

    function render() {
        const tcm = this.engine.getTransformManager();
        const inst = tcm.getInstance(this.asset.getRoot());
        let m = mat4.create();
        let s = vec3.create();
        let t = vec3.create();
        vec3.set(s, scale, scale, scale);
        mat4.scale(m, m, s);
        tcm.setTransform(inst, m);
        inst.delete();

        // Add renderable entities to the scene as they become ready.
        let entity;
        const popRenderable = () => {
            entity = this.asset.popRenderable();
            return entity.getId() !== 0;
        };
        while (popRenderable()) {
            this.scene.addEntity(entity);
        }

        if (this.animator) {
            const ms = Date.now() - this.animationStartTime;
            for (let i = 0; i < this.asset.getAnimator().getAnimationCount(); i++ ) {
                this.animator.applyAnimation(i, ms / 1000);
                this.animator.updateBoneMatrices();
            }
        }
        const eye = [0, 2, 3];
        const center = [0, 0, 0];
        const up = [0, 1, 0];
        const radians = Date.now() / 10000;
        vec3.rotateY(eye, eye, center, radians);
        vec3.transformMat4(eye, eye, this.trackball.getMatrix());
        this.camera.lookAt(eye, center, up);
        this.renderer.render(this.swapChain, this.view);
        window.requestAnimationFrame(this.render);
    }

    function resize() {
        const dpr = window.devicePixelRatio;
        const width = this.canvas.width = window.innerWidth * dpr;
        const height = this.canvas.height = window.innerHeight * dpr;
        this.view.setViewport([0, 0, width, height]);
        const eye = [0, 2, 3];
        const center = [0, 0, 0];
        const up = [0, 1, 0];
        this.camera.lookAt(eye, center, up);
        const aspect = width / height;
        const fov = aspect < 1 ? Fov.HORIZONTAL : Fov.VERTICAL;
        this.camera.setProjectionFov(75, aspect, 0.01, 10000.0, fov);
    }

    /**
    * @function cleanup
    * Perform any cleanup that needs to happen to stop rendering the current model.
    * This is called right before the active engine for the preview window is switched.
    */
    this.cleanup = function() {
        enabled = false;
        mainViewModel.animations([]);
        mainViewModel.engineUI('blankTemplate');
    };

    this.startPreview = function() {
        mainViewModel.hasBackground(false);

        var canvas = document.getElementById('filamentCanvas');
        start(canvas);
        /*
        canvas = document.getElementById('cesiumCanvas');
        canvas.addEventListener('contextmenu', function() {
            return false;
        }, false);
        canvas.addEventListener('selectstart', function() {
            return false;
        }, false);

        scene = new Cesium.Scene({
            canvas: canvas,
            creditContainer: document.getElementById('cesiumCreditContainer')
        });
        scene.rethrowRenderErrors = true;
        scene.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
        scene.backgroundColor = Cesium.Color.SLATEGRAY;
        scene.frameState.creditDisplay.addDefaultCredit(new Cesium.Credit(Cesium.VERSION, true));

        enabled = true;
        startRenderLoop();

        var gltfFileName = document.getElementById('gltfFileName').textContent;
        var gltfRootPath = document.getElementById('gltfRootPath').textContent;

        try {
            var gltfContent = JSON.parse(document.getElementById('gltf').textContent);
            loadModel(gltfContent, gltfRootPath, true);
        }
        catch (ex) {
            mainViewModel.showErrorMessage(ex);
        }
        */
    };
};
})();
