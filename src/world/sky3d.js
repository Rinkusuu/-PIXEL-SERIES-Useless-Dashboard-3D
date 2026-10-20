/* ============================================================================
   sky3d.js — the background pass: dome, sun, moon, stars, planets, mountains.

   Everything here is real except the dome's colours, which are painted: the
   dome takes the palette's three sky stops, exactly as the classic sky does.
   The sun and the moon stand at their true altitude and azimuth for your
   latitude and longitude, now. The planets do not twinkle. The stars are the
   classic sky's 190, from the same seed, in the same order.
   ========================================================================== */

import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Mesh, PerspectiveCamera,
  Points, Scene, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { planetPositions, sunPosition, PLANETS } from '../sky/planets.js';
import { moonPosition } from '../sky/moon.js';
import { starField } from '../sky/stars.js';
import { fbm1, mixRgb } from '../core/util.js';
import { LAYER_GLOW, linear } from './renderer.js';

const RAD = Math.PI / 180;
const DOME_R = 1500;
const BODY_R = 1400;

/** Altitude/azimuth (degrees, azimuth from north through east) to a unit vector. +x east, −z north. */
export function skyDir(alt, az, out = new Vector3()) {
  const ca = Math.cos(alt * RAD);
  return out.set(Math.sin(az * RAD) * ca, Math.sin(alt * RAD), -Math.cos(az * RAD) * ca);
}

const DOME_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOME_FS = /* glsl */ `
  uniform vec3 uZenith, uMid, uHorizon, uGround, uGlow;
  uniform vec3 uSunDir;
  uniform float uSunUp;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.32, h));
    c = mix(c, uZenith, smoothstep(0.3, 0.95, h));
    c = mix(c, uGround, smoothstep(0.0, -0.025, h)); // a soft horizon, not a pale skirt bleeding under the land
    float s = max(dot(d, uSunDir), 0.0);
    c += uGlow * (pow(s, 64.0) * 0.5 + pow(s, 10.0) * 0.1) * uSunUp;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// A body (sun, moon) is one point sprite: a hard disc, with the moon's phase cut into it.
const BODY_VS = /* glsl */ `
  uniform float uSize;
  void main() {
    gl_PointSize = uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BODY_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPhase;   // <0: no phase (the sun). 0 new → 0.5 full → 1 new
  uniform float uAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float lit = 1.0;
    if (uPhase >= 0.0) {
      float k = cos(6.2831853 * uPhase) * sqrt(1.0 - p.y * p.y);
      float side = uPhase < 0.5 ? p.x : -p.x;
      lit = side > k ? 1.0 : 0.07; // the dark limb keeps a breath of earthshine
    }
    gl_FragColor = vec4(uColor * lit, uAlpha);
  }
`;

const STAR_VS = /* glsl */ `
  attribute float aSize, aBase, aSpeed, aPhase, aWarm;
  uniform float uTime, uStars;
  varying float vA;
  varying float vWarm;
  void main() {
    // Twinkle is an opacity change, never movement: it survives reduced motion.
    vA = uStars * aBase * (0.62 + 0.38 * sin(uTime * aSpeed + aPhase));
    vWarm = aWarm;
    gl_PointSize = aSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FS = /* glsl */ `
  varying float vA;
  varying float vWarm;
  void main() {
    vec3 c = mix(vec3(0.92, 0.94, 1.0), vec3(1.0, 0.86, 0.6), vWarm);
    gl_FragColor = vec4(c * vA, 1.0);
  }
`;

const PLANET_VS = /* glsl */ `
  attribute vec3 aColor;
  attribute float aVisible;
  uniform float uStars;
  varying vec3 vC;
  void main() {
    // A planet is a disc, not a point: it does not twinkle. No time term here, on purpose.
    vC = aColor * aVisible * clamp(uStars * 1.6, 0.0, 1.0);
    gl_PointSize = 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PLANET_FS = /* glsl */ `
  varying vec3 vC;
  void main() { gl_FragColor = vec4(vC, 1.0); }
`;

const MOUNTAIN_VS = /* glsl */ `
  attribute float aTop;
  varying float vTop;
  void main() {
    vTop = aTop;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const MOUNTAIN_FS = /* glsl */ `
  uniform vec3 uColor, uTopColor, uSnow;
  uniform float uSnowLine;
  varying float vTop;
  void main() {
    vec3 c = mix(uColor, uTopColor, vTop);
    c = mix(c, uSnow, step(uSnowLine, vTop));
    gl_FragColor = vec4(c, 1.0);
  }
`;

// The classic ridges, wrapped around the world: far and hazy to near and dark.
const RIDGES = [
  { r: 1150, h: 210, base: '#5a6b96', haze: 0.62, seed: 11, freq: 5, snow: false },
  { r: 900, h: 150, base: '#3f4d78', haze: 0.36, seed: 27, freq: 8, snow: true },
  { r: 650, h: 85, base: '#2b3557', haze: 0.14, seed: 43, freq: 13, snow: false },
];

function ridgeGeometry({ r, h, seed, freq }) {
  const N = 240;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const top = new Float32Array((N + 1) * 2);
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    // Noise sampled around a circle, so the ridge closes on itself without a seam.
    const n = fbm1(Math.cos(a) * freq + seed, 4, seed) * 0.6 + fbm1(Math.sin(a) * freq + seed * 3, 4, seed + 1) * 0.4;
    const y = h * (0.25 + 0.95 * n) - 30;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    pos.set([x, y, z, x, -12, z], i * 6); // the foot stays near the horizon: below it is the dome's hazy forest
    top.set([Math.max(0, n * 1.2 - 0.1), 0], i * 2);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aTop', new BufferAttribute(top, 1));
  g.setIndex(idx);
  return g;
}

export class Sky {
  constructor() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(70, 1, 1, 4000);
    this.camera.layers.enable(LAYER_GLOW);

    this.domeMat = new ShaderMaterial({
      vertexShader: DOME_VS,
      fragmentShader: DOME_FS,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new Color() }, uMid: { value: new Color() }, uHorizon: { value: new Color() },
        uGround: { value: new Color() }, uGlow: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) }, uSunUp: { value: 1 },
      },
    });
    this.dome = new Mesh(new SphereGeometry(DOME_R, 32, 16), this.domeMat);
    this.scene.add(this.dome);

    // Stars.
    const field = starField();
    const sp = new Float32Array(field.length * 3);
    const attr = (k) => new BufferAttribute(new Float32Array(field.map((s) => +s[k])), 1);
    field.forEach((s, i) => skyDir(s.alt, s.az).multiplyScalar(BODY_R).toArray(sp, i * 3));
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(sp, 3));
    sg.setAttribute('aSize', attr('size'));
    sg.setAttribute('aBase', attr('base'));
    sg.setAttribute('aSpeed', attr('speed'));
    sg.setAttribute('aPhase', attr('phase'));
    sg.setAttribute('aWarm', attr('warm'));
    this.starMat = new ShaderMaterial({
      vertexShader: STAR_VS, fragmentShader: STAR_FS,
      uniforms: { uTime: { value: 0 }, uStars: { value: 0 } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.stars = new Points(sg, this.starMat);
    this.stars.layers.enable(LAYER_GLOW);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // Planets.
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(new Float32Array(PLANETS.length * 3), 3));
    pg.setAttribute('aColor', new BufferAttribute(new Float32Array(PLANETS.length * 3), 3));
    pg.setAttribute('aVisible', new BufferAttribute(new Float32Array(PLANETS.length), 1));
    this.planetMat = new ShaderMaterial({
      vertexShader: PLANET_VS, fragmentShader: PLANET_FS,
      uniforms: { uStars: { value: 0 } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.planets = new Points(pg, this.planetMat);
    this.planets.layers.enable(LAYER_GLOW);
    this.planets.frustumCulled = false;
    this.scene.add(this.planets);
    PLANETS.forEach((p, i) => linear(p.rgb).toArray(pg.attributes.aColor.array, i * 3));

    // Sun and moon.
    this.sun = this._body(9, -1);
    this.moon = this._body(7, 0.5);

    // Mountains, drawn after the bodies so a setting sun sinks behind them.
    this.ridges = RIDGES.map((ridge) => {
      const mat = new ShaderMaterial({
        vertexShader: MOUNTAIN_VS, fragmentShader: MOUNTAIN_FS,
        uniforms: {
          uColor: { value: new Color() }, uTopColor: { value: new Color() },
          uSnow: { value: new Color() }, uSnowLine: { value: ridge.snow ? 0.72 : 2 },
        },
      });
      const m = new Mesh(ridgeGeometry(ridge), mat);
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return { ...ridge, mat };
    });

    this.sunDir = new Vector3(0, 1, 0);
    this.moonDir = new Vector3(0, -1, 0);
    this.sunAlt = 45;
    this.moonAlt = -10;
    this.moonPhase = 0.5;
    this._clock = 0;
    this._tmp = new Vector3();
  }

  _body(size, phase) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    const mat = new ShaderMaterial({
      vertexShader: BODY_VS, fragmentShader: BODY_FS,
      uniforms: { uSize: { value: size }, uColor: { value: new Color() }, uPhase: { value: phase }, uAlpha: { value: 1 } },
      depthWrite: false, transparent: true,
    });
    const p = new Points(g, mat);
    p.layers.enable(LAYER_GLOW);
    p.frustumCulled = false;
    p.renderOrder = 1;
    this.scene.add(p);
    return p;
  }

  /** The instant the sky should show: now, or today at the frozen hour. */
  static instant(hour) {
    const d = new Date();
    d.setHours(Math.floor(hour), Math.floor((hour % 1) * 60), Math.floor(((hour * 60) % 1) * 60), 0);
    return d;
  }

  /** Recompute positions (cheap, but no need every frame) and colours from the palette. */
  update(env, dt) {
    const { pal } = env;
    const u = this.domeMat.uniforms;

    this._clock -= dt;
    if (this._clock <= 0) {
      this._clock = 1; // the sky turns 0.004° a second; once a second is plenty
      const date = Sky.instant(env.hour);
      const sun = sunPosition(date, env.lat, env.lon);
      const moon = moonPosition(date, env.lat, env.lon);
      this.sunAlt = sun.alt;
      this.moonAlt = moon.alt;
      this.moonPhase = moon.phase;
      skyDir(sun.alt, sun.az, this.sunDir);
      skyDir(moon.alt, moon.az, this.moonDir);
      this.sun.geometry.attributes.position.array.set(this._tmp.copy(this.sunDir).multiplyScalar(BODY_R).toArray());
      this.sun.geometry.attributes.position.needsUpdate = true;
      this.moon.geometry.attributes.position.array.set(this._tmp.copy(this.moonDir).multiplyScalar(BODY_R).toArray());
      this.moon.geometry.attributes.position.needsUpdate = true;
      this.moon.material.uniforms.uPhase.value = moon.phase;

      const pa = this.planets.geometry.attributes;
      planetPositions(date, env.lat, env.lon).forEach((p, i) => {
        skyDir(p.alt, p.az, this._tmp).multiplyScalar(BODY_R).toArray(pa.position.array, i * 3);
        pa.aVisible.array[i] = p.alt > 0 ? 1 : 0;
      });
      pa.position.needsUpdate = true;
      pa.aVisible.needsUpdate = true;
    }

    linear(pal.sky[0], u.uZenith.value);
    linear(pal.sky[1], u.uMid.value);
    linear(pal.sky[2], u.uHorizon.value);
    // Below the horizon: the world fog's colour, which is exactly what the land fades into.
    linear(mixRgb(pal.sky[2], pal.fog, 0.5), u.uGround.value);
    linear(pal.glow, u.uGlow.value);
    u.uSunDir.value.copy(this.sunDir);
    u.uSunUp.value = Math.max(0, Math.min(1, (this.sunAlt + 6) / 12));

    linear(pal.sun, this.sun.material.uniforms.uColor.value);
    this.sun.visible = this.sunAlt > -2;
    linear(mixRgb([236, 240, 255], pal.glow, 0.15), this.moon.material.uniforms.uColor.value);
    this.moon.visible = this.moonAlt > -2;
    // A daytime moon is pale: it fades with the light, never fully.
    this.moon.material.uniforms.uAlpha.value = 1 - pal.lum * 0.55;

    this.starMat.uniforms.uTime.value = env.t;
    this.starMat.uniforms.uStars.value = pal.stars;
    this.planetMat.uniforms.uStars.value = Math.max(pal.stars, (1 - pal.lum) * 0.6);

    for (const r of this.ridges) {
      const base = pal.lit(r.base, 0.9);
      const hazed = mixRgb(base, pal.sky[2], r.haze);
      linear(hazed, r.mat.uniforms.uColor.value);
      linear(mixRgb(hazed, pal.sky[1], 0.25), r.mat.uniforms.uTopColor.value);
      linear(mixRgb(pal.lit('#eef2f8', 1.1), pal.sky[2], r.haze * 0.6), r.mat.uniforms.uSnow.value);
    }
  }

  /** Follow the world camera's rotation and lens; the sky never translates. */
  sync(camera) {
    this.camera.quaternion.copy(camera.quaternion);
    if (this.camera.fov !== camera.fov || this.camera.aspect !== camera.aspect) {
      this.camera.fov = camera.fov;
      this.camera.aspect = camera.aspect;
      this.camera.updateProjectionMatrix();
    }
  }
}
