### Add glTF schemas

```
    "contributes": {
        "languages": [{
            "id": "json",
            "extensions": [
                ".gltf"
            ]
        }],
        "jsonValidation": [{
            "fileMatch": "*.gltf",
            "url": "./schemas/gltf.schema.json"
        }]
    },
```

### Write converter for enums in schemas

```
        "mode" : {
            "description" : "The type of primitives to render.",
            "default" : 4,
			"oneOf": [
				{"enum": [0], "description": "POINTS"},
				{"enum": [1], "description": "LINES"},
				{"enum": [2], "description": "LINE_LOOP"},
				{"enum": [3], "description": "LINE_STRIP"},
				{"enum": [4], "description": "TRIANGLES"},
				{"enum": [5], "description": "TRIANGLE_STRIP"},
				{"enum": [6], "description": "TRIANGLE_FAN"}
			]
		}
```

### Add gltf preview window

### Add shader preview/edit/export/import

### Add image preview/export/import
