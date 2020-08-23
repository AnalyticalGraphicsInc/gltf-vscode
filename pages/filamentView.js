/*global Filament,Trackball,mainViewModel*/

export class FilamentView {
    constructor() {
        this._backgroundSubscription = undefined;
    }

    start(canvas) {
        this.canvas = canvas;
        const engine = this.engine = Filament.Engine.create(this.canvas);
        this.scene = engine.createScene();
        this.trackball = new Trackball(canvas,
            {
                startSpin: 0.000,
                radiansPerPixel: [0.004, 0.004]
            }
        );
        this.Fov = Filament.Camera$Fov;
        this.zoom = 1;
        this.center = [0, 0, 0];

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
        const applyBackground = showBackground => this.scene.setSkybox(showBackground ? skybox : null);
        applyBackground(mainViewModel.showBackground());
        this._backgroundSubscription = mainViewModel.showBackground.subscribe(applyBackground);

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

            const box = asset.getBoundingBox();
            this.center[0] = (box.min[0] + box.max[0]) * 0.5;
            this.center[1] = (box.min[1] + box.max[1]) * 0.5;
            this.center[2] = (box.min[2] + box.max[2]) * 0.5;
            this.zoom = box.max.reduce((p, c, i) => Math.max(p, Math.abs(c - this.center[i])), 0.001);
            this.zoom = box.min.reduce((p, c, i) => Math.max(p, Math.abs(c - this.center[i])), this.zoom) * 3.2;

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
        this.wheelBinding = this.wheel.bind(this);
        window.addEventListener('resize', this.resizeBinding);
        canvas.addEventListener('wheel', this.wheelBinding);
        window.requestAnimationFrame(this.renderBinding);
    }

    render() {
        if (!this.enabled) {
            return;
        }

        const zoom = this.zoom;
        const ballMatrix = this.trackball.getMatrix();
        const eye = [
            ballMatrix[2] * zoom + this.center[0],
            ballMatrix[6] * zoom + this.center[1],
            ballMatrix[10] * zoom + this.center[2]];
        const up = [ballMatrix[1], ballMatrix[5], ballMatrix[9]];
        this.camera.lookAt(eye, this.center, up);

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

    wheel(event) {
        if (!this.enabled) {
            return;
        }

        this.zoom *= Math.pow(1.002, event.deltaY);
        this.zoom = Math.min(Math.max(this.zoom, 0.001), 1e8);
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
        this.enabled = false;
        this.canvas.removeEventListener('wheel', this.wheelBinding);
        window.removeEventListener('resize', this.resizeBinding);
        mainViewModel.animations([]);
        mainViewModel.engineUI('blankTemplate');
    }

    startPreview() {
        mainViewModel.hasBackground(true);
        this.enabled = true;

        var canvas = document.getElementById('filamentCanvas');
        var extensionRootPath = document.getElementById('extensionRootPath').textContent;

        fetch(extensionRootPath + '/node_modules/filament/package.json')
            .then(r => r.json())
            .then(r => document.getElementById('filamentVersion').textContent = r.version);

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
