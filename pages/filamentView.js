/*global Filament,Trackball,mainViewModel*/

export class FilamentView {
    start(canvas) {
        this.canvas = canvas;
        const engine = this.engine = Filament.Engine.create(this.canvas);
        this.scene = engine.createScene();
        this.trackball = new Trackball(canvas, {startSpin: 0.000});
        this.Fov = Filament.Camera$Fov;

        /*
        const sunlight = Filament.EntityManager.get().create();
        Filament.LightManager.Builder(Filament.LightManager$Type.SUN)
            .color([0.98, 0.92, 0.89])
            .intensity(50000.0)
            .direction([0.6, -1.0, -0.8])
            .sunAngularRadius(1.9)
            .sunHaloSize(10.0)
            .sunHaloFalloff(80.0)
            .build(engine, sunlight);
        this.scene.addEntity(sunlight);
        */

        const indirectLight = this.ibl = engine.createIblFromKtx(this.ibl_url);
        this.scene.setIndirectLight(indirectLight);
        indirectLight.setIntensity(50000);

        const skybox = engine.createSkyFromKtx(this.sky_url);
        this.scene.setSkybox(skybox);

        var gltfContent = document.getElementById('gltf').textContent;
        var textEncoder = new TextEncoder();
        Filament.assets.model = textEncoder.encode(gltfContent);

        const loader = engine.createAssetLoader();
        const asset = this.asset = loader.createAssetFromJson('model');

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

            this.animator = asset.getAnimator();
            this.animationStartTime = Date.now();
        };
        var gltfRootPath = document.getElementById('gltfRootPath').textContent;
        asset.loadResources(onDone, null, gltfRootPath);

        this.swapChain = engine.createSwapChain();
        this.renderer = engine.createRenderer();
        this.camera = engine.createCamera(Filament.EntityManager.get().create());
        this.view = engine.createView();
        this.view.setCamera(this.camera);
        this.view.setScene(this.scene);
        this.renderer.setClearOptions({clearColor: [0.05, 0.1, 0.2, 1.0], clear: true});
        this.resize();
        this.renderBinding = this.render.bind(this);
        this.resizeBinding = this.resize.bind(this);
        window.addEventListener('resize', this.resizeBinding);
        window.requestAnimationFrame(this.renderBinding);
    }

    render() {
        if (!this.enabled) {
            return;
        }

        // Spin the model according to the trackball controller.
        const tcm = this.engine.getTransformManager();
        const inst = tcm.getInstance(this.asset.getRoot());
        tcm.setTransform(inst, this.trackball.getMatrix());
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
        this.renderer.render(this.swapChain, this.view);
        window.requestAnimationFrame(this.renderBinding);
    }

    resize() {
        if (!this.enabled) {
            return;
        }

        const dpr = window.devicePixelRatio;
        const width = this.canvas.width = window.innerWidth * dpr;
        const height = this.canvas.height = window.innerHeight * dpr;
        this.view.setViewport([0, 0, width, height]);
        const eye = [0, 0, 3];
        const center = [0, 0, 0];
        const up = [0, 1, 0];
        this.camera.lookAt(eye, center, up);
        const aspect = width / height;
        const fov = aspect < 1 ? this.Fov.HORIZONTAL : this.Fov.VERTICAL;
        this.camera.setProjectionFov(55, aspect, 0.01, 10000.0, fov);
    }

    /**
    * @function cleanup
    * Perform any cleanup that needs to happen to stop rendering the current model.
    * This is called right before the active engine for the preview window is switched.
    */
    cleanup() {
        this.enabled = false;
        window.removeEventListener('resize', this.resizeBinding);
        mainViewModel.animations([]);
        mainViewModel.engineUI('blankTemplate');
    }

    startPreview() {
        mainViewModel.hasBackground(false);
        this.enabled = true;

        var canvas = document.getElementById('filamentCanvas');
        var extensionRootPath = document.getElementById('extensionRootPath').textContent;

        // https://google.github.io/filament/
        fetch(extensionRootPath + '/node_modules/filament/package.json')
            .then(r => r.json())
            .then(r => console.log('Filament ' + r.version));

        this.ibl_url = document.getElementById('defaultFilamentReflection').textContent;
        this.sky_url = this.ibl_url.replace(/ibl.ktx$/, 'skybox.ktx');

        // Check if Filament has already been through "init".  Don't init twice, even
        // if the user switches to another engine tab and back again.
        if (typeof Filament !== 'object') {
            Filament.init([this.ibl_url, this.sky_url], () => {
                this.start(canvas);
            });
        } else {
            this.start(canvas);
        }
    }
}
