  // main.js — JPG/PNG/WebP renderer + KTX2 (BC1-BC7) loader using WebGPU

  // Minimal logger (uses #log in sidebar)
  const log = (msg) => {
    const el = document.getElementById('log');
    if (el) {
      el.style.display = 'block';
      el.textContent = String(msg);
    }
  };

  // App logger (appends to scrollable log with severity colors)
  const logApp = (msg, level = 'info') => {
    const el = document.getElementById('appLog');
    if (el) {
      el.style.display = 'block';
      const entry = document.createElement('div');
      entry.style.marginBottom = '4px';
      entry.style.paddingBottom = '4px';
      entry.style.borderBottom = '1px solid #222';
      
      // Color based on log level
      const colors = {
        error: '#ff6666',
        warn: '#ffaa44',
        success: '#66ff66',
        info: '#aaa'
      };
      entry.style.color = colors[level] || colors.info;
      
      const timestamp = new Date().toLocaleTimeString();
      entry.textContent = `[${timestamp}] ${String(msg)}`;
      el.appendChild(entry);
      // Auto-scroll to bottom
      el.scrollTop = el.scrollHeight;
    }
    
    // Also log to console
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.log(msg);
  };

  // Helpers to pad rows
  function padRows(src, width, height, bytesPerPixel = 4) {
    const rowStride = width * bytesPerPixel;
    const aligned = Math.ceil(rowStride / 256) * 256;
    if (aligned === rowStride) return { data: src, bytesPerRow: rowStride };

    const dst = new Uint8Array(aligned * height);
    for (let y = 0; y < height; y++) {
      const s0 = y * rowStride, d0 = y * aligned;
      dst.set(src.subarray(s0, s0 + rowStride), d0);
    }
    return { data: dst, bytesPerRow: aligned };
  }

  function padBlockRowsBC(src, width, height, bytesPerBlock, blockWidth = 4, blockHeight = 4) {
    const wBlocks = Math.max(1, Math.ceil(width  / blockWidth));
    const hBlocks = Math.max(1, Math.ceil(height / blockHeight));
    const rowBytes = wBlocks * bytesPerBlock;

    const aligned = Math.ceil(rowBytes / 256) * 256;
    if (aligned === rowBytes) {
      return { data: src, bytesPerRow: rowBytes, rowsPerImage: hBlocks };
    }

    const dst = new Uint8Array(aligned * hBlocks);
    for (let y = 0; y < hBlocks; y++) {
      const s0 = y * rowBytes, d0 = y * aligned;
      dst.set(src.subarray(s0, s0 + rowBytes), d0);
    }
    return { data: dst, bytesPerRow: aligned, rowsPerImage: hBlocks };
  }

  async function waitForKTXParser() {
    let tries = 0;
    while (typeof window.parseKTX2 !== 'function') {
      if (tries++ > 500) throw new Error('KTX2 parser not loaded');
      await new Promise(r => setTimeout(r, 10));
    }
  }

  // side bar and layout setup
  (function ensureLayout() {
    const canvas = document.getElementById('gfx');
    if (!canvas) {
      throw new Error('Canvas with id="gfx" not found in document.');
    }

    // If we already wrapped, do nothing
    if (document.getElementById('app-wrapper')) return;

    // Clean up any stray text nodes or elements in body (except canvas)
    const body = document.body;
    Array.from(body.childNodes).forEach(node => {
      if (node !== canvas && node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.remove();
      }
    });

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'app-wrapper';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'row';
    wrapper.style.width = '100vw';
    wrapper.style.height = '100vh';
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';
    wrapper.style.boxSizing = 'border-box';
    // Insert wrapper before canvas
    canvas.parentNode.insertBefore(wrapper, canvas);

    // Create sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    sidebar.style.width = '320px';
    sidebar.style.minWidth = '240px';
    sidebar.style.maxWidth = '420px';
    sidebar.style.background = '#0b0b0b';
    sidebar.style.color = '#ddd';
    sidebar.style.overflow = 'auto';
    sidebar.style.padding = '12px';
    sidebar.style.boxSizing = 'border-box';
    sidebar.style.font = '13px monospace';
    sidebar.style.borderRight = '1px solid rgba(255,255,255,0.04)';
    sidebar.style.zIndex = 1000;

    // Load sidebar content from injected template
    if (window.sidebarTemplate) {
      sidebar.innerHTML = window.sidebarTemplate;
    } else {
      console.error('Sidebar template not found - sidebarTemplate not injected');
      sidebar.innerHTML = '<h3>KTX2 HDR Preview</h3><p style="color:#f88;">Failed to load UI template</p>';
    }

    // Put sidebar and canvas into wrapper
    wrapper.appendChild(sidebar);

    // Move the canvas into the right side container (flex grow)
    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';
    canvasContainer.style.flex = '1 1 auto';
    canvasContainer.style.display = 'flex';
    canvasContainer.style.alignItems = 'stretch';
    canvasContainer.style.justifyContent = 'stretch';
    canvasContainer.style.overflow = 'hidden';
    canvasContainer.appendChild(canvas);
    wrapper.appendChild(canvasContainer);

    // Style canvas to fill container
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.objectFit = 'contain';

    // Ensure body has no stray content showing
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#000';
  })();

  // main WebGPU setup
  (async () => {
    try {
      if (!('gpu' in navigator)) { 
        logApp('WebGPU not available in this browser.', 'error'); 
        throw new Error('WebGPU not available');
      }

      const canvas  = document.getElementById('gfx');
      const context = canvas.getContext('webgpu');
      if (!context) { 
        logApp('Failed to get WebGPU context.', 'error'); 
        throw new Error('Failed to get WebGPU context');
      }

      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });

      const supportsBC   = adapter.features.has("texture-compression-bc");
      const supportsETC2 = adapter.features.has("texture-compression-etc2");
      const supportsASTC = adapter.features.has("texture-compression-astc");

      console.log("BC supported?", supportsBC);
      console.log("ETC2 supported?", supportsETC2);
      console.log("ASTC supported?", supportsASTC);

      const requiredFeatures = [];
      if (supportsBC)   requiredFeatures.push("texture-compression-bc");
      if (supportsETC2) requiredFeatures.push("texture-compression-etc2");
      if (supportsASTC) requiredFeatures.push("texture-compression-astc");

      const device = await adapter.requestDevice({ requiredFeatures });

      if (!adapter) { 
        logApp('No GPU adapter found.', 'error'); 
        throw new Error('No GPU adapter');
      }

      const bcSupported = adapter.features.has('texture-compression-bc');

      device.addEventListener?.('uncapturederror', (e) => {
        console.error('WebGPU uncaptured error:', e.error || e);
        logApp('WebGPU: ' + (e.error?.message || e.message || 'unknown error'), 'error');
      });

      logApp('WebGPU initialized successfully', 'success');

      if (!document.getElementById('gltf-controls')) {
        const fileInput = document.getElementById('file');
        const anchor = fileInput ? fileInput.parentNode : document.getElementById('sidebar');
        
        if (anchor) {
          const div = document.createElement('div');
          div.id = 'gltf-controls';
          div.style.cssText = 'margin-top:8px; margin-bottom:12px; display:none; padding:8px; background:#1a1a1a; border-radius:4px; border:1px solid #333;';
          div.innerHTML = `
            <div style="font-size:12px; margin-bottom:6px; color:#8cf;">glTF File Detected</div>
            <button id="validate-btn" style="width:100%; padding:6px 12px; background:#0e639c; color:white; border:none; border-radius:4px; cursor:pointer; font-family:monospace;">Validate glTF</button>
          `;
          if (fileInput) anchor.parentNode.insertBefore(div, anchor.nextSibling);
          else anchor.appendChild(div);
        }
      }

      const format = navigator.gpu.getPreferredCanvasFormat();

      // UI refs (now guaranteed to exist either via template or injection)
      const tonemapSelect = document.getElementById('tonemapSelect');
      const evInput = document.getElementById('ev');
      const evVal   = document.getElementById('evv');
      const fileInp = document.getElementById('file');
      const stat    = document.getElementById('stat');
      const meta    = document.getElementById('meta');
      const filterMode = document.getElementById('filterMode');

      // glTF specific UI
      const gltfControls = document.getElementById('gltf-controls');
      const validateBtn = document.getElementById('validate-btn');

      const mipControls = document.getElementById('mip-controls');
      const mipSlider   = document.getElementById('mipSlider');
      const mipLabel    = document.getElementById('mipLabel');
      const mipOnlyBox  = document.getElementById('mipOnly');

      const texInfo = document.getElementById('texInfo');
      const texInfoContent = document.getElementById('texInfoContent');

      const channelR = document.getElementById('channelR');
      const channelG = document.getElementById('channelG');
      const channelB = document.getElementById('channelB');
      const channelA = document.getElementById('channelA');
      const channelRVal = document.getElementById('channelRVal');
      const channelGVal = document.getElementById('channelGVal');
      const channelBVal = document.getElementById('channelBVal');
      const channelAVal = document.getElementById('channelAVal');
      const channelReset = document.getElementById('channelReset');

      // Get channel multipliers
      function getChannelMultipliers() {
        return {
          r: parseFloat(channelR.value),
          g: parseFloat(channelG.value),
          b: parseFloat(channelB.value),
          a: parseFloat(channelA.value)
        };
      }

      // Format bytes for display
      function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
      }

      // Calculate GPU memory for a texture
      function calculateGPUMemory(width, height, format, mipLevels) {
        // Bytes per pixel for different formats
        const formatSizes = {
          'rgba8unorm': 4,
          'bc1-rgba-unorm': 0.5,  // 4 bits per pixel
          'bc2-rgba-unorm': 1,    // 8 bits per pixel
          'bc3-rgba-unorm': 1,    // 8 bits per pixel
          'bc4-r-unorm': 0.5,     // 4 bits per pixel
          'bc5-rg-unorm': 1,      // 8 bits per pixel
          'bc6h-rgb-ufloat': 1,   // 8 bits per pixel
          'bc7-rgba-unorm': 1     // 8 bits per pixel
        };

        const bytesPerPixel = formatSizes[format] || 4;
        let totalBytes = 0;

        // Calculate for each mip level
        for (let i = 0; i < mipLevels; i++) {
          const mipWidth = Math.max(1, width >> i);
          const mipHeight = Math.max(1, height >> i);
          totalBytes += mipWidth * mipHeight * bytesPerPixel;
        }

        return totalBytes;
      }

      // Update texture info panel
      function updateTextureInfo(fileSize, width, height, format, mipLevels, fileName, metadata = null) {
        const gpuMemory = calculateGPUMemory(width, height, format, mipLevels);
        const aspectRatio = (width / height).toFixed(3);
        
        let html = `<div style="color:#8cf;">Dimensions:</div>`;
        html += `<div style="margin-left:8px; margin-bottom:4px;">${width} × ${height} (${aspectRatio}:1)</div>`;
        
        html += `<div style="color:#8cf;">Format:</div>`;
        html += `<div style="margin-left:8px; margin-bottom:4px;">${format}</div>`;
        
        html += `<div style="color:#8cf;">Mip Levels:</div>`;
        html += `<div style="margin-left:8px; margin-bottom:4px;">${mipLevels}</div>`;
        
        html += `<div style="color:#8cf;">File Size:</div>`;
        html += `<div style="margin-left:8px; margin-bottom:4px;">${formatBytes(fileSize)}</div>`;
        
        html += `<div style="color:#8cf;">GPU Memory (Estimated):</div>`;
        html += `<div style="margin-left:8px; margin-bottom:4px;">${formatBytes(gpuMemory)}</div>`;
        
        const compressionRatio = fileSize > 0 ? (gpuMemory / fileSize).toFixed(2) : 'N/A';
        html += `<div style="color:#8cf;">Compression:</div>`;
        html += `<div style="margin-left:8px; margin-bottom:4px;">${compressionRatio}x (GPU/File)</div>`;
        
        // Add metadata if provided (for KTX2 files)
        if (metadata) {
          if (metadata.supercompression) {
            html += `<div style="color:#8cf;">Supercompression:</div>`;
            html += `<div style="margin-left:8px; margin-bottom:4px;">${metadata.supercompression}</div>`;
          }
          if (metadata.kvd) {
            html += `<div style="color:#8cf;">KVD:</div>`;
            html += `<div style="margin-left:8px; margin-bottom:4px;">${metadata.kvd}</div>`;
          }
          if (metadata.dfd) {
            html += `<div style="color:#8cf;">DFD:</div>`;
            html += `<div style="margin-left:8px;">${metadata.dfd}</div>`;
          }
        }
        
        texInfoContent.innerHTML = html;
        texInfo.style.display = 'block';
      }

      // Swapchain configuration using canvas container size
      let lastW = 0, lastH = 0;
      function configureIfNeeded() {
        // Use canvas.clientWidth/Height to respect layout
        const dpr = 1;
        const w = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (w !== lastW || h !== lastH) {
          canvas.width  = w;
          canvas.height = h;
          context.configure({ device, format, alphaMode: 'opaque' });
          lastW = w; lastH = h;
        }
      }
      new ResizeObserver(configureIfNeeded).observe(document.getElementById('canvas-container'));
      configureIfNeeded();

      // Uniform buffer for parameters
      const uniformBuf = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      let tonemapType = 0; // 0 - none, 1 - Reinhard, 2 - Hable(ACES Approximation), 3 - ACES2065-1
      let exposureEV = 0;
      function updateUniforms() {
        const mul = Math.pow(2, exposureEV);
        const ch = getChannelMultipliers();
        const arr = new Float32Array([exposureEV, mul, lastW, lastH, ch.r, ch.g, ch.b, ch.a, tonemapType]);
        device.queue.writeBuffer(uniformBuf, 0, arr.buffer);
      }

      // tonemapType select
      tonemapSelect.oninput = () => { 
        tonemapType = parseInt(tonemapSelect.value); 
      }

      // exposure slider
      evInput.oninput = () => {
        exposureEV = parseFloat(evInput.value);
        evVal.textContent = evInput.value;
      };

      // glTF Validation Handler
      if (validateBtn) {
          validateBtn.onclick = () => {
            if (window.validateCurrentGltf) {
              window.validateCurrentGltf();
            } else {
              logApp('Validation logic not found.', 'error');
            }
          };
      }

      // Texture sampler (recreated when filter mode changes)
      function createSampler(mode) {
        if (mode === 'nearest') {
          return device.createSampler({ 
            magFilter: 'nearest', 
            minFilter: 'nearest',
            mipmapFilter: 'nearest'
          });
        } else if (mode === 'bilinear') {
          return device.createSampler({ 
            magFilter: 'linear', 
            minFilter: 'linear',
            mipmapFilter: 'nearest'  // Sharp mip transitions
          });
        } else if (mode === 'anisotropic') {
          return device.createSampler({ 
            magFilter: 'linear', 
            minFilter: 'linear',
            mipmapFilter: 'linear',
            maxAnisotropy: 16  // High quality anisotropic filtering
          });
        } else {  // trilinear (default)
          return device.createSampler({ 
            magFilter: 'linear', 
            minFilter: 'linear',
            mipmapFilter: 'linear'
          });
        }
      }
      let sampler = createSampler('trilinear');

      filterMode.onchange = () => {
        sampler = createSampler(filterMode.value);
        if (texPipeline) texBindGroup = makeTexBindGroup();
      };

      // Channel slider inputs
      channelR.oninput = () => { channelRVal.textContent = parseFloat(channelR.value).toFixed(2); };
      channelG.oninput = () => { channelGVal.textContent = parseFloat(channelG.value).toFixed(2); };
      channelB.oninput = () => { channelBVal.textContent = parseFloat(channelB.value).toFixed(2); };
      channelA.oninput = () => { channelAVal.textContent = parseFloat(channelA.value).toFixed(2); };

      // Reset button
      channelReset.onclick = () => {
        channelR.value = 1;
        channelG.value = 1;
        channelB.value = 1;
        channelA.value = 0;
        channelRVal.textContent = '1.00';
        channelGVal.textContent = '1.00';
        channelBVal.textContent = '1.00';
        channelAVal.textContent = '0.00';
      };

      // Initial placeholder texture
      function checkerRGBA8() {
        return new Uint8Array([
          255,255,255,255,   32,32,32,255,
          32,32,32,255,   255,255,255,255
        ]);
      }

      let srcTex = device.createTexture({
        size: { width: 2, height: 2, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING
            | GPUTextureUsage.COPY_DST
            | GPUTextureUsage.RENDER_ATTACHMENT
      });
      {
        const raw = checkerRGBA8();
        const { data, bytesPerRow } = padRows(raw, 2, 2);
        device.queue.writeTexture({ texture: srcTex }, data, { bytesPerRow }, { width: 2, height: 2 });
      }
      let srcView = srcTex.createView();

      // Mip state
      let currentMip = 0;
      let mipCount = 1;
      mipSlider.oninput = () => {
        currentMip = Math.floor(parseFloat(mipSlider.value));
        mipLabel.textContent = currentMip;
        applySelectedMip();
      };
      mipOnlyBox.onchange = () => {
        applySelectedMip();
      };

      // loaders
      async function createMipImages(imageBitmap) {
        const w = imageBitmap.width, h = imageBitmap.height;
        const mips = [];
        const can = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(1,1) : document.createElement('canvas');
        const ctx = can.getContext('2d');
        let pw = w, ph = h;
        while (true) {
          can.width = pw; can.height = ph;
          ctx.clearRect(0,0,pw,ph);
          ctx.drawImage(imageBitmap, 0, 0, pw, ph);
          const imgData = ctx.getImageData(0, 0, pw, ph);
          mips.push({ width: pw, height: ph, data: new Uint8Array(imgData.data.buffer) });
          if (pw === 1 && ph === 1) break;
          pw = Math.max(1, Math.floor(pw / 2));
          ph = Math.max(1, Math.floor(ph / 2));
        }
        return mips;
      }

      async function loadImageToTexture(file) {
        logApp(`Loading ${file.name}...`, 'info');
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });

        const levels = Math.floor(Math.log2(Math.max(1, Math.max(bmp.width, bmp.height)))) + 1;
        srcTex?.destroy?.();
        srcTex = device.createTexture({
          size: { width: bmp.width, height: bmp.height, depthOrArrayLayers: 1 },
          format: 'rgba8unorm',
          mipLevelCount: levels,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        srcView = srcTex.createView();
        texBindGroup = makeTexBindGroup();

        const mipImages = await createMipImages(bmp);
        for (let i = 0; i < mipImages.length; i++) {
          const m = mipImages[i];
          const { data, bytesPerRow } = padRows(m.data, m.width, m.height, 4);
          device.queue.writeTexture(
            { texture: srcTex, mipLevel: i },
            data,
            { bytesPerRow },
            { width: m.width, height: m.height, depthOrArrayLayers: 1 }
          );
        }

        srcView = srcTex.createView();
        mipCount = levels;
        currentMip = 0;
        mipSlider.min = 0;
        mipSlider.max = Math.max(0, mipCount - 1);
        mipSlider.value = 0;
        mipLabel.textContent = '0';
        mipControls.style.display = mipCount > 1 ? 'block' : 'none';

        bmp.close?.();
        stat.textContent = `Loaded ${file.name} (${srcTex.size?.width || '??'}×${srcTex.size?.height || '??'})`;
        meta.textContent = '';
        if (texPipeline) texBindGroup = makeTexBindGroup();
        
        // Update texture info panel
        updateTextureInfo(file.size, bmp.width, bmp.height, 'rgba8unorm', levels, file.name);
        
        logApp(`Successfully loaded ${file.name} (${bmp.width}×${bmp.height}, ${levels} mips)`, 'success');
      }

      function float32ToFloat16(val) {
        const floatView = new Float32Array(1);
        const intView = new Uint32Array(floatView.buffer);

        floatView[0] = val;
        const x = intView[0];

        const sign = (x >> 31) & 0x1;
        let exp = ((x >> 23) & 0xFF) - 112;
        let mant = (x >> 13) & 0x3FF;

        if (exp <= 0) {
            if (exp < -10) return sign << 15;
            mant = (mant | 0x400) >> (1 - exp);
            exp = 0;
        } else if (exp >= 31) {
            exp = 31;
            mant = 0;
        }

        return (sign << 15) | (exp << 10) | mant;
      }

      function convertRGBA32FtoRGBA16F(src, width, height) {
        const pixelCount = width * height;
        const dst = new Uint16Array(pixelCount * 4); // 4 channels

        const f32 = new Float32Array(src.buffer, src.byteOffset, pixelCount * 4);

        for (let i = 0; i < pixelCount * 4; i++) {
            dst[i] = float32ToFloat16(f32[i]);
        }
        return new Uint8Array(dst.buffer);
      }

            async function loadKTX2_ToTexture(file) {
        // Require BC on this device (same as before)
        if (!bcSupported) {
          logApp('BC compressed textures not supported on this device.', 'error');
          throw new Error('BC compressed textures not supported on this device.');
        }

        logApp(`Loading KTX2 ${file.name}...`, 'info');
        await waitForKTXParser();

        const buf = await file.arrayBuffer();
        // Pass device so parseKTX2 can do transcoding / feature-based decisions
        const { header, levels, dfd, kvd } = await window.parseKTX2(buf, device);

        const is2D = header.pixelDepth === 0 && header.faceCount === 1;
        if (!is2D) {
          logApp('Only 2D, 1-face KTX2 supported in this demo.', 'error');
          throw new Error('Only 2D, 1-face KTX2 supported in this demo.');
        }

        let wgpuFormat = null;
        let blockWidth = 1, blockHeight = 1, bytesPerBlock = 0;
        let isPixel = false;   // uncompressed flag
        let isBlock = false;   // block-compressed flag
        let formatInfo = null; // vkFormat mapping for uncompressed/BC paths

        // ==================================================================================
        // 1. SUPERCOMPRESSED BASIS/UASTC PATH (ETC1S / UASTC transcoded by parseKTX2)
        // ==================================================================================
        const isTranscoded = levels[0]?.isDecompressed;

        if (isTranscoded) {
          const tf = levels[0].transcodedFormat;
          logApp(`Using pre-transcoded Basis data (format ID: ${tf})`, 'info');

          switch (tf) {
            case 6:  // BC7
              wgpuFormat   = 'bc7-rgba-unorm';
              blockWidth   = 4;
              blockHeight  = 4;
              bytesPerBlock = 16;
              isBlock = true;
              break;

            case 1:  // BC3
              wgpuFormat   = 'bc3-rgba-unorm';
              blockWidth   = 4;
              blockHeight  = 4;
              bytesPerBlock = 16;
              isBlock = true;
              break;

            case 0:  // BC1
              wgpuFormat   = 'bc1-rgba-unorm';
              blockWidth   = 4;
              blockHeight  = 4;
              bytesPerBlock = 8;
              isBlock = true;
              break;

            case 13: // RGBA32 → treat as RGBA8 uncompressed
            default:
              wgpuFormat = 'rgba8unorm';
              isPixel    = true;
              formatInfo = {
                format: 'rgba8unorm',
                bytesPerPixel: 4,
                sourceChannels: 4,
                sourceBytesPerPixel: 4
              };
              break;
          }
        }

        // ==================================================================================
        // 2. NATIVE ETC2 PATH (if no transcoding and vkFormat is ETC2 range)
        // ==================================================================================
        else if ((header.vkFormat >= 147 && header.vkFormat <= 153) &&
                 adapter.features.has('texture-compression-etc2')) {

          logApp('Using native ETC2', 'info');

          const isRGBA = (header.vkFormat === 152 || header.vkFormat === 153);

          wgpuFormat   = isRGBA ? 'etc2-rgba8unorm' : 'etc2-rgb8unorm';
          blockWidth   = 4;
          blockHeight  = 4;
          bytesPerBlock = isRGBA ? 16 : 8;
          isBlock = true;
        }

        // ==================================================================================
        // 3. GENERAL PATH: USE vkFormatToWebGPU FOR BC + UNCOMPRESSED FORMATS
        // ==================================================================================
        else {
          formatInfo = window.vkFormatToWebGPU(header.vkFormat);
          if (!formatInfo) {
            throw new Error(`Unsupported vkFormat ${header.vkFormat}`);
          }

          wgpuFormat   = formatInfo.format;
          blockWidth   = formatInfo.blockWidth  || 1;
          blockHeight  = formatInfo.blockHeight || 1;
          bytesPerBlock = formatInfo.bytesPerBlock || 0;

          isPixel = !!formatInfo.bytesPerPixel;
          isBlock = !!formatInfo.blockWidth;
        }

        // Extra safety: feature guards for ETC2 / ASTC when using vkFormatToWebGPU mapping
        if (
          wgpuFormat.startsWith('etc2') &&
          !adapter.features.has('texture-compression-etc2')
        ) {
          throw new Error('ETC2 textures are not supported on this GPU/browser.');
        }

        if (
          wgpuFormat.startsWith('astc') &&
          !adapter.features.has('texture-compression-astc')
        ) {
          throw new Error('ASTC textures are not supported on this GPU/browser.');
        }

        // ==================================================================================
        // 4. CREATE TEXTURE
        // ==================================================================================
        srcTex?.destroy?.();
        srcTex = device.createTexture({
          size: {
            width: header.pixelWidth,
            height: header.pixelHeight,
            depthOrArrayLayers: 1
          },
          format: wgpuFormat,
          mipLevelCount: levels.length,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });

        srcView = srcTex.createView();
        if (texPipeline) {
          texBindGroup = makeTexBindGroup();
        }

        // ==================================================================================
        // 5. MIP UPLOAD LOOP (handles both uncompressed + block-compressed)
        // ==================================================================================
        for (let i = 0; i < levels.length; i++) {
          const lvl = levels[i];

          let raw = lvl.isDecompressed
            ? lvl.decompressedData
            : window.getLevelData(buf, lvl);

          // ---------------- UNCOMPRESSED PIXEL PATH ----------------
          if (isPixel) {
            // If RGB8 → expand to RGBA8
            if (formatInfo && formatInfo.sourceChannels === 3) {
              const pixelCount = lvl.width * lvl.height;
              const rgba = new Uint8Array(pixelCount * 4);
              for (let p = 0; p < pixelCount; p++) {
                rgba[p * 4 + 0] = raw[p * 3 + 0];
                rgba[p * 4 + 1] = raw[p * 3 + 1];
                rgba[p * 4 + 2] = raw[p * 3 + 2];
                rgba[p * 4 + 3] = 255;
              }
              raw = rgba;
            }

            // If RGBA32F → downconvert to RGBA16F
            if (
              formatInfo &&
              formatInfo.sourceBytesPerPixel === 16 &&
              formatInfo.bytesPerPixel === 8
            ) {
              raw = convertRGBA32FtoRGBA16F(raw, lvl.width, lvl.height);
            }

            const { data, bytesPerRow } = padRows(
              raw,
              lvl.width,
              lvl.height,
              formatInfo ? formatInfo.bytesPerPixel : 4
            );

            device.queue.writeTexture(
              { texture: srcTex, mipLevel: i },
              data,
              { bytesPerRow },
              {
                width: lvl.width,
                height: lvl.height,
                depthOrArrayLayers: 1
              }
            );

            continue; // skip block path for this mip
          }

          // ---------------- BLOCK-COMPRESSED PATH ----------------
          if (isBlock) {
            const { data, bytesPerRow, rowsPerImage } = padBlockRowsBC(
              raw,
              lvl.width,
              lvl.height,
              bytesPerBlock,
              blockWidth,
              blockHeight
            );

            const uploadWidth  = Math.ceil(lvl.width  / blockWidth)  * blockWidth;
            const uploadHeight = Math.ceil(lvl.height / blockHeight) * blockHeight;

            device.queue.writeTexture(
              { texture: srcTex, mipLevel: i },
              data,
              { bytesPerRow, rowsPerImage },
              {
                width: uploadWidth,
                height: uploadHeight,
                depthOrArrayLayers: 1
              }
            );
          }
        }

        // ==================================================================================
        // 6. MIP UI + METADATA PANEL (same as UI version)
        // ==================================================================================
        mipCount = levels.length || 1;
        currentMip = 0;
        mipSlider.min = 0;
        mipSlider.max = Math.max(0, mipCount - 1);
        mipSlider.value = 0;
        mipLabel.textContent = '0';
        mipControls.style.display = mipCount > 1 ? 'block' : 'none';

        const formatName = window.getFormatName
          ? window.getFormatName(header.vkFormat)
          : wgpuFormat;

        const compressionName = window.getSupercompressionName
          ? window.getSupercompressionName(header.supercompressionScheme)
          : (header.supercompressionScheme === 0
              ? 'None'
              : `Scheme ${header.supercompressionScheme}`);

        const metadata = {
          supercompression: compressionName
        };

        if (kvd && Object.keys(kvd).length > 0) {
          let kvdStr = Object.keys(kvd).join(', ');
          if (kvd.KTXorientation) {
            kvdStr += ` (orientation: ${kvd.KTXorientation})`;
          }
          metadata.kvd = kvdStr;
        }

        if (dfd) {
          metadata.dfd = `colorModel=${dfd.colorModel}, transfer=${dfd.transferFunction}`;
        }

        stat.textContent = `Loaded ${file.name} (${header.pixelWidth}×${header.pixelHeight}, ${mipCount} mip${mipCount > 1 ? 's' : ''})`;
        meta.textContent = '';

        updateTextureInfo(
          file.size,
          header.pixelWidth,
          header.pixelHeight,
          formatName,
          mipCount,
          file.name,
          metadata
        );

        logApp(
          `Successfully loaded KTX2 ${file.name} (${header.pixelWidth}×${header.pixelHeight}, ${formatName}, ${mipCount} mips)`,
          'success'
        );
      }


      fileInp.addEventListener('change', async () => {
        const f = fileInp.files?.[0];
        if (!f) return;
        
        const fileName = f.name.toLowerCase();

        try {
          if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
            // --- glTF Handling ---
            window.currentGltfFile = f;
            if (gltfControls) gltfControls.style.display = 'block';
            
            stat.textContent = `Selected: ${f.name}`;
            meta.textContent = 'glTF detected. Click Validate button to analyze.';
            texInfo.style.display = 'none'; // Hide texture info panel
            
            logApp(`Selected glTF file: ${f.name}`, 'info');
          } else {
            // --- Texture Handling ---
            window.currentGltfFile = null;
            if (gltfControls) gltfControls.style.display = 'none';
            
            if (fileName.endsWith('.ktx2')) {
              await loadKTX2_ToTexture(f);
            } else {
              await loadImageToTexture(f);
            }
          }
        } catch (e) {
          console.error(e);
          logApp('Failed to load ' + f.name + ': ' + (e.message || e), 'error');
          stat.textContent = 'Error: ' + (e.message || e);
        }
      });

      // ---------- Shader load & pipeline ----------
      const shaderResponse = await fetch(window.shaderUri);
      const shaderCode = await shaderResponse.text();

      async function compileModule(code, label) {
        const mod = device.createShaderModule({ code, label });
        const info = await mod.getCompilationInfo();
        if (info.messages?.length) {
          console.group(`WGSL ${label} diagnostics`);
          for (const m of info.messages) {
            const logMsg = `${m.type} (${m.lineNum}:${m.linePos}): ${m.message}`;
            console[m.type === 'error' ? 'error' : (m.type === 'warning' ? 'warn' : 'log')](logMsg);
            if (m.type === 'error') {
              logApp(`Shader ${label}: ${logMsg}`, 'error');
            }
          }
          console.groupEnd();
        }
        return mod;
      }

      const shaderModule = await compileModule(shaderCode, 'shaders');
      logApp('Shaders compiled', 'success');

      let texPipeline = null;
      let solidPipeline = null;

      try {
        texPipeline = await device.createRenderPipelineAsync({
          layout: 'auto',
          vertex:   { module: shaderModule, entryPoint: 'vs_textured' },
          fragment: { module: shaderModule, entryPoint: 'fs_textured', targets: [{ format }] },
          primitive:{ topology: 'triangle-list' }
        });
        logApp('Textured pipeline created', 'success');
      } catch (e) {
        console.error('Textured pipeline creation failed:', e);
        logApp('Textured pipeline failed: ' + (e.message || e), 'error');
      }

      try {
        solidPipeline = await device.createRenderPipelineAsync({
          layout: 'auto',
          vertex:   { module: shaderModule, entryPoint: 'vs_solid' },
          fragment: { module: shaderModule, entryPoint: 'fs_solid', targets: [{ format }] },
          primitive:{ topology: 'triangle-list' }
        });
        logApp('Solid pipeline created', 'success');
      } catch (e) {
        console.error('Solid pipeline creation failed:', e);
        logApp('Solid pipeline failed: ' + (e.message || e), 'error');
        throw new Error('Pipeline creation failed');
      }

      function makeTexBindGroup() {
        const bgl0 = texPipeline.getBindGroupLayout(0);
        return device.createBindGroup({
          layout: bgl0,
          entries: [
            { binding: 0, resource: { buffer: uniformBuf } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: srcView }
          ]
        });
      }
      let texBindGroup = texPipeline ? makeTexBindGroup() : null;

      function applySelectedMip() {
        if (srcTex && mipCount > 0 && mipOnlyBox.checked) {
          srcView = srcTex.createView({ baseMipLevel: currentMip, mipLevelCount: 1 });
        } else {
          srcView = srcTex.createView();
        }
        if (texPipeline) texBindGroup = makeTexBindGroup();
      }

      // frame loop
      function frame() {
        configureIfNeeded();
        updateUniforms();

        const swap = context.getCurrentTexture();
        const rtv = swap.createView();

        const encoder = device.createCommandEncoder();

        // Clear pass
        {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: rtv,
              clearValue: { r: 0.07, g: 0.07, b: 0.08, a: 1 },
              loadOp: 'clear',
              storeOp: 'store'
            }]
          });
          pass.end();
        }

        // Draw pass
        {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: rtv, loadOp: 'load', storeOp: 'store' }]
          });

          if (texPipeline && texBindGroup) {
            pass.setPipeline(texPipeline);
            pass.setBindGroup(0, texBindGroup);
            pass.draw(3);
          } else {
            pass.setPipeline(solidPipeline);
            pass.draw(3);
          }
          pass.end();
        }

        device.queue.submit([encoder.finish()]);
        requestAnimationFrame(frame);
      }
      frame();

      // Adapter info log
      try {
        const info = await adapter.requestAdapterInfo?.();
        if (info) logApp(`GPU: ${info.vendor} ${info.architecture} ${info.description}`, 'info');
      } catch {
        // Silent fail
      }

      // Debug access
      window._ktx2_demo = { device, adapter, srcTex, srcView, applySelectedMip };

    } catch (e) {
      console.error(e);
      logApp(String(e.message || e), 'error');
    }
  })();