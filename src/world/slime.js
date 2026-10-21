/* ============================================================================
   slime.js — Blip, loose in the meadow.

   It hops from one patch of grass to another near the cabin, pausing to do
   nothing in between. Come close slowly and it turns to look at you; come
   close fast and it hops away. At night it sleeps by the porch and does not
   move at all. Feeding it from its panel makes it bounce; poking it makes it
   jump. Reduced motion: it sits where it is and only turns.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { blockHeight, grassDensity } from './layout.js';
import { clamp } from '../core/util.js';

const HOME = { x: 13, z: 62, r: 14 }; // its stretch of meadow, east of the path
const SLEEP = { x: 12.6, z: 67.2 }; // by the porch steps

export class Slime {
  constructor(mesh, player) {
    this.mesh = mesh;
    this.player = player;
    this.x = HOME.x;
    this.z = HOME.z + 4;
    this.target = null;
    this.wait = 1;
    this.hop = 0; // 0–1 through a hop
    this.joy = 0; // seconds of happy bouncing left
    this.yaw = 0;
    this._last = { x: player.pos.x, z: player.pos.z };
    bus.on('pet:fed', () => (this.joy = 2.5));
    bus.on('pet:poked', () => (this.joy = Math.max(this.joy, 0.8)));
  }

  _pickTarget() {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * HOME.r;
      const x = HOME.x + Math.cos(a) * r;
      const z = HOME.z + Math.sin(a) * r;
      if (grassDensity(x, z) > 0.1) return { x, z };
    }
    return { x: HOME.x, z: HOME.z };
  }

  update(env, dt) {
    const p = this.player.pos;
    const playerSpeed = Math.hypot(p.x - this._last.x, p.z - this._last.z) / Math.max(dt, 1e-3);
    this._last = { x: p.x, z: p.z };
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const near = Math.hypot(dx, dz);
    const asleep = env.pal.night && this.joy <= 0;
    this.joy = Math.max(0, this.joy - dt);

    if (asleep) {
      this.target = { x: SLEEP.x, z: SLEEP.z };
    } else if (near < 4 && playerSpeed > 1.4) {
      // Startled: hop directly away from you.
      this.target = { x: this.x - (dx / near) * 4, z: this.z - (dz / near) * 4 };
      this.wait = 0;
    } else if (!this.target) {
      this.wait -= dt;
      if (this.wait <= 0) this.target = this._pickTarget();
    }

    let bounce = 0;
    if (env.motion && this.target && !(asleep && Math.hypot(this.target.x - this.x, this.target.z - this.z) < 0.2)) {
      const tx = this.target.x - this.x;
      const tz = this.target.z - this.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.15) {
        this.target = null;
        this.wait = 2 + Math.random() * 5; // doing nothing, on purpose
      } else {
        // Hops, not a glide: it only moves while it is in the air.
        this.hop = (this.hop + dt * 2.2) % 1;
        const step = Math.min(d, 1.4 * dt * (this.hop < 0.6 ? 1.6 : 0));
        this.x += (tx / d) * step;
        this.z += (tz / d) * step;
        this.yaw = Math.atan2(tx, tz);
        bounce = this.hop < 0.6 ? Math.sin((this.hop / 0.6) * Math.PI) * 0.25 : 0;
      }
    } else if (near < 6 && !asleep) {
      this.yaw = Math.atan2(dx, dz); // looking at you
    }
    if (this.joy > 0 && env.motion) bounce = Math.abs(Math.sin(this.joy * 9)) * 0.3;

    const y = blockHeight(this.x, this.z);
    this.mesh.position.set(this.x, y + bounce, this.z);
    this.mesh.rotation.set(0, this.yaw, 0);
    // Squash when it lands, stretch in the air; flatter when asleep.
    const sq = asleep ? 0.75 : bounce > 0 ? 1.12 : 1 - clamp(0.3 - bounce, 0, 0.3) * 0.2;
    this.mesh.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  }
}
