/* ============================================================================
   post.js — the frame's last steps: blur, volumetric light, grade.

   The world is rendered at native resolution into a linear HDR target. This
   pass adds the blurred volumetric in-scatter (light shafts, lamp halos),
   screen-blends the blurred emissive buffer (bloom), tone-maps with ACES, and
   grades with the palette: shadows lifted toward the sky's zenith colour,
   highlights warmed toward the key light, a soft vignette. The palette still
   decides the mood of every frame; it just no longer snaps colours to a set.
   ========================================================================== */

import { Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from 'three';

const FULLSCREEN_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FS = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tFog;
  uniform float uBloom;
  uniform float uFog;
  uniform float uExposure;
  uniform vec3 uLift;
  uniform vec3 uGain;
  uniform sampler2D tMask;
  uniform vec2 uTexel;
  uniform vec3 uOutline;
  varying vec2 vUv;

  vec3 aces(vec3 x) { // Narkowicz's fit
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    c += texture2D(tFog, vUv).rgb * uFog;
    c = aces(c * uExposure);
    c = c * uGain + uLift * (1.0 - c); // lift the shadows toward the sky, tint the highlights
    vec3 bloom = texture2D(tBloom, vUv).rgb * uBloom;
    c = 1.0 - (1.0 - c) * (1.0 - clamp(bloom, 0.0, 1.0));
    float v = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.4);
    c *= mix(0.78, 1.0, v);
    // A 1 px outline round whatever you are looking at: outside the mask, next to it.
    if (texture2D(tMask, vUv).r < 0.5) {
      float edge = max(max(texture2D(tMask, vUv + vec2(uTexel.x, 0.0)).r, texture2D(tMask, vUv - vec2(uTexel.x, 0.0)).r),
                       max(texture2D(tMask, vUv + vec2(0.0, uTexel.y)).r, texture2D(tMask, vUv - vec2(0.0, uTexel.y)).r));
      c = mix(c, uOutline, step(0.5, edge));
    }
    gl_FragColor = vec4(toSrgb(c), 1.0);
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
        tFog: { value: null },
        uBloom: { value: 0.85 },
        uFog: { value: 1 },
        uExposure: { value: 1 },
        uLift: { value: new Color() },
        uGain: { value: new Color(1, 1, 1) },
        tMask: { value: null },
        uTexel: { value: new Vector2() },
        uOutline: { value: new Color() },
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

  /** The grade, from the palette: called at the palette's 4 Hz, not per frame. */
  setPalette(pal) {
    const u = this.post.uniforms;
    const z = pal.sky[0];
    u.uLift.value.setRGB((z[0] / 255) * 0.07, (z[1] / 255) * 0.07, (z[2] / 255) * 0.09);
    const g = pal.glow;
    u.uGain.value.setRGB(0.92 + (g[0] / 255) * 0.1, 0.92 + (g[1] / 255) * 0.1, 0.92 + (g[2] / 255) * 0.08);
    u.uOutline.value.setRGB(g[0] / 255, g[1] / 255, g[2] / 255, 'srgb'); // the key light's colour
    // Night is dark, but a pitch-black screen is not a place: expose up a little after dusk.
    u.uExposure.value = 1.05 + (1 - pal.lum) * 0.5;
  }

  draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /** Two-pass blur: src → scratch (horizontal) → dst (vertical). dst defaults to src. */
  blurInto(renderer, src, scratch, spread = 1, dst = src) {
    this.blur.uniforms.tInput.value = src.texture;
    this.blur.uniforms.uDir.value.set(spread / scratch.width, 0);
    this.draw(renderer, this.blur, scratch);
    this.blur.uniforms.tInput.value = scratch.texture;
    this.blur.uniforms.uDir.value.set(0, spread / scratch.height);
    this.draw(renderer, this.blur, dst);
  }

  composite(renderer, sceneRT, bloomTex, fogTex, bloom, fog) {
    const u = this.post.uniforms;
    u.tScene.value = sceneRT.texture;
    u.tBloom.value = bloomTex;
    u.tFog.value = fogTex;
    u.uBloom.value = bloom;
    u.uFog.value = fog;
    this.draw(renderer, this.post, null);
  }
}
