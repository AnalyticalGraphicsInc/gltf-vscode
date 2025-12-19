# KTX2 HDR Viewer - Web Version

This is the standalone web version that runs on GitHub Pages.

## Features

✅ Load and preview PNG, JPG, WebP images
✅ Load and preview KTX2 compressed textures (BC1-BC7)
✅ HDR exposure control
✅ Mipmap level inspection
✅ Channel mixing (R, G, B, A sliders)
✅ Multiple texture filtering modes
✅ GPU memory and compression stats
✅ WebGPU accelerated rendering

## Usage

### Local Development

```bash
# Serve locally (requires a web server)
python -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000

### GitHub Pages Deployment

1. Push the `docs/` folder to GitHub
2. Enable GitHub Pages in repository settings
3. Set source to `/docs` folder
4. Visit your GitHub Pages URL

## Differences from VS Code Extension

**Removed:**
- glTF validation (requires Node.js backend)
- VS Code-specific messaging

**Same:**
- All texture loading and rendering
- All UI controls
- WebGPU rendering
- Channel mixing
- Mipmap inspection

## Browser Requirements

- Chrome/Edge 113+ (WebGPU support)
- Firefox Nightly with WebGPU enabled
- Safari Technology Preview 163+

Check WebGPU support: https://caniuse.com/webgpu

## File Structure

```
docs/
├── index.html              (main page)
├── main.js                 (app logic - web adapted)
├── read.js                 (KTX2 parser)
├── shaders.wgsl            (WebGPU shaders)
└── sidebar-template.html   (UI template)
```
