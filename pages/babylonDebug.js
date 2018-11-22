/// <reference path="../node_modules/babylonjs/babylon.d.ts" />
/// <reference path="../node_modules/babylonjs-inspector/babylon.inspector.module.d.ts" />

/*global BABYLON*/
(function () {
    'use strict';

    window.BabylonDebug = function (scene) {
        let mesh = null;
        let onBeforeRenderObserver = null;
        let onSelectionChangedObserver = null;
        let widgetsContainer = null;
        let scaledWidgetsContainer = null;

        window.addEventListener('message', onMessage);

        // Set up the utility layer.
        const utilityLayerRenderer = new BABYLON.UtilityLayerRenderer(scene, false);
        const utilityLayerScene = utilityLayerRenderer.utilityLayerScene;
        utilityLayerScene.autoClearDepthAndStencil = false;

        // Create the dot widget mesh.
        const dotMesh = new BABYLON.Mesh.CreateSphere('dot', 16, 0.02, utilityLayerScene);
        dotMesh.material = new BABYLON.StandardMaterial('dot', utilityLayerScene);
        dotMesh.material.disableLighting = true;
        dotMesh.material.emissiveColor = BABYLON.Color3.White();
        dotMesh.material.alpha = 0.5;
        dotMesh.setEnabled(false);

        // Create the axes widget meshes.
        const axesViewer = new BABYLON.Debug.AxesViewer(utilityLayerScene);
        axesViewer.xAxis.setEnabled(false);
        axesViewer.yAxis.setEnabled(false);
        axesViewer.zAxis.setEnabled(false);

        /**
         * Dispose resources.
         */
        this.dispose = function () {
            clearSelection();
            this.hideInspector();

            // Clean up the utility layer.
            axesViewer.dispose();
            dotMesh.dispose(false, true);
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

        // TODO: support skinning and morphing?
        function selectVertices(vertices) {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            const tangents = mesh.getVerticesData(BABYLON.VertexBuffer.TangentKind);

            vertices.forEach(vertex => {
                const dot = dotMesh.createInstance('dot');
                dot.parent = scaledWidgetsContainer;
                BABYLON.Vector3.FromArrayToRef(positions, vertex * 3, dot.position);

                const axes = axesViewer.createInstance();

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
            });
        }

        // TODO: support skinning and morphing?
        function selectTrianglesLinesPoints(trianglesLinesPoints) {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);

            trianglesLinesPoints.forEach(triangleLinePoint => {
                const points = triangleLinePoint.map(vertex => BABYLON.Vector3.FromArray(positions, vertex * 3));
                points.forEach(point => {
                    const dot = dotMesh.createInstance('dot');
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

        // TODO: optimize with incremental update.
        function select(jsonPointer, vertices, trianglesLinesPoints) {
            clearSelection();

            mesh = findMeshByJsonPointer(jsonPointer);
            if (!mesh) {
                return;
            }

            widgetsContainer = new BABYLON.TransformNode('widgetsContainer', utilityLayerScene);
            scaledWidgetsContainer = new BABYLON.TransformNode('scaledWidgetsContainer', utilityLayerScene);
            scaledWidgetsContainer.parent = widgetsContainer;

            onBeforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
                widgetsContainer.position = mesh.absolutePosition;
                widgetsContainer.rotationQuaternion = mesh.rotationQuaternion;

                scaledWidgetsContainer.position = mesh.absolutePosition;
                scaledWidgetsContainer.rotationQuaterion = mesh.rotationQuaternion;

                const scale = mesh.getDistanceToCamera() * 0.3;
                scaledWidgetsContainer.getChildren().forEach(node => node.scaling.setAll(scale));
            });

            selectVertices(vertices);
            selectTrianglesLinesPoints(trianglesLinesPoints);
        }

        function clearSelection() {
            if (onBeforeRenderObserver) {
                scene.onBeforeRenderObservable.remove(onBeforeRenderObserver);
                onBeforeRenderObserver = null;
            }

            if (widgetsContainer) {
                scaledWidgetsContainer = null;
                widgetsContainer.dispose();
                widgetsContainer = null;
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
                case 'clearSelection': {
                    clearSelection();
                }
            }
        }
    };
})();
