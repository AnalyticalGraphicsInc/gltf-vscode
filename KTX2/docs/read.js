// File for parsing KTX2 files
// | Identifier | Header | Level Index | DFD | KVD | SGD | Mip Level Array |

let basisModulePromise = null;
let BasisModule = null;

// Supercompression scheme constants
const SUPERCOMPRESSION_NONE = 0;
const SUPERCOMPRESSION_BASIS_LZ = 1;
const SUPERCOMPRESSION_ZSTD = 2;
const SUPERCOMPRESSION_ZLIB = 3;

// Load fzstd library for Zstandard decompression
let fzstdLoaded = false;
let fzstdDecompress = null;

async function loadFzstd() {
  if (fzstdLoaded) return;
  
  // Load fzstd from CDN
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/fzstd@0.1.1/umd/index.js';
  
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load fzstd library'));
    document.head.appendChild(script);
  });
  
  if (typeof fzstd !== 'undefined') {
    fzstdDecompress = fzstd.decompress;
    fzstdLoaded = true;
  } else {
    throw new Error('fzstd library not available after loading');
  }
}

function getNonce() {
  const script = document.currentScript || document.querySelector('script[nonce]');
  return script ? script.nonce : '';
}

const logApp = (...args) => {
  const el = document.getElementById('appLog');
  // Known log levels
  const knownLevels = ["info", "success", "error", "warn"];

  let msgParts = [];
  let level = "info"; // default

  // Case 1: second argument is a level → keep old behavior
  if (args.length >= 2 && typeof args[1] === "string" && knownLevels.includes(args[1])) {
    msgParts = [args[0]];
    level = args[1];
  }
  // Case 2: treat all args as message parts
  else {
    msgParts = args;
  }

  // Convert objects → pretty JSON
  const msg = msgParts
    .map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
    .join(" ");

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
    entry.textContent = `[${timestamp}] ${msg}`;

    el.appendChild(entry);
    // Auto-scroll to bottom
    el.scrollTop = el.scrollHeight;
  }
  
  // Also log to console
  if (level === 'error') console.error(msg);
  else if (level === 'warn') console.warn(msg);
  else console.log(msg);
};

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    
    const nonce = getNonce();
    if (nonce) {
      el.setAttribute('nonce', nonce);
    }

    el.onload = resolve;
    el.onerror = () => reject(new Error(`Script load error for ${url}`));
    document.head.appendChild(el);
  });
}

async function loadBasisModule() {
  if (basisModulePromise) return basisModulePromise;

  basisModulePromise = new Promise(async (resolve, reject) => {
    try {
      const scriptUrl = window.BASIS_JS || "media/basisu/basis_transcoder.js";
      
      // 1. Shim module.exports to capture the library
      const backupModule = window.module;
      const backupExports = window.exports;
      window.module = { exports: {} };
      window.exports = window.module.exports;

      await loadScript(scriptUrl);

      let LoadedFunc = window.module.exports;
      if (typeof LoadedFunc !== 'function') {
         if (LoadedFunc && typeof LoadedFunc.MSC_TRANSCODER === 'function') {
             LoadedFunc = LoadedFunc.MSC_TRANSCODER;
         } else {
             LoadedFunc = window.MSC_TRANSCODER || window.BasisModule || window.Module;
         }
      }

      window.module = backupModule;
      window.exports = backupExports;

      if (typeof LoadedFunc !== "function") {
        return reject(new Error("Could not find BasisModule export"));
      }
      
      BasisModule = LoadedFunc;

      // 2. Load WASM
      const wasmUrl = window.BASIS_WASM || "media/basisu/basis_transcoder.wasm";
      const wasmBinary = await fetch(wasmUrl).then(r => {
        if (!r.ok) throw new Error(`Failed to load WASM: ${r.status}`);
        return r.arrayBuffer();
      });

      // 3. Initialize Module
      BasisModule({
        wasmBinary
      }).then(mod => {
        BasisModule = mod;

        try {
          if (mod.initializeBasis) {
            mod.initializeBasis();
            console.log("✓ Basis Universal initialized");
          } else {
            console.warn("mod.initializeBasis() missing - this might cause transcoder failure.");
          }
        } catch (e) {
          console.error("Failed to initializeBasis:", e);
        }

        resolve(mod);
      }).catch(reject);

    } catch (err) {
      reject(err);
    }
  });

  return basisModulePromise;
}

function makeBasisFile(u8) {
  return new BasisModule.BasisFile(u8);
}

function getBasisTargetFormatForGPU(device) {
  const BASIS_FORMAT = {
    BC1_RGB: 0,
    BC3_RGBA: 1,
    BC4_R: 2,
    BC5_RG: 3,
    BC7_RGBA: 6,
    RGBA32: 13
  };

  // use RGBA32
  console.log(`[read.js] Requesting RGBA32 (ID: ${BASIS_FORMAT.RGBA32})`);
  return BASIS_FORMAT.RGBA32;

}

async function parseKTX2(arrayBuffer,device) {
  const dv = new DataView(arrayBuffer);

  // Identifier (12 bytes) - validates that this is truly ktx2 file
  const identifier = new Uint8Array(arrayBuffer, 0, 12);
  const KTX2_IDENTIFIER = new Uint8Array([0xAB,0x4B,0x54,0x58,0x20,0x32,0x30,0xBB,0x0D,0x0A,0x1A,0x0A]);
  for (let i = 0; i < 12; i++) {
    if (identifier[i] !== KTX2_IDENTIFIER[i]) throw new Error('Invalid KTX2 identifier');
  }

  if (arrayBuffer.byteLength < 12 + 68) {
    throw new Error('KTX2 too small to contain header.');
  }

  // Header (68 bytes) - Describes global properties of the texture (dimensions, format, data locations, etc.)
  let offset = 12; // After identifier which is 12 bytes
  const header = {
    vkFormat: dv.getUint32(offset, true), offset: (offset += 4), // Vulkan format enum (texture type)
    typeSize: dv.getUint32(offset, true), offset: (offset += 4), // Size of a single texel block in bytes
    pixelWidth: dv.getUint32(offset, true), offset: (offset += 4), // Width of the texture in pixels
    pixelHeight: dv.getUint32(offset, true), offset: (offset += 4), // Height of the texture in pixels
    pixelDepth: dv.getUint32(offset, true), offset: (offset += 4), // Depth of the texture in pixels (1 for 2D textures)
    layerCount: dv.getUint32(offset, true), offset: (offset += 4), /// Number of array layers
    faceCount: dv.getUint32(offset, true), offset: (offset += 4), // Number of faces (6 for cubemaps)
    levelCount: dv.getUint32(offset, true), offset: (offset += 4), // Number of mip levels
    supercompressionScheme: dv.getUint32(offset, true), offset: (offset += 4), // Supercompression scheme used (0 = none)
  };

  // Indexing of data blocks
  const index = {
    dfdByteOffset: dv.getUint32(offset, true), offset: (offset += 4), // Data Format Descriptor
    dfdByteLength: dv.getUint32(offset, true), offset: (offset += 4), // Length of DFD block
    kvdByteOffset: dv.getUint32(offset, true), offset: (offset += 4), // Key/Value Data
    kvdByteLength: dv.getUint32(offset, true), offset: (offset += 4), // Length of KVD block
    sgdByteOffset: Number(dv.getBigUint64(offset, true)), offset: (offset += 8), // Supercompression Global Data
    sgdByteLength: Number(dv.getBigUint64(offset, true)), offset: (offset += 8), // Length of SGD block
  };

  // Level Index - array of mip levels
  const levelCount = Math.max(1, header.levelCount || 1);
  const levels = [];
  for (let i = 0; i < levelCount; i++) {
    const byteOffset = Number(dv.getBigUint64(offset, true)); offset += 8;
    const byteLength = Number(dv.getBigUint64(offset, true)); offset += 8;
    const uncompressedByteLength = Number(dv.getBigUint64(offset, true)); offset += 8;
    levels.push({
      byteOffset, byteLength, uncompressedByteLength,
      width: Math.max(1, header.pixelWidth  >> i),
      height: Math.max(1, header.pixelHeight >> i),
    });
  }

  // Parse DFD if present
  let dfd = null;
  if (index.dfdByteLength > 0) {
    dfd = parseDFD(dv, index.dfdByteOffset, index.dfdByteLength);
  }

  // Parse KVD if present
  let kvd = null;
  if (index.kvdByteLength > 0) {
    kvd = parseKVD(dv, index.kvdByteOffset, index.kvdByteLength);
  }
  

  // Handle supercompression - decompress level data if needed
  if (header.supercompressionScheme === SUPERCOMPRESSION_ZSTD) {
    await loadFzstd();
    
    // Decompress each mip level
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const compressedData = new Uint8Array(arrayBuffer, level.byteOffset, level.byteLength);
      
      try {
        const decompressedData = fzstdDecompress(compressedData);
        
        // Store decompressed data - we need to keep it accessible
        level.decompressedData = decompressedData;
        level.isDecompressed = true;
        
        // Verify size matches expected
        if (decompressedData.length !== level.uncompressedByteLength) {
          console.warn(`Level ${i}: Decompressed size ${decompressedData.length} != expected ${level.uncompressedByteLength}`);
        }
      } catch (e) {
        throw new Error(`Failed to decompress level ${i}: ${e.message}`);
      }
  }

} else if (header.vkFormat === 0 && header.supercompressionScheme === SUPERCOMPRESSION_NONE) {
    // Raw UASTC or ETC1S without supercompression
    logApp("Detected raw Basis Universal texture (no supercompression)");
    
    // Load transcoder
    await loadBasisModule();
    
    let basisFile = null;
    const fileUint8 = new Uint8Array(arrayBuffer);
    
    if (BasisModule.KTX2File) {
      basisFile = new BasisModule.KTX2File(fileUint8);
    }
    
    if (!basisFile) {
      basisFile = new BasisModule.BasisFile(fileUint8);
    }
    
    if (!basisFile.startTranscoding()) {
      basisFile.close();
      basisFile.delete();
      throw new Error("Transcoder failed to initialize");
    }
    
    const isKTX2File = (BasisModule.KTX2File && basisFile instanceof BasisModule.KTX2File);
    const format = 13; // RGBA32
    const imageIndex = 0;
    
    let transcoderLevelCount = isKTX2File ? basisFile.getLevels() : basisFile.getNumLevels(imageIndex);
    const safeLevelCount = Math.min(levels.length, transcoderLevelCount);
    
    for (let i = 0; i < safeLevelCount; i++) {
      let dst = null;
      let status = false;
      
      if (isKTX2File) {
        const size = basisFile.getImageTranscodedSizeInBytes(i, 0, 0, format);
        if (size === 0) break;
        
        dst = new Uint8Array(size);
        status = basisFile.transcodeImage(dst, i, 0, 0, format, 0, 0);
      } else {
        const size = basisFile.getImageTranscodedSizeInBytes(imageIndex, i, format);
        if (size === 0) break;
        
        dst = new Uint8Array(size);
        status = basisFile.transcodeImage(dst, imageIndex, i, format, 0, 0);
      }
      
      if (status && dst && dst.length > 0) {
        levels[i].isDecompressed = true;
        levels[i].decompressedData = dst;
        levels[i].transcodedFormat = format;
        console.log(`Level ${i}: Raw Basis → RGBA32 ✓ (${dst.length} bytes)`);
      } else {
        break;
      }
    }
    
    basisFile.close();
    basisFile.delete();
    
} else if (header.supercompressionScheme === SUPERCOMPRESSION_BASIS_LZ) { // This means ETC1S or UASTC
    console.log('[read.js] Entering BASIS_LZ block');  
    logApp("Detected BASIS-LZ texture (ETC1S or UASTC)");

    // Detect UASTC via DFD color model (166 = UASTC)
    // BasisLZ covers ETC1S (model 160) and UASTC (model 166)
    const isUASTC = (dfd && dfd.colorModel === 166);

    // Choose a GPU-friendly target format
    // UASTC → BC7 is the most correct path
    const targetFormat = 13; // 6 = BC7 in Basis Transcoder IDs

    // 1. Load the transcoder
    await loadBasisModule();

    let basisFile = null;
    const fileUint8 = new Uint8Array(arrayBuffer);

    // 2. ATTEMPT 1: Check for explicit KTX2File support (common in newer builds)
    if (BasisModule.KTX2File) {
      try {
        basisFile = new BasisModule.KTX2File(fileUint8);
      } catch (e) {
        console.warn("KTX2File constructor failed", e);
      }
    }

    // 3. ATTEMPT 2: Fallback to BasisFile with the WHOLE BUFFER
    // (Some builds auto-detect KTX2 headers inside BasisFile)
    if (!basisFile) {
      basisFile = new BasisModule.BasisFile(fileUint8);
    }

    // 4. Initialize
    if (!basisFile.startTranscoding()) {
      basisFile.close();
      basisFile.delete();
      throw new Error("Transcoder failed to initialize. (Your basis_transcoder.wasm might lack KTX2 support)");
    }

    // Detect Class FIRST
    const isKTX2File = (BasisModule.KTX2File && basisFile instanceof BasisModule.KTX2File);

    let imageCount = 1;
    if (!isKTX2File) {
        // Only legacy BasisFile has getNumImages()
        if (typeof basisFile.getNumImages === 'function') {
            imageCount = basisFile.getNumImages();
        }
    }

    if (imageCount === 0) {
       basisFile.close();
       basisFile.delete();
       throw new Error("File has no images");
    }

    const format = getBasisTargetFormatForGPU(device);

    const imageIndex = 0;
    
    // Ask the transcoder how many levels IT sees
    let transcoderLevelCount = 1; 
    try {
        if (isKTX2File) {
            // FIX: KTX2File uses .getLevels() with no arguments
            transcoderLevelCount = basisFile.getLevels();
        } else {
            // FIX: BasisFile uses .getNumLevels(imageIndex)
            transcoderLevelCount = basisFile.getNumLevels(imageIndex);
        }
    } catch(e) {
        console.warn("Could not query numLevels from transcoder, defaulting to 1.", e);
    }

    // Loop only up to the minimum of what the Header says and what the Transcoder says
    const safeLevelCount = Math.min(levels.length, transcoderLevelCount);

    for (let i = 0; i < safeLevelCount; i++) {
    const levelIndex = i;
    let dst = null;
    let status = false;
    let actualFormat = format; // Track which format was actually used

    try {
        if (isKTX2File) {
            // UASTC path
            const layerIndex = 0;
            const faceIndex = 0;
            const RGBA32 = 13;
            actualFormat = RGBA32;

            const size = basisFile.getImageTranscodedSizeInBytes(
                levelIndex, layerIndex, faceIndex, RGBA32
            );

            if (size === 0) {
                console.warn(`Level ${levelIndex}: no size, stopping`);
                break;
            }

            dst = new Uint8Array(size);
            status = basisFile.transcodeImage(
                dst, levelIndex, layerIndex, faceIndex, RGBA32, 0, 0
            );

            console.log(`Level ${i}: UASTC → RGBA32 ${status ? '✓' : '✗'} (${dst.length} bytes)`);

        } else {
            // ETC1S path
            const size = basisFile.getImageTranscodedSizeInBytes(
                imageIndex, levelIndex, format
            );
            
            if (size === 0) {
                console.warn(`Level ${levelIndex}: no size, stopping`);
                break;
            }
            
            dst = new Uint8Array(size);
            status = basisFile.transcodeImage(
                dst, imageIndex, levelIndex, format, 0, 0
            );

            console.log(`Level ${i}: ETC1S → format ${format} ${status ? '✓' : '✗'} (${dst.length} bytes)`);
        }
    } catch (err) {
        console.error(`Level ${i} transcode error:`, err);
        break;
    }

    // Store result (only if successful)
    if (status && dst && dst.length > 0) {
        levels[i].isDecompressed = true;
        levels[i].decompressedData = dst;
        levels[i].transcodedFormat = actualFormat;
    } else {
        console.warn(`Level ${i} failed, stopping mip chain`);
        break;
    }
}

    basisFile.close();
    basisFile.delete(); 

    console.log('[read.js] Transcode summary:');
    for (let i = 0; i < levels.length; i++) {
        console.log(`  Level ${i}: isDecompressed=${levels[i].isDecompressed}, format=${levels[i].transcodedFormat}, size=${levels[i].decompressedData?.length || 0}`);
    }
    
  } else if (header.supercompressionScheme === SUPERCOMPRESSION_ZLIB) {
    throw new Error('Zlib supercompression not yet supported. Use Zstd or uncompressed KTX2.');
  } else if (header.supercompressionScheme !== SUPERCOMPRESSION_NONE) {
    throw new Error(`Unknown supercompression scheme: ${header.supercompressionScheme}`);
  }


  return { header, index, levels, dfd, kvd };
}

// DFD data block parser
function parseDFD(dv, baseOffset, length) {
  const view = new DataView(dv.buffer, baseOffset, length);
  let offset = 0;
  const totalSize = view.getUint32(offset, true); offset += 4;
  const vendorId = view.getUint16(offset, true); offset += 2;
  const descriptorType = view.getUint16(offset, true); offset += 2;
  const versionNumber = view.getUint16(offset, true); offset += 2;
  const descriptorBlockSize = view.getUint16(offset, true); offset += 2;

  const colorModel = view.getUint8(offset++); 
  const colorPrimaries = view.getUint8(offset++);
  const transferFunction = view.getUint8(offset++);
  const flags = view.getUint8(offset++);

  const texelBlockDimension = [
    view.getUint8(offset++), view.getUint8(offset++),
    view.getUint8(offset++), view.getUint8(offset++)
  ];

  const bytesPlane = [];
  for (let i = 0; i < 8; i++) bytesPlane.push(view.getUint8(offset++));

  return { totalSize, vendorId, descriptorType, versionNumber,
          colorModel, colorPrimaries, transferFunction, flags,
          texelBlockDimension, bytesPlane, descriptorBlockSize };
}

// KVD data block parser
function parseKVD(dv, baseOffset, length) {
  const kv = {};
  let offset = baseOffset;
  while (offset < baseOffset + length) {
    const kvByteLength = dv.getUint32(offset, true); offset += 4;
    if (kvByteLength === 0) break; // Safety check
    const bytes = new Uint8Array(dv.buffer, offset, kvByteLength);
    const str = new TextDecoder().decode(bytes);
    const nullPos = str.indexOf('\0');
    if (nullPos >= 0) {
      const key = str.slice(0, nullPos);
      const value = str.slice(nullPos + 1);
      kv[key] = value;
    }
    offset += kvByteLength;
    offset += (4 - (kvByteLength % 4)) % 4; // 4-byte align
  }
  return kv;
}

// Mip level accessor
function getLevelData(arrayBuffer, level) {
  if (level.isDecompressed && level.decompressedData) {
    return level.decompressedData;
  }
  return new Uint8Array(arrayBuffer, level.byteOffset, level.byteLength);
}

// Vulkan format enum to WebGPU format string + metadata
// Returns: { format: 'bc7-rgba-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 }
function vkFormatToWebGPU(vkFormat) {
  const formats = {
    // BC1 (DXT1) - 4x4 blocks, 8 bytes per block
    131: { format: 'bc1-rgba-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
    132: { format: 'bc1-rgba-unorm-srgb', blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
    
    // BC2 (DXT3) - 4x4 blocks, 16 bytes per block
    135: { format: 'bc2-rgba-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    136: { format: 'bc2-rgba-unorm-srgb', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    
    // BC3 (DXT5) - 4x4 blocks, 16 bytes per block
    137: { format: 'bc3-rgba-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    138: { format: 'bc3-rgba-unorm-srgb', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    
    // BC4 (RGTC1) - 4x4 blocks, 8 bytes per block
    139: { format: 'bc4-r-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
    140: { format: 'bc4-r-snorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
    
    // BC5 (RGTC2) - 4x4 blocks, 16 bytes per block
    141: { format: 'bc5-rg-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    142: { format: 'bc5-rg-snorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    
    // BC6H (HDR) - 4x4 blocks, 16 bytes per block
    143: { format: 'bc6h-rgb-ufloat', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    144: { format: 'bc6h-rgb-float', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    
    // BC7 - 4x4 blocks, 16 bytes per block
    145: { format: 'bc7-rgba-unorm', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    146: { format: 'bc7-rgba-unorm-srgb', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },

    // --- MOBILE FORMATS ---

    // ETC2 formats
    152: { format: "etc2-rgb8unorm",  blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
    153: { format: "etc2-rgb8a1unorm", blockWidth: 4, blockHeight: 4, bytesPerBlock: 8 },
    154: { format: "etc2-rgba8unorm", blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },

    157: { format: 'astc-4x4-unorm',      blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },
    158: { format: 'astc-4x4-unorm-srgb', blockWidth: 4, blockHeight: 4, bytesPerBlock: 16 },

    // --- UNCOMPRESSED FORMATS ---

    // RGB8 (UNORM & SRGB) — 3 bytes per pixel
    // these formats can't be used directly in WebGPU, need to be expanded to RGBA8
    23: { format: 'rgba8unorm', bytesPerPixel: 4, sourceChannels: 3 },
    24: { format: 'rgba8unorm-srgb', bytesPerPixel: 4, sourceChannels: 3 },
    29: { format: 'rgba8unorm', bytesPerPixel: 4, sourceChannels: 3 },

    // RGBA8
    37:  { format: 'rgba8unorm',       bytesPerPixel: 4 },
    43:  { format: 'rgba8unorm-srgb',  bytesPerPixel: 4 },

    // RGBA16F — 8 bytes per pixel
    97:  { format: 'rgba16float',      bytesPerPixel: 8 },

    // RGBA32F — 16 bytes per pixel
    // going to doconvert to RGBA16F for WebGPU usage for now
    109: { format: 'rgba16float', bytesPerPixel: 8, sourceBytesPerPixel: 16 },


    // R11G11B10 UFLOAT
    100: { format: 'rg11b10ufloat',    bytesPerPixel: 4 },
    122: { format: "rg11b10ufloat", bytesPerPixel: 4 },


    // RGB9E5
    99:  { format: 'rgb9e5ufloat',     bytesPerPixel: 4 },
    123: { format: 'rgb9e5ufloat', bytesPerPixel: 4 },

  };
  
  return formats[vkFormat] || null;
}

// Get human-readable format name
function getFormatName(vkFormat) {
  const names = {
    131: 'BC1 (DXT1) UNORM', 132: 'BC1 (DXT1) SRGB',
    135: 'BC2 (DXT3) UNORM', 136: 'BC2 (DXT3) SRGB',
    137: 'BC3 (DXT5) UNORM', 138: 'BC3 (DXT5) SRGB',
    139: 'BC4 (RGTC1) UNORM', 140: 'BC4 (RGTC1) SNORM',
    141: 'BC5 (RGTC2) UNORM', 142: 'BC5 (RGTC2) SNORM',
    143: 'BC6H UFLOAT', 144: 'BC6H FLOAT',
    145: 'BC7 UNORM', 146: 'BC7 SRGB',
    157: 'ASTC 4x4 UNORM',
    158: 'ASTC 4x4 SRGB',
    23:  'RGB8 UNORM',
    24:  'RGB8 SRGB',
    29:  'RGB8 SRGB',
    37:  'RGBA8 UNORM',
    43:  'RGBA8 SRGB',
    97:  'RGBA16 FLOAT',
    99:  'RGB9E5 UFLOAT', 
    100: 'R11G11B10 UFLOAT',
    109: 'RGBA32 FLOAT',
    
  };
  return names[vkFormat] || `VK Format ${vkFormat}`;
}

function getSupercompressionName(scheme) {
  const names = {
    0: 'None',
    1: 'BasisLZ',
    2: 'Zstandard',
    3: 'ZLIB'
  };
  return names[scheme] || `Scheme ${scheme}`;
}

// Expose functions
window.parseKTX2 = parseKTX2;
window.vkFormatToWebGPU = vkFormatToWebGPU;
window.getFormatName = getFormatName;
window.getSupercompressionName = getSupercompressionName;
window.parseDFD = parseDFD;
window.parseKVD = parseKVD;
window.getLevelData = getLevelData;

// Export constants
window.SUPERCOMPRESSION_NONE = SUPERCOMPRESSION_NONE;
window.SUPERCOMPRESSION_BASIS_LZ = SUPERCOMPRESSION_BASIS_LZ;
window.SUPERCOMPRESSION_ZSTD = SUPERCOMPRESSION_ZSTD;
window.SUPERCOMPRESSION_ZLIB = SUPERCOMPRESSION_ZLIB;
