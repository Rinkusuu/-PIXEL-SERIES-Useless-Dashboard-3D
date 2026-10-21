/* ============================================================================
   water.js — the lake, which reflects the world, and the stream, which runs.

   The classic lake copies the frame above the shoreline, flipped. Here the
   world is rendered again from under the water (a planar reflector), so the
   cabin, the trees and the far bank stand upside-down in it for real. Where
   the reflection sees nothing — the sky lives in the background pass, not in
   the world — the water shows the palette's sky instead. The low tier skips
   the reflection and only does that.
   ========================================================================== */

import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Vector2,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAKE, STREAM, STREAM_HALF_WIDTH, WATER_Y, lineDist, streamSurfaceAt } from './layout.js';
import { linear } from './renderer.js';
import { mixRgb } from '../core/util.js';

const WATER = /* glsl */ {
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uSky: { value: new Color() },
    uSkyHigh: { value: new Color() },
    uDeep: { value: new Color() },
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uTexel: { value: new Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 uSky, uSkyHigh, uDeep;
    uniform float uTime, uMotion;
    uniform vec2 uTexel;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      float t = uTime * uMotion;
      // Ripples, in whole reflection texels: the wobble stays pixel-sized at any distance.
      vec2 wob = vec2(
        sin(vWorld.z * 1.7 + t * 1.3) + sin(vWorld.x * 0.6 - t * 0.7),
        sin(vWorld.x * 1.3 - t * 1.1)
      ) * 1.5;
      vec4 uv = vUv;
      uv.xy += wob * uTexel * uv.w;
      vec4 refl = texture2DProj(tDiffuse, uv);
      vec3 view = normalize(cameraPosition - vWorld);
      float grazing = 1.0 - clamp(view.y, 0.0, 1.0);
      vec3 sky = mix(uSkyHigh, uSky, grazing);
      vec3 seen = mix(sky, refl.rgb, refl.a);
      // Looking straight down you see into the water; at a glance, only the mirror.
      vec3 c = mix(uDeep, seen, 0.45 + 0.5 * grazing);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class Water {
  constructor(pipeline) {
    this.pipeline = pipeline;
    // Reflector takes its mirror plane from the MESH's orientation (local +z is
    // the normal), so the plane is turned by rotating the mesh, not the geometry.
    const geo = new PlaneGeometry(LAKE.rx * 2.3, LAKE.rz * 2.3);

    this.mirror = new Reflector(geo, { shader: WATER, textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: 0.02 });
    this.mirror.position.set(LAKE.x, WATER_Y, LAKE.z);
    this.mirror.rotation.x = -Math.PI / 2;

    // The reflector renders on ITS onBeforeRender — which also fires during
    // the emissive passes. Only the main pass gets a reflection.
    const reflect = this.mirror.onBeforeRender;
    this.mirror.onBeforeRender = (renderer, scene, camera) => {
      if (pipeline.pass !== 'main') return;
      const alpha = renderer.getClearAlpha();
      renderer.setClearAlpha(0); // where the reflection is empty, the shader paints sky
      reflect.call(this.mirror, renderer, scene, camera);
      renderer.setClearAlpha(alpha);
    };

    this.flatMat = new MeshBasicMaterial({ color: new Color() });
    this.flat = new Mesh(geo, this.flatMat);
    this.flat.position.copy(this.mirror.position);
    this.flat.rotation.copy(this.mirror.rotation);

    this.streamMat = new MeshBasicMaterial({ color: new Color(), side: DoubleSide });
    this.stream = new Mesh(streamGeometry(), this.streamMat);

    this.setReflect(1);
  }

  /** 0 = flat water (low tier), else the reflection texture's scale of the frame. */
  setReflect(scale) {
    this.scale = scale;
    this._show();
    this.resize();
  }

  /** Indoors the lake is a glimpse through a doorway: flat water is plenty, and a whole second render is not. */
  setIndoors(on) {
    if (this.indoors === on) return;
    this.indoors = on;
    this._show();
  }

  _show() {
    const reflect = this.scale > 0 && !this.indoors;
    this.mirror.visible = reflect;
    this.flat.visible = !reflect;
  }

  resize() {
    if (!this.scale) return;
    const w = Math.max(64, Math.round(this.pipeline.W * this.scale));
    const h = Math.max(64, Math.round(this.pipeline.H * this.scale));
    this.mirror.getRenderTarget().setSize(w, h);
    this.mirror.material.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  addTo(scene) {
    scene.add(this.mirror, this.flat, this.stream);
  }

  /** The reflection camera is a clone of the player's; grass is too fine to be worth mirroring. */
  watch(camera, skipLayer) {
    this.mirror.getReflectionCamera(camera).layers.disable(skipLayer);
  }

  update(env) {
    const { pal } = env;
    const u = this.mirror.material.uniforms;
    const deep = pal.lit('#3a6a8a', 0.7);
    linear(pal.sky[2], u.uSky.value);
    linear(pal.sky[1], u.uSkyHigh.value);
    linear(deep, u.uDeep.value);
    u.uTime.value = env.t;
    u.uMotion.value = env.motion;

    linear(mixRgb(deep, pal.sky[2], 0.55), this.flatMat.color);
    linear(mixRgb(pal.lit('#3a6a8a', 0.9), pal.sky[1], 0.4), this.streamMat.color);
  }
}

/** A ribbon down the stream's line, at its surface height. */
function streamGeometry() {
  const pts = [];
  for (let i = 1; i < STREAM.length; i++) {
    const [ax, az] = STREAM[i - 1];
    const [bx, bz] = STREAM[i];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const pos = [];
  const idx = [];
  pts.forEach(([x, z], i) => {
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    let dx = nx - px;
    let dz = nz - pz;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const y = streamSurfaceAt(lineDist(x, z, STREAM).u);
    const w = STREAM_HALF_WIDTH * 1.05;
    pos.push(x - dz * w, y, z + dx * w, x + dz * w, y, z - dx * w);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
