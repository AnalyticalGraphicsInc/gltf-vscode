// shaders.wgsl - WebGPU shader code

// TEXTURED SHADER (for displaying images/textures with tone mapping)

struct Params {
  exposureEV: f32,
  exposureMul: f32,
  width: f32,
  height: f32,
  channelR: f32,
  channelG: f32,
  channelB: f32,
  channelA: f32,
  tonemapType: f32
}

@group(0) @binding(0) var<uniform> U : Params;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var tex0 : texture_2d<f32>;

struct VSOut { 
  @builtin(position) pos: vec4f, 
  @location(0) uv: vec2f 
}

@vertex fn vs_textured(@builtin(vertex_index) vid: u32) -> VSOut {
  var pos = array<vec2f,3>(
    vec2f(-1.0, -3.0),
    vec2f( 3.0,  1.0),
    vec2f(-1.0,  1.0)
  );
  let p = pos[vid];
  var o: VSOut;
  o.pos = vec4f(p, 0.0, 1.0);
  let uv_raw = 0.5 * (p + vec2f(1.0, 1.0));
  o.uv = vec2f(uv_raw.x, 1.0 - uv_raw.y);
  return o;
}


// tonemapping fns

const ACESInputMat = mat3x3f(
  vec3f(0.59719, 0.07600, 0.02840),
  vec3f(0.35458, 0.90834, 0.13383),
  vec3f(0.04823, 0.01566, 0.83777)
);
const ACESOutputMat = mat3x3f(
  vec3f(1.60475, -0.10208, -0.00327),
  vec3f(-0.53108, 1.10813, -0.07276),
  vec3f(-0.00327, -0.00605, 1.07602)
);

fn reinhard_tonemap(x: vec3f) -> vec3f {
  let denom = max(vec3f(1e-6), vec3f(1.0) + x);
  return x / denom;
}
fn hable_tonemap(x: vec3f) -> vec3f {
  let a=2.51; let b=0.03; let c=2.43; let d=0.59; let e=0.14;
  return clamp((x*(a*x + b)) / (x*(c*x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn exposure_tonemap(x: vec3f) -> vec3f {
  var remapped_col = x * U.exposureMul;
  return clamp(remapped_col, vec3f(0.0), vec3f(1.0));
}
fn aces_tonemap(x: vec3f) -> vec3f {
  // apply color transform matrix
  var remapped_col = ACESInputMat * x;

  // apply reference rendering transform (polynomial fit)
  let a = remapped_col * (remapped_col + 0.0245786) - 0.000090537;
  let b = remapped_col * 0.983729 + 0.4329510;
  remapped_col = a / b;

  // apply output device transform from ACES2065-1 to sRGB/Rec.709
  remapped_col = ACESOutputMat * remapped_col;

  return clamp(remapped_col, vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_textured(@location(0) uv: vec2f) -> @location(0) vec4f {
  let raw = textureSample(tex0, samp, uv);
  
  // Apply channel multipliers (colored)
  var c = vec3f(
    raw.r * U.channelR,
    raw.g * U.channelG,
    raw.b * U.channelB
  );
  
  // Alpha shows as grayscale, added to all channels
  c += vec3f(raw.a * U.channelA);
  
  // Apply tonemapping
  if (U.tonemapType == 1) {
    c = reinhard_tonemap(c);
  } else if (U.tonemapType == 2) {
    c = hable_tonemap(c);
  } else if (U.tonemapType == 3) {
    c = aces_tonemap(c);
  }

  // Apply exposure
  c = exposure_tonemap(c);
  
  let ldr = hable_tonemap(c);
  return vec4f(ldr, 1.0);
}


// SOLID COLOR SHADER (fallback when no texture is loaded)
struct VSOutSolid { 
  @builtin(position) pos: vec4f 
}

@vertex fn vs_solid(@builtin(vertex_index) vid: u32) -> VSOutSolid {
  var pos = array<vec2f,3>(
    vec2f(-1.0, -3.0),
    vec2f( 3.0,  1.0),
    vec2f(-1.0,  1.0)
  );
  var o: VSOutSolid;
  o.pos = vec4f(pos[vid], 0.0, 1.0);
  return o;
}

@fragment fn fs_solid() -> @location(0) vec4f {
  return vec4f(0.2, 0.6, 1.0, 1.0);
}
