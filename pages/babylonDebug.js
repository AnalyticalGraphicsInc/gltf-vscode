/// <reference path="../node_modules/babylonjs/babylon.d.ts" />
/// <reference path="../node_modules/babylonjs-inspector/babylon.inspector.module.d.ts" />

/*global BABYLON*/
(function () {
    'use strict';

window.BabylonDebug = function (scene) {
    let beforeRenderObserver = null;
    let vertexWidgets = {};
    let triangleLinePointWidgets = {};
    let onSelectionChangedObserver = null;

    window.addEventListener('message', onMessage);

    // Set up the utility layer.
    const utilityLayerRenderer = new BABYLON.UtilityLayerRenderer(scene, false);
    const utilityLayerScene = utilityLayerRenderer.utilityLayerScene;
    utilityLayerScene.autoClearDepthAndStencil = false;

    // Create widget containers.
    const widgetsContainer = new BABYLON.TransformNode('widgetsContainer', utilityLayerScene);
    widgetsContainer.rotationQuaternion = BABYLON.Quaternion.Identity();
    const scaledWidgetsContainer = new BABYLON.TransformNode('scaledWidgetsContainer', utilityLayerScene);
    scaledWidgetsContainer.parent = widgetsContainer;

    // Create the dot source.
    const dotSource = new BABYLON.Mesh.CreateSphere('dot', 16, 0.02, utilityLayerScene);
    dotSource.material = new BABYLON.StandardMaterial('dot', utilityLayerScene);
    dotSource.material.disableLighting = true;
    dotSource.material.emissiveColor = BABYLON.Color3.White();
    dotSource.material.alpha = 0.5;
    dotSource.setEnabled(false);

    // Create the axes source.
    const axesSource = new BABYLON.Debug.AxesViewer(utilityLayerScene, 1, 0);
    axesSource.xAxis.setEnabled(false);
    axesSource.yAxis.setEnabled(false);
    axesSource.zAxis.setEnabled(false);

    /**
     * Dispose resources.
     */
    this.dispose = function () {
        this.hideInspector();

        // Clear the selection.
        select();

        utilityLayerRenderer.dispose();

        window.removeEventListener('message', onMessage);
    };

    /**
     * Show the inspector.
     */
    this.showInspector = function () {
        BABYLON.Inspector.Show(scene, {
            embedMode: true,
            enablePopup: false,
            enableClose: false
        });

        onSelectionChangedObserver = BABYLON.Inspector.OnSelectionChangeObservable.add(function (entity) {
            const predicate = entity instanceof BABYLON.Node ? p => p.startsWith('/nodes/') : undefined;
            const jsonPointer = getJsonPointer(entity, predicate);
            if (jsonPointer) {
                window.vscode.postMessage({
                    command: 'select',
                    jsonPointer: jsonPointer
                });
            }
        });
    };

    /**
     * Hide the inspector.
     */
    this.hideInspector = function () {
        if (onSelectionChangedObserver) {
            BABYLON.Inspector.OnSelectionChangeObservable.remove(onSelectionChangedObserver);
            onSelectionChangedObserver = null;
        }

        BABYLON.Inspector.Hide();
    };

    /**
     * Returns whether the inspector is visible.
     */
    this.isInspectorVisible = function () {
        return BABYLON.Inspector.IsVisible;
    };

    function getJsonPointer(node, predicate) {
        const jsonPointers = node.metadata && node.metadata.gltf && node.metadata.gltf.pointers;
        if (jsonPointers) {
            for (const jsonPointer of jsonPointers) {
                if (!predicate || predicate(jsonPointer)) {
                    return jsonPointer;
                }
            }
        }

        return null;
    }

    function findMeshByJsonPointer(jsonPointer) {
        for (const mesh of scene.meshes) {
            if (getJsonPointer(mesh, p => p === jsonPointer)) {
                return mesh;
            }
        }

        return null;
    }

    function createVertexWidget(positions, normals, tangents, vertex) {
        const dot = dotSource.createInstance('dot');
        dot.parent = scaledWidgetsContainer;
        BABYLON.Vector3.FromArrayToRef(positions, vertex * 3, dot.position);

        const axes = axesSource.createInstance();

        const normal = new BABYLON.Vector3();
        if (normals) {
            BABYLON.Vector3.FromArrayToRef(normals, vertex * 3, normal);
            normal.normalize();
        }
        else {
            axes.zAxis.setEnabled(false);
        }

        const tangent = new BABYLON.Vector3();
        const bitangent = new BABYLON.Vector3();
        if (tangents) {
            BABYLON.Vector3.FromArrayToRef(tangents, vertex * 4, tangent);
            tangent.normalize();
            BABYLON.Vector3.CrossToRef(normal, tangent, bitangent);
            bitangent.scaleInPlace(tangents[vertex * 4 + 3]);
        }
        else {
            axes.xAxis.setEnabled(false);
            axes.yAxis.setEnabled(false);
        }

        axes.xAxis.parent = scaledWidgetsContainer;
        axes.yAxis.parent = scaledWidgetsContainer;
        axes.zAxis.parent = scaledWidgetsContainer;
        axes.update(dot.position, tangent, bitangent, normal);

        return { dot: dot, axes: axes };
    }

    // TODO: support skinning and morphing?
    function selectVertices(mesh, vertices) {
        const newWidgets = {};

        if (mesh && vertices) {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            const tangents = mesh.getVerticesData(BABYLON.VertexBuffer.TangentKind);

            for (const vertex of vertices) {
                const widget = vertexWidgets[vertex];
                if (widget) {
                    delete vertexWidgets[vertex];
                    newWidgets[vertex] = widget;
                }
                else {
                    newWidgets[vertex] = createVertexWidget(positions, normals, tangents, vertex);
                }
            }
        }

        for (const widget of Object.values(vertexWidgets)) {
            widget.dot.dispose();
            widget.axes.dispose();
        }

        vertexWidgets = newWidgets;
    }

    function createTriangleLinePointWidget(positions, vertices) {
        const points = vertices.map(vertex => BABYLON.Vector3.FromArray(positions, vertex * 3));

        const dots = points.map(point => {
            const dot = dotSource.createInstance('dot');
            dot.parent = scaledWidgetsContainer;
            dot.position.copyFrom(point);
            return dot;
        });

        let lines = null;
        if (vertices.length !== 1) {
            if (points.length === 3) {
                points.push(points[0]);
            }

            lines = BABYLON.Mesh.CreateLines('primitive', points, utilityLayerScene);
            lines.parent = widgetsContainer;
        }

        return { dots: dots, lines: lines };
    }

    // TODO: support skinning and morphing?
    function selectTrianglesLinesPoints(mesh, trianglesLinesPoints) {
        const newWidgets = {};

        if (mesh && trianglesLinesPoints) {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);

            for (const triangleLinePoint of trianglesLinesPoints) {
                const widget = triangleLinePointWidgets[triangleLinePoint.index];
                if (widget) {
                    delete triangleLinePointWidgets[triangleLinePoint.index];
                    newWidgets[triangleLinePoint.index] = widget;
                }
                else {
                    newWidgets[triangleLinePoint.index] = createTriangleLinePointWidget(positions, triangleLinePoint.vertices);
                }
            }
        }

        for (const widget of Object.values(triangleLinePointWidgets)) {
            for (const dot of widget.dots) {
                dot.dispose();
            }

            if (widget.lines) {
                widget.lines.dispose();
            }
        }

        triangleLinePointWidgets = newWidgets;
    }

    function synchronizeWidgetsWithMesh(mesh) {
        mesh.getWorldMatrix().decompose(
            widgetsContainer.scaling,
            widgetsContainer.rotationQuaternion,
            widgetsContainer.position
        );
    }

    function updateScaledWidgetsContainer(mesh) {
        const scaleFactor = mesh.getDistanceToCamera() * 0.3;
        for (const node of scaledWidgetsContainer.getChildren()) {
            node.scaling.set(
                1 / widgetsContainer.scaling.x * scaleFactor,
                1 / widgetsContainer.scaling.y * scaleFactor,
                1 / widgetsContainer.scaling.z * scaleFactor
            );
        }
    }

    function select(jsonPointer, vertices, trianglesLinesPoints) {
        if (beforeRenderObserver) {
            utilityLayerScene.onBeforeRenderObservable.remove(beforeRenderObserver);
        }

        const mesh = findMeshByJsonPointer(jsonPointer);

        if (mesh) {
            beforeRenderObserver = utilityLayerScene.onBeforeRenderObservable.add(() => {
                synchronizeWidgetsWithMesh(mesh);
                updateScaledWidgetsContainer(mesh);
            });
        }

        selectVertices(mesh, vertices);
        selectTrianglesLinesPoints(mesh, trianglesLinesPoints);
    }

    function onMessage(event) {
        const message = event.data;
        switch (message.command) {
            case 'select': {
                select(message.jsonPointer, message.vertices, message.trianglesLinesPoints);
                break;
            }
        }
    }
};

})();
