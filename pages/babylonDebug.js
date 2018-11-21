/// <reference path="../node_modules/babylonjs/babylon.d.ts" />
/// <reference path="../node_modules/babylonjs-inspector/babylon.inspector.module.d.ts" />

/*global BABYLON,acquireVsCodeApi*/
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();

    window.BabylonDebug = function () {
        let scene = null;
        let mesh = null;
        let utilityLayerRenderer = null;
        let utilityLayerScene = null;
        let widgetsContainer = null;
        let scaledWidgetsContainer = null;
        let onSelectionChangedObserver = null;
        let onBeforeRenderObserver = null;

        this.start = function (babylonScene) {
            scene = babylonScene;

            window.addEventListener('message', onMessage);

            BABYLON.Inspector.Show(scene, {
                embedMode: true,
                enablePopup: false,
                enableClose: false
            });

            onSelectionChangedObserver = BABYLON.Inspector.OnSelectionChangeObservable.add(function (entity) {
                const predicate = entity instanceof BABYLON.Node ? p => p.startsWith('/nodes/') : undefined;
                const jsonPointer = getJsonPointer(entity, predicate);
                if (jsonPointer) {
                    vscode.postMessage({
                        command: 'select',
                        jsonPointer: jsonPointer
                    });
                }
            });
        };

        this.stop = function () {
            clear();

            if (onSelectionChangedObserver) {
                BABYLON.Inspector.OnSelectionChangeObservable.remove(onSelectionChangedObserver);
                onSelectionChangedObserver = null;
            }

            BABYLON.Inspector.Hide();

            window.removeEventListener('message', onMessage);

            scene = null;
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

        function createDot() {
            const dot = new BABYLON.Mesh.CreateSphere('dot', 16, 0.02, utilityLayerScene);
            dot.material = new BABYLON.StandardMaterial('dot', utilityLayerScene);
            dot.material.disableLighting = true;
            dot.material.emissiveColor = BABYLON.Color3.White();
            dot.material.alpha = 0.5;
            return dot;
        }

        // TODO: support skinning and morphing?
        function selectVertices(vertices) {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            const tangents = mesh.getVerticesData(BABYLON.VertexBuffer.TangentKind);

            vertices.forEach(vertex => {
                const dot = createDot();
                dot.parent = scaledWidgetsContainer;
                BABYLON.Vector3.FromArrayToRef(positions, vertex * 3, dot.position);

                const axes = new BABYLON.Debug.AxesViewer(utilityLayerScene);

                const normal = new BABYLON.Vector3();
                if (normals) {
                    BABYLON.Vector3.FromArrayToRef(normals, vertex * 3, normal);
                    normal.normalize();
                }
                else {
                    axes.zAxisMesh.setEnabled(false);
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
                    axes.xAxisMesh.setEnabled(false);
                    axes.yAxisMesh.setEnabled(false);
                }

                axes.xAxisMesh.parent = scaledWidgetsContainer;
                axes.yAxisMesh.parent = scaledWidgetsContainer;
                axes.zAxisMesh.parent = scaledWidgetsContainer;
                axes.update(dot.position, tangent, bitangent, normal);
            });
        }

        // TODO: support skinning and morphing?
        function selectTrianglesLinesPoints(trianglesLinesPoints) {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);

            trianglesLinesPoints.forEach(triangleLinePoint => {
                const points = triangleLinePoint.map(vertex => BABYLON.Vector3.FromArray(positions, vertex * 3));
                points.forEach(point => {
                    const dot = createDot();
                    dot.parent = scaledWidgetsContainer;
                    dot.position.copyFrom(point);
                });

                if (triangleLinePoint.length !== 1) {
                    if (points.length === 3) {
                        points.push(points[0]);
                    }

                    const lines = BABYLON.Mesh.CreateLines('primitive', points, utilityLayerScene);
                    lines.parent = widgetsContainer;
                }
            });
        }

        function select(jsonPointer, vertices, trianglesLinesPoints) {
            clear();

            mesh = findMeshByJsonPointer(jsonPointer);
            if (!mesh) {
                return;
            }

            utilityLayerRenderer = new BABYLON.UtilityLayerRenderer(scene, false);
            utilityLayerScene = utilityLayerRenderer.utilityLayerScene;

            widgetsContainer = new BABYLON.TransformNode('widgetsContainer', utilityLayerScene);
            scaledWidgetsContainer = new BABYLON.TransformNode('scaledWidgetsContainer', utilityLayerScene);
            scaledWidgetsContainer.parent = widgetsContainer;

            onBeforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
                widgetsContainer.position = mesh.absolutePosition;
                widgetsContainer.rotationQuaternion = mesh.rotationQuaternion;

                const scale = mesh.getDistanceToCamera() * 0.3;
                scaledWidgetsContainer.getChildren().forEach(node => node.scaling.setAll(scale));
            });

            selectVertices(vertices);
            selectTrianglesLinesPoints(trianglesLinesPoints);
        }

        function clear() {
            if (onBeforeRenderObserver) {
                scene.onBeforeRenderObservable.remove(onBeforeRenderObserver);
                onBeforeRenderObserver = null;
            }

            scaledWidgetsContainer = null;
            widgetsContainer = null;

            utilityLayerScene = null;
            if (utilityLayerRenderer) {
                utilityLayerRenderer.dispose();
                utilityLayerRenderer = null;
            }

            mesh = null;
        }

        function onMessage(event) {
            const message = event.data;
            switch (message.command) {
                case 'select': {
                    select(message.jsonPointer, message.vertices, message.trianglesLinesPoints);
                    break;
                }
                case 'clear': {
                    clear();
                }
            }
        }
    };
})();
