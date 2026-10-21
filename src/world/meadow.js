/* ============================================================================
   meadow.js — grass that bends in travelling gusts, and the flowers in it.

   Each instance is a tuft of four voxel stalks. Tufts are bucketed into 25 m tiles
   so the camera culls what it can't see, and tiles past the fog are hidden
   outright. The wind is in the vertex shader: a gust is a wave moving across
   the meadow, so neighbouring tufts lean together and the field visibly
   breathes — the classic meadow's travelling gusts, in three dimensions.

   Every stalk's normal points straight up. Lit like that, a tuft takes the
   ground's light instead of glittering with four random facets.
   ========================================================================== */

import { BufferAttribute, Color, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { MAP_HALF, blockHeight, grassDensity } from './layout.js';
import { tuftGeometry } from './models.js';
import { VoxelGrid, color, mesh } from './voxel.js';
import { fbm2, rng } from '../core/util.js';

const TILE = 40; // big enough to keep the draw count down, small enough to cull
const MAX_TUFTS = 45000; // voxel tufts are chunkier than blades; fewer read as just as thick
const FLOWER_EVERY = 22;
export const LAYER_GRASS = 2; // not drawn in the occluder pass or the reflection

/** A flower head: a little white voxel cluster above the grass, tinted per instance. */
function flowerGeometry() {
  const g = new VoxelGrid([-0.06, 0, -0.06], [0.06, 0.4, 0.06], 0.04);
  g.fillBox(-0.06, 0.3, -0.02, 0.06, 0.34, 0.02, color('#ffffff'));
  g.fillBox(-0.02, 0.3, -0.06, 0.02, 0.34, 0.06, color('#ffffff'));
  g.fillBox(-0.02, 0.34, -0.02, 0.02, 0.38, 0.02, color('#ffffff'));
  const geo = mesh(g);
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(geo.attributes.position.count * 2).fill(1), 2)); // all of it sways
  return geo;
}

/** Bend tufts in the wind: injected into Lambert so they keep lighting, fog and shadows. */
export function windy(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uMotion;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 root = instanceMatrix[3].xyz;
          // A gust is a wave travelling across the meadow, plus a small flutter.
          float gust = sin(root.x * 0.11 + root.z * 0.05 - uTime * 1.6) * 0.5 + 0.5;
          gust = gust * gust;
          float flutter = sin(uTime * 3.7 + root.x * 1.3 + root.z * 0.7) * 0.15;
          float bend = (0.15 + gust * 0.85 + flutter) * uWind * uMotion * uv.y * uv.y;
          // The wind blows east-north-east in world space; carry that into the tuft's own frame.
          vec3 windLocal = transpose(mat3(instanceMatrix)) * vec3(0.9, 0.0, -0.45);
          transformed.xz += normalize(windLocal.xz) * bend * 0.45;
          transformed.y -= bend * bend * 0.12;
        #endif`
      );
  };
  return material;
}

export class Meadow {
  constructor() {
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.4 }, uMotion: { value: 1 } };
    const grassMat = windy(new MeshLambertMaterial({ vertexColors: true }), this.uniforms);
    const flowerMat = windy(new MeshLambertMaterial({ vertexColors: true }), this.uniforms);
    const tuft = tuftGeometry();
    const flower = flowerGeometry();

    // Scatter, then bucket by tile.
    const r = rng(2026);
    const tiles = new Map();
    let placed = 0;
    let tries = 0;
    while (placed < MAX_TUFTS && tries++ < MAX_TUFTS * 6) {
      const x = (r() * 2 - 1) * MAP_HALF;
      const z = (r() * 2 - 1) * MAP_HALF;
      if (r() > grassDensity(x, z)) continue;
      const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push([x, z, r() * 6.28, 0.7 + r() * 0.7, r()]);
      placed++;
    }

    const petals = ['#d07a6a', '#c8a0d8', '#f0d070', '#f4f1ff'].map((h) => new Color(h));
    const o = new Object3D();
    const c = new Color();
    this.tiles = [];
    for (const [key, list] of tiles) {
      const [tx, tz] = key.split(',').map(Number);
      const grass = new InstancedMesh(tuft, grassMat, list.length);
      const flowers = new InstancedMesh(flower, flowerMat, Math.ceil(list.length / FLOWER_EVERY));
      let nf = 0;
      list.forEach(([x, z, rot, s, k], i) => {
        o.position.set(x, blockHeight(x, z), z);
        o.rotation.set(0, Math.round(rot / (Math.PI / 2)) * (Math.PI / 2), 0);
        o.scale.set(s, s * (0.8 + fbm2(x * 0.05, z * 0.05, 2, 9) * 0.6), s);
        o.updateMatrix();
        grass.setMatrixAt(i, o.matrix);
        grass.setColorAt(i, c.setHSL(0, 0, 0.85 + k * 0.3));
        if (i % FLOWER_EVERY === 0) {
          flowers.setMatrixAt(nf, o.matrix);
          flowers.setColorAt(nf, petals[Math.floor(k * petals.length)]);
          nf++;
        }
      });
      flowers.count = nf;
      for (const m of [grass, flowers]) {
        m.receiveShadow = true;
        m.layers.set(LAYER_GRASS);
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
      this.tiles.push({ grass, flowers, cx: (tx + 0.5) * TILE, cz: (tz + 0.5) * TILE, total: list.length, totalFlowers: nf });
    }
    this.density = 1;
  }

  addTo(scene) {
    for (const t of this.tiles) scene.add(t.grass, t.flowers);
  }

  setDensity(fraction) {
    this.density = fraction;
    for (const t of this.tiles) {
      t.grass.count = Math.round(t.total * fraction);
      t.flowers.count = Math.round(t.totalFlowers * Math.max(fraction, 0.3));
    }
  }

  /** Wind, time, and hiding tiles past the fog. */
  update(env, camPos, far) {
    this.uniforms.uTime.value = env.t;
    this.uniforms.uWind.value = 0.25 + env.wind * 0.9;
    this.uniforms.uMotion.value = env.motion; // reduced motion stills the grass, as in the classic meadow
    // Grass past ~70 m is a colour, not a shape: the ground's own green carries it.
    const reach = (Math.min(70, far * 0.55) + TILE * 0.71) ** 2; // + half a tile's diagonal
    for (const t of this.tiles) {
      const dx = t.cx - camPos.x;
      const dz = t.cz - camPos.z;
      const on = dx * dx + dz * dz < reach;
      t.grass.visible = on;
      t.flowers.visible = on;
    }
  }
}
