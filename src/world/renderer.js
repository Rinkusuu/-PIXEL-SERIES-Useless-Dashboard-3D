/* ============================================================================
   renderer.js — the frame, from sky to screen.

   RESOLUTION. Native: the voxel is the pixel now, so the frame is drawn at the
   screen's own resolution (device pixel ratio capped at 1.5), scaled down by
   the quality tier when the machine needs it.

   PASSES, in order:
     background  sky dome, bodies, mountains — their own camera with a deep
                 depth range, so a mountain 900 m away and a cup 0.5 m away
                 never fight over depth precision
     world       everything walkable, near 0.05 / far 320, into an HDR target
                 that keeps its depth for the next pass
     volumetric  half-res light in the air (volumetric.js), blurred
     emissive    only the glowing things (layer 1), drawn against the world
                 pass's own depth buffer — so a tree hides a lamp behind it
                 for free, without drawing the world a second time — then
                 blurred down to half resolution
     post        fog + bloom + ACES + palette grade, to the canvas (post.js)
   ========================================================================== */

import {
  Color, DataTexture, DepthTexture, HalfFloatType, LinearFilter, MeshBasicMaterial, NearestFilter, PCFShadowMap,
  RGBAFormat, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { Post } from './post.js';
import { volumetricMaterial } from './volumetric.js';

export const LAYER_GLOW = 1;

export class Pipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // photo mode reads the canvas back (P3)
    });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // once per frame, not once per pass

    this.post = new Post();
    this.none = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
    this.none.needsUpdate = true;

    const linear = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter };
    const depth = new DepthTexture(1, 1);
    this.sceneRT = new WebGLRenderTarget(1, 1, { ...linear, depthTexture: depth });
    this.glowRT = new WebGLRenderTarget(1, 1, { ...linear, depthTexture: depth }); // shares the world's depth
    this.maskRT = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthTexture: depth }); // so does the outline mask
    this.white = new MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
    this.bloomRT = new WebGLRenderTarget(1, 1, linear);
    this.fogRT = new WebGLRenderTarget(1, 1, linear);
    this.scratchRT = new WebGLRenderTarget(1, 1, linear);
    this.fog = volumetricMaterial();

    this.pass = 'idle'; // read by things that must only act in the main pass (the reflector)
    this.bloom = true;
    this.steps = 12; // volumetric steps; 0 turns the pass off
    this.scale = 1;
  }

  /** Size every buffer for the tier's resolution scale. */
  resize(scale = this.scale) {
    this.scale = scale;
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * scale;
    const W = Math.max(1, Math.round(innerWidth * dpr));
    const H = Math.max(1, Math.round(innerHeight * dpr));
    this.W = W;
    this.H = H;
    this.renderer.setSize(W, H, false);
    this.sceneRT.setSize(W, H);
    this.glowRT.setSize(W, H);
    this.maskRT.setSize(W, H);
    const hw = Math.max(1, W >> 1);
    const hh = Math.max(1, H >> 1);
    for (const rt of [this.bloomRT, this.fogRT, this.scratchRT]) rt.setSize(hw, hh);
  }

  setShadows(size) {
    const r = this.renderer;
    const on = size > 0;
    if (r.shadowMap.enabled !== on) {
      r.shadowMap.enabled = on;
      return true; // materials must recompile
    }
    return false;
  }

  /** The volumetric pass's view of the world this frame. */
  _fogUniforms(camera, key, air) {
    const u = this.fog.uniforms;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.tShadow.value = key.shadow.map?.depthTexture ?? null;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uShadowMatrix.value.copy(key.shadow.matrix);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uKeyDir.value.copy(key.position).sub(key.target.position).normalize();
    u.uKeyColor.value.copy(key.color).multiplyScalar(key.intensity);
    u.uDensity.value = air.density;
    u.uSteps.value = this.steps;
    u.uLamps.value = air.lamps.length;
    air.lamps.forEach((l, i) => {
      u.uLampPos.value[i].copy(l.position);
      u.uLampColor.value[i].copy(l.color).multiplyScalar(l.intensity);
    });
  }

  /**
   * @param {object} f
   * @param {Scene}  f.bg, f.world
   * @param {Camera} f.bgCamera, f.camera
   * @param {Color}  f.clear       what is behind the sky (only seen if the dome fails)
   * @param {number} f.bloomStrength
   * @param {DirectionalLight} f.key   the shadow-casting light, for the light shafts
   * @param {object} f.air         { density, lamps: PointLight[] }
   * @param {Mesh}   [f.outline]   the thing being looked at: drawn into a mask, edged in the post pass
   */
  render({ bg, world, bgCamera, camera, clear, bloomStrength, key, air, outline }) {
    const r = this.renderer;
    // Shadows at 20 Hz: the sun moves once a second, and a door or a slime at
    // 20 Hz is still smooth. Two frames in three skip the whole shadow pass.
    this._frame = (this._frame ?? 0) + 1;
    r.shadowMap.needsUpdate = r.shadowMap.enabled && this._frame % 3 === 0;

    // ── background + world ────────────────────────────────────────────────
    this.pass = 'main';
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(clear, 1);
    r.clear(true, true, false);
    r.render(bg, bgCamera);
    r.clearDepth();
    r.render(world, camera);
    r.shadowMap.needsUpdate = false;

    // ── light in the air ──────────────────────────────────────────────────
    let fogTex = this.none;
    if (this.steps > 0 && key.shadow.map && air.density > 0.0005) {
      this.pass = 'fog';
      this._fogUniforms(camera, key, air);
      this.post.draw(r, this.fog, this.fogRT);
      this.post.blurInto(r, this.fogRT, this.scratchRT, 1.5);
      fogTex = this.fogRT.texture;
    }

    // ── emissive buffer ───────────────────────────────────────────────────
    let bloomTex = this.none;
    if (this.bloom) {
      this.pass = 'glow';
      const bgMask = bgCamera.layers.mask;
      const mask = camera.layers.mask;

      r.setRenderTarget(this.glowRT);
      r.setClearColor(0x000000, 1);
      r.clear(true, false, false); // colour only: the depth is the world's, and it stays

      // The sky's glowing things test against the world's depth too. Different
      // projections, but a star 1.4 km away sits at the very back of either,
      // so anything of the world in front of it hides it.
      bgCamera.layers.set(LAYER_GLOW);
      r.render(bg, bgCamera);
      camera.layers.set(LAYER_GLOW);
      r.render(world, camera);

      bgCamera.layers.mask = bgMask;
      camera.layers.mask = mask;

      this.post.blurInto(r, this.glowRT, this.scratchRT, 2, this.bloomRT);
      bloomTex = this.bloomRT.texture;
    }

    // ── outline mask: only the visible part of the target, thanks to the shared depth ──
    let maskTex = this.none;
    if (outline) {
      this.pass = 'mask';
      r.setRenderTarget(this.maskRT);
      r.setClearColor(0x000000, 1);
      r.clear(true, false, false);
      const mat = outline.material;
      outline.material = this.white;
      r.render(outline, camera);
      outline.material = mat;
      maskTex = this.maskRT.texture;
    }

    // ── post ──────────────────────────────────────────────────────────────
    this.pass = 'post';
    this.post.post.uniforms.tMask.value = maskTex;
    this.post.post.uniforms.uTexel.value.set(1 / this.W, 1 / this.H);
    this.post.composite(r, this.sceneRT, bloomTex, fogTex, bloomStrength, 1);
    this.pass = 'idle';
  }
}

export const linear = (rgb, out = new Color()) => out.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 'srgb');
