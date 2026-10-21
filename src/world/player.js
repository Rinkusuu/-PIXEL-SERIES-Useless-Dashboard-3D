/* ============================================================================
   player.js — a person walking slowly through a small world.

   2.2 m/s, no running, no jumping. Steps up what a foot can step up, drifts
   down off a porch, stops at walls, water and the edge of the world. First
   person, eye at 1.6 m. Head bob is off unless asked for (and never under
   reduced motion); snap turn turns in 30° steps for people who need it.

   Every visit starts the same way: in the loft bed, waking up, facing the
   room. Reduced motion skips the sitting-up and just fades in standing.
   ========================================================================== */

import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { PLAYER } from './collision.js';
import { CABIN, SPOTS } from './layout.js';
import { store } from '../core/store.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { LAYER_GLOW } from './renderer.js';
import { LAYER_GRASS } from './meadow.js';

const SPEED = 2.2;
const ACCEL = 9;
const PITCH_MAX = 1.45;
const SNAP = Math.PI / 6;
const WAKE_SECONDS = 2.2;

export class Player {
  constructor(col) {
    this.col = col;
    this.camera = new PerspectiveCamera(70, 1, 0.05, 320);
    this.camera.layers.enable(LAYER_GLOW);
    this.camera.layers.enable(LAYER_GRASS);
    this.camera.rotation.order = 'YXZ';

    const bed = SPOTS.bed;
    // Standing beside the bed, looking north over the loft rail into the room.
    this.pos = { x: bed.x, y: CABIN.loftY, z: bed.z - 0.95, groundY: CABIN.loftY };
    this.yaw = -0.35;
    this.pitch = -0.18;
    this.vel = new Vector2();
    this.walked = 0; // metres, for head bob and for knowing when to retire the hints
    this.target = null; // tap-to-walk destination
    this._snapAcc = 0;
    this._wake = 0;
    this._ray = new Raycaster();
    this._v = new Vector3();
  }

  /** Begin the morning. `animate` false = just stand there (reduced motion). */
  wake(animate) {
    this._wake = animate ? WAKE_SECONDS : 0;
  }

  get waking() {
    return this._wake > 0;
  }

  /** Turn to face a direction: eased with motion, at once without (the caller fades). */
  lookToward(yaw, pitch, instant) {
    // Take the short way round.
    const d = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    if (instant) {
      this.yaw += d;
      this.pitch = pitch;
      this._turn = null;
    } else this._turn = { yaw: this.yaw + d, pitch };
  }

  /** Sit on a seat ({ x, y, z, yaw, standZ }): the camera settles and stays still. */
  sit(seat) {
    this.seat = seat;
    this.target = null;
    this.vel.set(0, 0);
    Object.assign(this.pos, { x: seat.x, y: seat.y, z: seat.z, groundY: seat.y });
    this.yaw = seat.yaw;
    this.pitch = 0.04;
  }

  stand() {
    if (!this.seat) return;
    const { x, standZ, y } = this.seat;
    this.seat = null;
    this.pos.z = standZ;
    this.pos.y = this.pos.groundY = this.col.groundAt(x, standZ, y + 0.5).y;
  }

  setFov(fov) {
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** Where a screen point (NDC) meets the ground, by marching the ray over the height field. */
  groundPoint(ndc) {
    this._ray.setFromCamera(ndc, this.camera);
    const { origin, direction } = this._ray.ray;
    const p = this._v.copy(origin);
    for (let d = 0; d < 90; d += 0.25) {
      p.copy(origin).addScaledVector(direction, d);
      const g = this.col.groundAt(p.x, p.z, this.pos.y + 0.6).y;
      if (p.y <= g) return { x: p.x, z: p.z };
    }
    return null;
  }

  update(intent, dt, motion) {
    const view = store.get('view');

    // Sitting (Zen): no walking, no looking about. The world moves; you don't.
    // Lying back on the rock (stargazing) you may look around the sky.
    if (this.seat) {
      if (this.seat.look) {
        this.yaw -= intent.look.dx;
        this.pitch = clamp(this.pitch - intent.look.dy, -0.2, 1.56); // lying down, you can see the zenith
      }
      this.camera.position.set(this.pos.x, this.pos.y + (this.seat.eye ?? 0.75), this.pos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }

    // ── Look ──────────────────────────────────────────────────────────────
    // A Tab turn eases you round, and the mouse can take over at any moment.
    if (this._turn) {
      if (intent.look.dx || intent.look.dy) this._turn = null;
      else {
        const k = 1 - Math.exp(-dt * 10);
        this.yaw += (this._turn.yaw - this.yaw) * k;
        this.pitch += (this._turn.pitch - this.pitch) * k;
        if (Math.abs(this._turn.yaw - this.yaw) < 0.002) this._turn = null;
      }
    }
    if (view.snapTurn) {
      this._snapAcc += intent.look.dx;
      while (this._snapAcc > SNAP * 0.6) { this.yaw -= SNAP; this._snapAcc -= SNAP * 0.6; }
      while (this._snapAcc < -SNAP * 0.6) { this.yaw += SNAP; this._snapAcc += SNAP * 0.6; }
    } else {
      this.yaw -= intent.look.dx;
    }
    this.pitch = clamp(this.pitch - intent.look.dy, -PITCH_MAX, PITCH_MAX);

    // ── Walk ──────────────────────────────────────────────────────────────
    if (intent.tap) this.target = this.groundPoint(new Vector2(intent.tap.x, intent.tap.y));

    let wx = 0;
    let wz = 0;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    if (intent.walk.x || intent.walk.y) {
      this.target = null; // steering by hand cancels a tap destination
      // Forward is −z rotated by yaw.
      wx = intent.walk.x * cos - intent.walk.y * sin;
      wz = -intent.walk.x * sin - intent.walk.y * cos;
    } else if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) this.target = null;
      else {
        wx = dx / d;
        wz = dz / d;
      }
    }
    if (this._wake > 0) wx = wz = 0;

    this.vel.x = damp(this.vel.x, wx * SPEED, ACCEL, dt);
    this.vel.y = damp(this.vel.y, wz * SPEED, ACCEL, dt);

    const before = { x: this.pos.x, z: this.pos.z };
    this.col.move(this.pos, this.vel.x * dt, this.vel.y * dt);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.walked += moved;
    // A tap destination that we've stopped making progress toward is unreachable; give up.
    if (this.target && moved < SPEED * dt * 0.1 && Math.hypot(this.vel.x, this.vel.y) > 0.5) this.target = null;

    // Down is a drift, not a fall: off the porch you settle, you don't drop.
    if (this.pos.y > this.pos.groundY) this.pos.y = Math.max(this.pos.groundY, this.pos.y - Math.max(2.5 * dt, (this.pos.y - this.pos.groundY) * 8 * dt));

    // ── Camera ────────────────────────────────────────────────────────────
    let eye = PLAYER.eye;
    if (view.headBob && motion && moved > 0) eye += Math.sin(this.walked * Math.PI * 1.25) * 0.035;

    let camX = this.pos.x;
    let camZ = this.pos.z;
    let pitch = this.pitch;
    if (this._wake > 0) {
      // Lying in bed, then sitting up and standing.
      this._wake = Math.max(0, this._wake - dt);
      const k = smoothstep(clamp(1 - this._wake / WAKE_SECONDS, 0, 1));
      const bed = SPOTS.bed;
      eye = 0.75 + (PLAYER.eye - 0.75) * k;
      camX = bed.x + (this.pos.x - bed.x) * k;
      camZ = bed.z + 0.2 + (this.pos.z - bed.z - 0.2) * k;
      pitch = 0.5 * (1 - k) + this.pitch * k;
    }

    this.camera.position.set(camX, this.pos.y + eye, camZ);
    this.camera.rotation.set(pitch, this.yaw, 0);
  }
}
