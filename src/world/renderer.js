/* ============================================================================
   renderer.js — the frame, from sky to screen.

   RESOLUTION. Same policy as the classic scene, for the same reasons: render
   into a small buffer (240–360 rows, by tier) and let CSS blow it up with
   `image-rendering: pixelated`. Fill cost is constant on any monitor, and the
   pixels are the art direction.

   PASSES, in order:
     background  sky dome, sun, moon, stars, planets, mountains — their own
                 camera with a deep depth range, so a mountain 900 m away and a
                 cup 0.5 m away never fight over depth precision
     world       everything walkable, cleared depth, near 0.05 / far 300
     emissive    half-res: the world in flat black (occluders), then only the
                 glowing things (layer 1) in their own colours — the classic
                 glow buffer, rebuilt for 3D
     blur        two passes on the emissive buffer
     post        LUT + dither + bloom, to the canvas (post.js)
   ========================================================================== */

import {
  Color, DataTexture, HalfFloatType, LinearFilter, MeshBasicMaterial, NearestFilter,
  BasicShadowMap, RGBAFormat, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { Post } from './post.js';
import { clamp } from '../core/util.js';

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
    this.renderer.shadowMap.type = BasicShadowMap; // hard-edged: a soft shadow in a pixel world is a smudge
    this.renderer.shadowMap.autoUpdate = false; // once per frame, not once per pass

    this.post = new Post();
    this.black = new MeshBasicMaterial({ color: 0x000000 });
    this.noBloom = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
    this.noBloom.needsUpdate = true;

    this.sceneRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter });
    this.bloomRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter });
    this.scratchRT = this.bloomRT.clone();

    this.pass = 'idle'; // read by things that must only act in the main pass (the reflector)
    this.bloom = true;
    this.rows = 360;
  }

  /** Size the buffers for the tier's row count, keeping the upscale an integer. */
  resize(rows = this.rows) {
    this.rows = rows;
    const vw = Math.max(1, innerWidth);
    const vh = Math.max(1, innerHeight);
    const scale = clamp(Math.round(vh / rows), 1, 8);
    const W = Math.ceil(vw / scale);
    const H = Math.ceil(vh / scale);

    this.W = W;
    this.H = H;
    this.scale = scale;
    this.renderer.setSize(W, H, false);
    this.sceneRT.setSize(W, H);
    const bw = Math.max(1, W >> 1);
    const bh = Math.max(1, H >> 1);
    this.bloomRT.setSize(bw, bh);
    this.scratchRT.setSize(bw, bh);
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

  /**
   * @param {object} f
   * @param {Scene}  f.bg, f.world
   * @param {Camera} f.bgCamera, f.camera
   * @param {Color}  f.clear       what is behind the sky (only seen if the dome fails)
   * @param {number} f.bloomStrength
   */
  render({ bg, world, bgCamera, camera, clear, bloomStrength }) {
    const r = this.renderer;

    r.shadowMap.needsUpdate = r.shadowMap.enabled;

    // ── background + world ────────────────────────────────────────────────
    this.pass = 'main';
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(clear, 1);
    r.clear(true, true, false);
    r.render(bg, bgCamera);
    r.clearDepth();
    r.render(world, camera);
    r.shadowMap.needsUpdate = false;

    // ── emissive buffer ───────────────────────────────────────────────────
    let bloomTex = this.noBloom;
    if (this.bloom) {
      this.pass = 'glow';
      const bgMask = bgCamera.layers.mask;
      const mask = camera.layers.mask;

      r.setRenderTarget(this.bloomRT);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);

      bgCamera.layers.set(LAYER_GLOW);
      r.render(bg, bgCamera);
      r.clearDepth();

      // Occluders: everything that does not glow, drawn black, so a lit window
      // behind a tree does not bloom through the tree.
      camera.layers.set(0);
      world.overrideMaterial = this.black;
      r.render(world, camera);
      world.overrideMaterial = null;

      camera.layers.set(LAYER_GLOW);
      r.render(world, camera);

      bgCamera.layers.mask = bgMask;
      camera.layers.mask = mask;

      this.post.blurBloom(r, this.bloomRT, this.scratchRT);
      bloomTex = this.bloomRT.texture;
    }

    // ── post ──────────────────────────────────────────────────────────────
    this.pass = 'post';
    this.post.composite(r, this.sceneRT, bloomTex, bloomStrength);
    this.pass = 'idle';
  }
}

export const linear = (rgb, out = new Color()) => out.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 'srgb');
