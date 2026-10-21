/* ============================================================================
   weather3d.js — the real weather, standing in the world.

   Rain and snow fall in a box that travels with you; the lake rings where
   drops land; the ground darkens when it's wet. Snow that has settled
   (env.snow — the classic meadow's resting level, pushed up by snowfall and
   melting back) lies on every upward-facing surface in blocky drifts, more
   cells covered the deeper it is, so it arrives and leaves the way it does in
   the painting. A storm throws lightning: a flash on the sky and the land,
   never more than three a second, and none at all under reduced motion — the
   thunder still comes, late, by distance.
   ========================================================================== */

import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { audio } from '../core/audio.js';
import { bus } from '../core/bus.js';
import { CABIN, isWater } from './layout.js';
import { clamp } from '../core/util.js';

/** Shared by every material that wears weather: change once, everything updates. */
export const weatherUniforms = {
  uSnow: { value: 0 },
  uWet: { value: 0 },
  // Under the cabin's roof it neither snows nor rains: the floor, the loft and the furniture stay dry.
  uDryMin: { value: new Vector3(CABIN.x0, CABIN.floorY - 0.2, CABIN.z0) },
  uDryMax: { value: new Vector3(CABIN.x1, CABIN.ridgeY, CABIN.z1) }, // up to the ridge: the loft rail stays dry too
  uRidgeZ: { value: CABIN.ridgeZ },
};

/**
 * Teach a Lambert material to wear snow and wetness. Chains any shader patch
 * it already has (the meadow's wind), and keys the program cache by both, so
 * two differently patched materials never share a compiled program.
 */
export function weatherize(material, { sides = false } = {}) {
  const prev = material.onBeforeCompile;
  const prevKey = prev ? prev.toString() : '';
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, weatherUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wwp = vec4(transformed, 1.0);
        vec3 wwn = objectNormal;
        #ifdef USE_INSTANCING
          wwp = instanceMatrix * wwp;
          wwn = mat3(instanceMatrix) * wwn;
        #endif
        vWP = (modelMatrix * wwp).xyz;
        vWN = normalize(mat3(modelMatrix) * wwn);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nuniform float uWet;\nuniform vec3 uDryMin;\nuniform vec3 uDryMax;\nuniform float uRidgeZ;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // A stepped voxel roof shows its risers from below: there, the risers that face OUT (away from
        // the ridge) hold snow too. The ones facing in are the ceiling, seen from the loft.
        float up = ${sides ? 'max(step(0.5, vWN.y), step(abs(vWN.y), 0.5) * step(0.0, vWN.z * (vWP.z - uRidgeZ)))' : 'smoothstep(0.35, 0.6, vWN.y)'};
        vec3 inD = step(uDryMin, vWP) * step(vWP, uDryMax) * ${sides ? '0.0' : '1.0'}; // the roof is the roof: it is never 'inside'
        up *= 1.0 - inD.x * inD.y * inD.z;
        // Drifts in half-metre cells: deeper snow covers more of them, so it
        // settles in patches and melts back in patches, never as a fade.
        float n = fract(sin(dot(floor(vWP.xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
        float cover = up * step(n, uSnow * 1.25 - 0.12);
        diffuseColor.rgb *= 1.0 - uWet * 0.3 * (0.4 + 0.6 * up) * (1.0 - inD.x * inD.y * inD.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), cover);
        #ifdef USE_INSTANCING
          // Grass and flowers (instanced, normals straight up): deep snow buries them to the tips.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), smoothstep(0.55, 0.95, uSnow) * up);
        #endif`
      );
  };
  material.customProgramCacheKey = () => `weather|${sides}|${prevKey}`;
  material.needsUpdate = true;
  return material;
}

const BOX = 40; // metres: the precipitation box around you
const MAX_DROPS = 1800;

export class Weather {
  constructor(scene, ripples) {
    this.ripples = ripples;
    // One instanced streak for rain, one instanced flake for snow.
    this.rain = new InstancedMesh(new BoxGeometry(0.012, 0.32, 0.012), new MeshBasicMaterial({ color: 0xbfd4ea, transparent: true, opacity: 0.55 }), MAX_DROPS);
    this.snow = new InstancedMesh(new BoxGeometry(0.05, 0.05, 0.05), new MeshBasicMaterial({ color: 0xf4f8ff }), MAX_DROPS);
    for (const m of [this.rain, this.snow]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.drops = Array.from({ length: MAX_DROPS }, () => ({ x: Math.random() * BOX, y: Math.random() * BOX * 0.5, z: Math.random() * BOX, p: Math.random() * 6.28 }));
    this._o = new Object3D();
    this.wet = 0;
    this.flash = 0; // 0–1: the lightning's light, read by the sky, the lights and the grade
    this._bolt = 6 + Math.random() * 8;
    this._flicks = [];
    this.indoors = false;
  }

  /** Under the cabin roof? (Rain on the roof, not on you.) */
  static inside(p) {
    return p.x > CABIN.x0 && p.x < CABIN.x1 && p.z > CABIN.z0 && p.z < CABIN.z1 && p.y < CABIN.ridgeY;
  }

  update(env, cam, dt, density) {
    const kind = env.weather;
    const raining = kind === 'rain' || kind === 'storm';
    const snowing = kind === 'snow';
    const amount = (raining || snowing ? (kind === 'storm' ? 1 : clamp(env.precip, 0.25, 1)) : 0) * density;

    // The ground gets wet in the rain and dries slowly after it.
    this.wet += ((raining ? 1 : 0) - this.wet) * (1 - Math.exp(-dt * (raining ? 0.25 : 0.04)));
    weatherUniforms.uWet.value = this.wet;
    weatherUniforms.uSnow.value = env.snow;

    this.indoors = Weather.inside(cam);
    audio.setIndoors?.(this.indoors);

    // Reduced motion retires everything that travels across the frame.
    const n = env.motion ? Math.round(MAX_DROPS * amount) : 0;
    const active = raining ? this.rain : this.snow;
    this.rain.count = raining ? n : 0;
    this.snow.count = snowing ? n : 0;
    if (n) {
      const fall = raining ? 9 : 1.1;
      const drift = env.wind * (raining ? 3 : 1.5);
      const o = this._o;
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        d.y -= fall * dt;
        d.x += drift * dt + (snowing ? Math.sin(env.t + d.p) * 0.3 * dt : 0);
        if (d.y < 0) d.y += BOX * 0.5;
        // Wrap round the camera so the box goes where you go.
        const x = cam.x - BOX / 2 + ((((d.x - cam.x) % BOX) + BOX) % BOX);
        const z = cam.z - BOX / 2 + ((((d.z - cam.z) % BOX) + BOX) % BOX);
        o.position.set(x, cam.y - 6 + d.y, z);
        o.rotation.set(0, 0, raining ? -drift * 0.05 : env.t + d.p);
        o.updateMatrix();
        active.setMatrixAt(i, o.matrix);
      }
      active.instanceMatrix.needsUpdate = true;
    }

    // Rings on the lake where the rain lands near you.
    if (raining && Math.random() < amount * dt * 30) {
      const x = cam.x + (Math.random() - 0.5) * 30;
      const z = cam.z + (Math.random() - 0.5) * 30;
      if (isWater(x, z)) this.ripples.spawn(x, z, 0.15);
    }

    this._lightning(kind === 'storm', env, dt);
  }

  _lightning(storm, env, dt) {
    this.flash = Math.max(0, this.flash - dt * 6);
    if (!storm) return;
    // A queued second flicker of the same bolt.
    this._flicks = this._flicks.filter((f) => {
      f.t -= dt;
      if (f.t > 0) return true;
      if (env.motion) this.flash = Math.max(this.flash, f.k);
      return false;
    });
    this._bolt -= dt;
    if (this._bolt > 0) return;
    this._bolt = 4 + Math.random() * 9;
    const distance = Math.random();
    // At most two flickers 0.35 s apart: never more than three flashes in a second.
    if (env.motion) {
      this.flash = 1 - distance * 0.6;
      if (Math.random() < 0.5) this._flicks.push({ t: 0.35, k: 0.7 - distance * 0.4 });
    }
    setTimeout(() => audio.thunder(distance), 300 + distance * 3000);
    if (distance < 0.3) bus.emit('lightning', { distance });
  }
}
