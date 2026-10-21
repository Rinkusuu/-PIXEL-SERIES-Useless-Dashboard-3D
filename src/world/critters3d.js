/* ============================================================================
   critters3d.js — who is out. The classic season.js decides how many of each;
   this only gives them bodies around you.

   Fireflies on summer nights (they pulse, on the glow layer), butterflies on
   spring and summer days, birds crossing high up by day, and the season's
   drift: pollen in spring, petals, blown leaves in autumn. Same code, four
   different worlds. Under reduced motion only the fireflies stay, and they
   pulse where they are: nothing travels.
   ========================================================================== */

import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three';
import { VoxelGrid, color, mesh } from './voxel.js';
import { LAYER_GLOW } from './renderer.js';
import { blockHeight, grassDensity } from './layout.js';

const R = 22; // metres around you that are populated

function butterflyGeometry() {
  const g = new VoxelGrid([-0.08, 0, -0.04], [0.08, 0.02, 0.04], 0.02);
  g.fillBox(-0.08, 0, -0.04, -0.01, 0.02, 0.04, color('#ffffff')); // left wing
  g.fillBox(0.01, 0, -0.04, 0.08, 0.02, 0.04, color('#ffffff')); // right wing
  g.fillBox(-0.01, 0, -0.03, 0.01, 0.02, 0.03, color('#2a2a30')); // body
  return mesh(g);
}

function birdGeometry() {
  const g = new VoxelGrid([-0.5, 0, -0.2], [0.5, 0.2, 0.2], 0.1);
  g.fillBox(-0.5, 0.1, -0.1, -0.1, 0.2, 0.1, color('#2a2a34'));
  g.fillBox(0.1, 0.1, -0.1, 0.5, 0.2, 0.1, color('#2a2a34'));
  g.fillBox(-0.1, 0, -0.2, 0.1, 0.1, 0.2, color('#2a2a34'));
  return mesh(g);
}

class Swarm {
  constructor(scene, geo, mat, max, spawn) {
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = Array.from({ length: max }, () => ({}));
    this.spawn = spawn;
  }
}

export class Critters {
  constructor(scene) {
    const o = new Object3D();
    this._o = o;
    const glow = new MeshBasicMaterial({ color: 0xffffff });
    this.fireflies = new Swarm(scene, new BoxGeometry(0.07, 0.07, 0.07), glow, 60);
    this.fireflies.mesh.layers.set(LAYER_GLOW);
    this.butterflies = new Swarm(scene, butterflyGeometry(), new MeshLambertMaterial({ vertexColors: true }), 24);
    this.birds = new Swarm(scene, birdGeometry(), new MeshLambertMaterial({ vertexColors: true }), 12);
    this.motes = new Swarm(scene, new BoxGeometry(0.04, 0.04, 0.04), new MeshLambertMaterial(), 80);
    this._c = new Color();
    this.butterflyColors = ['#ffd479', '#ff8fa3', '#c89bff', '#8fe0ff', '#ffffff'].map((h) => new Color(h));
  }

  /** A random place in the meadow near (cx, cz), or null if it's not meadow. */
  static meadowSpot(cx, cz) {
    const x = cx + (Math.random() * 2 - 1) * R;
    const z = cz + (Math.random() * 2 - 1) * R;
    return grassDensity(x, z) > 0.15 ? { x, z, g: blockHeight(x, z) } : null;
  }

  _keep(swarm, want, cam, make) {
    // Grow or shrink toward the wanted count; respawn anything that drifted away.
    swarm.mesh.count = Math.min(want, swarm.items.length);
    for (let i = 0; i < swarm.mesh.count; i++) {
      const it = swarm.items[i];
      if (!it.alive || Math.hypot(it.x - cam.x, it.z - cam.z) > R * 1.3) {
        const s = make(cam);
        if (s) Object.assign(it, s, { alive: true, t: Math.random() * 10 });
        else it.alive = false;
      }
    }
  }

  update(env, cam, dt) {
    const s = env.season ?? {};
    const night = env.pal.night;
    const wet = env.weather === 'rain' || env.weather === 'storm' || env.weather === 'snow';
    const m = env.motion;
    const o = this._o;

    // ── Fireflies: summer nights, in the grass. They pulse; with motion, they drift.
    const ff = night && !wet ? Math.round(55 * (s.fireflies ?? 0)) : 0;
    this._keep(this.fireflies, ff, cam, (c) => {
      const p = Critters.meadowSpot(c.x, c.z);
      return p && { x: p.x, z: p.z, y: p.g + 0.4 + Math.random() * 1.2, p: Math.random() * 6.28 };
    });
    this.fireflies.items.slice(0, this.fireflies.mesh.count).forEach((f, i) => {
      if (!f.alive) return this._hide(this.fireflies, i);
      f.t += dt;
      if (m) {
        f.x += Math.sin(f.t * 0.7 + f.p) * 0.3 * dt;
        f.z += Math.cos(f.t * 0.5 + f.p) * 0.3 * dt;
        f.y += Math.sin(f.t * 1.1 + f.p) * 0.15 * dt;
      }
      const pulse = Math.max(0, Math.sin(f.t * 1.8 + f.p)) ** 2 + env.bass * 0.6; // they flare on the bass
      o.position.set(f.x, f.y, f.z);
      o.scale.setScalar(0.4 + pulse);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      this.fireflies.mesh.setMatrixAt(i, o.matrix);
      this.fireflies.mesh.setColorAt(i, this._c.setRGB(1, 0.95, 0.45).multiplyScalar(1.2 + pulse * 2.5)); // HDR: they bloom
    });
    this._flush(this.fireflies);

    // ── Butterflies: spring and summer days, over the flowers.
    const bf = !night && !wet && m ? Math.round(10 * (s.butterflies ?? 0)) : 0;
    this._keep(this.butterflies, bf, cam, (c) => {
      const p = Critters.meadowSpot(c.x, c.z);
      return p && { x: p.x, z: p.z, y: p.g + 0.6, p: Math.random() * 6.28, h: Math.random() * 6.28, c: Math.floor(Math.random() * 5) };
    });
    this.butterflies.items.slice(0, this.butterflies.mesh.count).forEach((b, i) => {
      if (!b.alive) return this._hide(this.butterflies, i);
      b.t += dt;
      b.h += Math.sin(b.t * 0.9 + b.p) * dt * 1.5; // wandering heading
      b.x += Math.sin(b.h) * 0.8 * dt;
      b.z += Math.cos(b.h) * 0.8 * dt;
      b.y = blockHeight(b.x, b.z) + 0.5 + Math.sin(b.t * 2 + b.p) * 0.25;
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(0, b.h, 0);
      o.scale.set(Math.abs(Math.sin(b.t * 14)) * 0.8 + 0.2, 1, 1); // the flap
      o.updateMatrix();
      this.butterflies.mesh.setMatrixAt(i, o.matrix);
      this.butterflies.mesh.setColorAt(i, this.butterflyColors[b.c]);
    });
    this._flush(this.butterflies);

    // ── Birds: a few, high, crossing, by day.
    const bd = !night && kindAllowsBirds(env.weather) && m ? 6 : 0;
    this._keep(this.birds, bd, cam, (c) => {
      const a = Math.random() * 6.28;
      return { x: c.x - Math.cos(a) * R, z: c.z - Math.sin(a) * R, y: 22 + Math.random() * 14, h: a, p: Math.random() * 6.28 };
    });
    this.birds.items.slice(0, this.birds.mesh.count).forEach((b, i) => {
      if (!b.alive) return this._hide(this.birds, i);
      b.t += dt;
      b.x += Math.cos(b.h) * 6 * dt;
      b.z += Math.sin(b.h) * 6 * dt;
      o.position.set(b.x, b.y + Math.sin(b.t + b.p) * 0.4, b.z);
      o.rotation.set(0, -b.h + Math.PI / 2, Math.sin(b.t * 6 + b.p) * 0.3);
      o.scale.setScalar(1);
      o.updateMatrix();
      this.birds.mesh.setMatrixAt(i, o.matrix);
    });
    this._flush(this.birds);

    // ── The season's drift: pollen, petals, leaves on the wind.
    const drift = m && !wet ? Math.round(30 * Math.max(s.pollen ?? 0, s.petals ?? 0, (s.leafFall ?? 0) * 0.4)) : 0;
    const tint = (s.leafFall ?? 0) > 1 ? '#d9822b' : (s.petals ?? 0) > 0.5 ? '#ffc8d8' : '#fff4c0';
    this.motes.mesh.material.color.set(tint);
    this._keep(this.motes, drift, cam, (c) => ({ x: c.x + (Math.random() * 2 - 1) * R, z: c.z + (Math.random() * 2 - 1) * R, y: c.y + Math.random() * 6 - 1, p: Math.random() * 6.28 }));
    this.motes.items.slice(0, this.motes.mesh.count).forEach((d, i) => {
      if (!d.alive) return this._hide(this.motes, i);
      d.t += dt;
      d.x += (env.wind * 2.2 + Math.sin(d.t + d.p) * 0.3) * dt;
      d.y -= 0.12 * dt;
      if (d.y < blockHeight(d.x, d.z)) d.alive = false;
      o.position.set(d.x, d.y, d.z);
      o.rotation.set(d.t, d.t * 1.3, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      this.motes.mesh.setMatrixAt(i, o.matrix);
    });
    this._flush(this.motes);
  }

  _hide(swarm, i) {
    this._o.position.set(0, -99, 0);
    this._o.updateMatrix();
    swarm.mesh.setMatrixAt(i, this._o.matrix);
  }

  _flush(swarm) {
    swarm.mesh.instanceMatrix.needsUpdate = true;
    if (swarm.mesh.instanceColor) swarm.mesh.instanceColor.needsUpdate = true;
  }
}

const kindAllowsBirds = (kind) => kind === 'clear' || kind === 'cloudy';
