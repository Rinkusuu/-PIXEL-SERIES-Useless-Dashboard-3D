/* ============================================================================
   stones3d.js — skipping stones from the shore.

   E at the pile picks up a flat one. Where you look is where it goes: look
   low over the water for a flat throw, up for a lob. Hold E to wind up, let go
   to throw. Then it is a real projectile in real metres, and every time it
   meets the water core/stones.js decides — by the same angle of attack as the
   classic lake — whether it skips or digs in. Throw flat, throw far. Nobody
   has to be told that.
   ========================================================================== */

import { Vector3 } from 'three';
import { contact, finishThrow, stoneCharacter } from '../core/stones.js';
import { bus } from '../core/bus.js';
import { play } from '../core/play.js';
import { SPOTS, WATER_Y, blockHeight, isWater } from './layout.js';
import { voxelMesh } from './voxel.js';
import { rock } from './models.js';

const G = 9.8;
/* Classic stones need 30 px/s against a gravity of 62 px/s²; the same ratio in
   metres: 30 / 62 × 9.8 ≈ 4.7 m/s. Slower than that and it can't plane. */
const MIN_FORWARD = (30 / 62) * G;
const WIND_SECONDS = 1;
const LEASH = 12;

export class Stones {
  constructor(scene, player, ripples) {
    this.player = player;
    this.ripples = ripples;
    this.charge = 0;
    this.stone = null;
    this._next = 0;

    const tpl = voxelMesh(rock(0.07, 5, 0.025));
    this.inHand = tpl.clone();
    this.inHand.castShadow = false;
    this.inHand.visible = false;
    player.camera.add(this.inHand);
    this.flying = tpl.clone();
    this.flying.visible = false;
    scene.add(this.flying);

    this._dir = new Vector3();
    bus.on('play', ({ mode }) => mode !== 'skip' && this._putDown());
    addEventListener('keydown', (e) => e.key === 'Escape' && play.mode === 'skip' && play.set(null));
  }

  get active() {
    return play.mode === 'skip';
  }

  pickUp() {
    play.set('skip');
    this.inHand.visible = true;
    this.charge = 0;
    bus.emit('toast', { icon: '🪨', text: 'Look low over the water. Hold E, let go to throw.', ms: 5000 });
  }

  _putDown() {
    this.inHand.visible = false;
  }

  update(intent, env, dt) {
    if (this.stone) this._fly(dt);
    if (!this.active) return;
    const p = this.player.pos;
    if (Math.hypot(p.x - SPOTS.stones.x, p.z - SPOTS.stones.z) > LEASH) return play.set(null);

    // The next stone is in your hand a moment after the last one leaves it.
    this._next = Math.max(0, this._next - dt);
    this.inHand.visible = !this.stone && this._next === 0;
    this.inHand.position.set(0.22, -0.28 + this.charge * 0.05, -0.4 + this.charge * 0.15);

    if (!this.inHand.visible) return;
    if (intent.useHeld) this.charge = Math.min(1, this.charge + dt / WIND_SECONDS);
    // A tap is not a throw (the tap that picked the stone up must not throw it).
    if (intent.useReleased) this.charge > 0.06 ? this._throw() : (this.charge = 0);
  }

  _throw() {
    const cam = this.player.camera;
    cam.getWorldDirection(this._dir);
    const speed = 5 + 13 * this.charge; // m/s
    this.charge = 0;
    // A side-arm throw: it leaves the hand low, about half a metre above your feet.
    const start = cam.position.clone().addScaledVector(this._dir, 0.4);
    start.y = this.player.pos.y + 0.5;
    this.stone = {
      x: start.x, y: start.y, z: start.z,
      vx: this._dir.x * speed,
      vy: this._dir.z * speed, // "vy" runs along the water, as in core/stones.js
      vh: this._dir.y * speed,
      ...stoneCharacter(),
      skips: 0,
      spin: 0,
    };
    this.flying.visible = true;
    this.inHand.visible = false;
    this._next = 0.8;
    bus.emit('sfx', 'click');
  }

  _fly(dt) {
    const s = this.stone;
    s.vh -= G * dt;
    s.x += s.vx * dt;
    s.y += s.vh * dt;
    s.z += s.vy * dt;
    s.spin += dt * 20;
    this.flying.position.set(s.x, s.y, s.z);
    this.flying.rotation.set(0, s.spin, 0);

    if (Math.hypot(s.x - SPOTS.stones.x, s.z - SPOTS.stones.z) > 140) return this._done();

    if (!isWater(s.x, s.z)) {
      // Over land: it lands when it meets the ground, and that's the end of it.
      if (s.y <= blockHeight(s.x, s.z)) this._done();
      return;
    }
    if (s.y > WATER_Y) return;

    // ── Contact with the lake ─────────────────────────────────────────────
    s.y = WATER_Y;
    const forward = Math.hypot(s.vx, s.vy);
    this.ripples.spawn(s.x, s.z, Math.min(1, forward / 15));
    if (contact(s, MIN_FORWARD) === 'sink') {
      bus.emit('splash', Math.min(0.8, Math.max(0.2, forward / 18)));
      return this._done();
    }
    s.y = WATER_Y + 0.01;
  }

  _done() {
    const n = this.stone.skips;
    this.stone = null;
    this.flying.visible = false;
    finishThrow(n);
  }
}
