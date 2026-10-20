/* ============================================================================
   post.js — the one post pass, the bloom blur, and the palette LUT.

   The frame is rendered small (240–360 rows), then this pass:
     1. converts it to sRGB,
     2. adds a Bayer 4×4 offset (the same matrix the classic sky dithers with),
     3. snaps it through a 16³ LUT to a palette DERIVED FROM THE CURRENT
        KEYFRAME — so the world at dusk is literally drawn in dusk's colours,
     4. screen-blends the blurred emissive buffer on top (bloom stays smooth,
        like the classic CSS blur: only the world is hard-edged).
   A 3-D LUT makes step 3 cost one texture fetch however many colours there are.
   ========================================================================== */

import {
  Data3DTexture, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBAFormat,
  Scene, ShaderMaterial, UnsignedByteType, Vector2,
} from 'three';

export const LUT_SIZE = 16;

/* Material base colours the quantiser must be able to reach, lit at several
   strengths by the palette itself. If you add a material whose colour is far
   from all of these, add its hex here or it will snap to a neighbour. */
const SWATCHES = [
  '#5f9a4a', '#86b85e', '#3f7a46', '#2f5e45', // grass, meadow light, leaf, pine
  '#9a7a52', '#cdbb8a', '#6b5a48', // dirt, sand, wet earth
  '#9a6a44', '#5e4030', '#c08a5a', '#a0764e', '#c9b8a6', // wood, dark wood, warm interior, floor, pale wood
  '#8d8d96', '#6a6a72', '#7a4a3a', // stone, dark stone, roof
  '#3a6a8a', '#e8eef5', // water, snow
  '#d07a6a', '#c8a0d8', '#f0d070', // flowers: rose, lilac, butter
];
const LEVELS = [0.3, 0.55, 0.8, 1.05, 1.3];

/**
 * The quantisation palette for this moment, as [r, g, b] 0–255 tuples.
 * Pure (takes the palette object), so it can be tested.
 */
export function quantColors(pal) {
  const out = [];
  for (const hex of SWATCHES) for (const k of LEVELS) out.push(pal.lit(hex, k));
  const [z, m, h] = pal.sky;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  out.push(z, m, h, mid(z, m), mid(m, h), pal.fog, pal.glow, pal.accent, pal.sun, pal.ink);
  out.push([10, 10, 18], [24, 22, 36], [255, 207, 122], [255, 154, 74], [255, 244, 220]); // ink, shadow, the warm lights
  return out.map((c) => c.map((v) => Math.max(0, Math.min(255, v))));
}

/** Fill a 16³ RGBA LUT: every cell holds its nearest palette colour (red-mean distance). */
export function buildLut(colors, data = new Uint8Array(LUT_SIZE ** 3 * 4)) {
  const n = LUT_SIZE;
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const R = (r / (n - 1)) * 255;
        const G = (g / (n - 1)) * 255;
        const B = (b / (n - 1)) * 255;
        let best = colors[0];
        let bestD = Infinity;
        for (const c of colors) {
          const rm = (R + c[0]) / 2;
          const dr = R - c[0];
          const dg = G - c[1];
          const db = B - c[2];
          const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        data[i++] = best[0];
        data[i++] = best[1];
        data[i++] = best[2];
        data[i++] = 255;
      }
    }
  }
  return data;
}

const FULLSCREEN_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FS = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler3D tLut;
  uniform float uBloom;
  uniform float uDither;
  uniform float uLutMix;
  varying vec2 vUv;

  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int k = i.x + i.y * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[k]) + 0.5) / 16.0;
  }

  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 c = toSrgb(texture2D(tScene, vUv).rgb);
    c += (bayer4(gl_FragCoord.xy) - 0.5) * uDither / ${LUT_SIZE - 1}.0;
    c = clamp(c, 0.0, 1.0);
    vec3 q = texture(tLut, c * ${(LUT_SIZE - 1) / LUT_SIZE} + ${0.5 / LUT_SIZE}).rgb;
    c = mix(c, q, uLutMix);
    vec3 bloom = toSrgb(texture2D(tBloom, vUv).rgb) * uBloom;
    gl_FragColor = vec4(1.0 - (1.0 - c) * (1.0 - bloom), 1.0);
  }
`;

const BLUR_FS = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tInput, vUv).rgb * 0.227;
    s += texture2D(tInput, vUv + uDir * 1.385).rgb * 0.316;
    s += texture2D(tInput, vUv - uDir * 1.385).rgb * 0.316;
    s += texture2D(tInput, vUv + uDir * 3.231).rgb * 0.070;
    s += texture2D(tInput, vUv - uDir * 3.231).rgb * 0.070;
    gl_FragColor = vec4(s, 1.0);
  }
`;

export class Post {
  constructor() {
    this.lutData = new Uint8Array(LUT_SIZE ** 3 * 4);
    this.lut = new Data3DTexture(this.lutData, LUT_SIZE, LUT_SIZE, LUT_SIZE);
    this.lut.format = RGBAFormat;
    this.lut.type = UnsignedByteType;
    this.lut.minFilter = this.lut.magFilter = NearestFilter;
    this.lut.unpackAlignment = 1;

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new Scene();
    this.scene.add(this.quad);

    this.post = new ShaderMaterial({
      vertexShader: FULLSCREEN_VS,
      fragmentShader: POST_FS,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tLut: { value: this.lut },
        uBloom: { value: 0.85 },
        uDither: { value: 1 },
        uLutMix: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.blur = new ShaderMaterial({
      vertexShader: FULLSCREEN_VS,
      fragmentShader: BLUR_FS,
      uniforms: { tInput: { value: null }, uDir: { value: new Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
  }

  setPalette(pal) {
    buildLut(quantColors(pal), this.lutData);
    this.lut.needsUpdate = true;
  }

  _draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /** Two-pass blur, ping-ponging between the bloom target and a scratch one. */
  blurBloom(renderer, bloomRT, scratchRT) {
    this.blur.uniforms.tInput.value = bloomRT.texture;
    this.blur.uniforms.uDir.value.set(1 / bloomRT.width, 0);
    this._draw(renderer, this.blur, scratchRT);
    this.blur.uniforms.tInput.value = scratchRT.texture;
    this.blur.uniforms.uDir.value.set(0, 1 / bloomRT.height);
    this._draw(renderer, this.blur, bloomRT);
  }

  composite(renderer, sceneRT, bloomTex, strength) {
    this.post.uniforms.tScene.value = sceneRT.texture;
    this.post.uniforms.tBloom.value = bloomTex;
    this.post.uniforms.uBloom.value = strength;
    this._draw(renderer, this.post, null);
  }
}
