/* ============================================================================
   photo.js — the postcard, from inside the world.

   P (or the Postcard button, or ⌘K) lifts the camera off your shoulders: it
   floats where you steer it, within ten metres of where you stand, never
   under the ground. The HUD and the page chrome step aside. Enter takes the
   picture — the frame as it is, bloom and fog and all — and frames it as a
   postcard with the classic one's caption bar and border. Esc puts the
   camera back.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { env } from '../core/env.js';
import { savePostcard } from '../ui/postcard.js';
import { clamp, pad2 } from '../core/util.js';

const RADIUS = 10;
const SPEED = 3;

export class Photo {
  constructor(player, col, canvas) {
    this.player = player;
    this.col = col;
    this.canvas = canvas;
    this.active = false;
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this._shoot = false;

    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Enter') this._shoot = true;
      if (e.key === 'Escape') this.exit();
    });
  }

  enter() {
    if (this.active || this.player.waking) return;
    const c = this.player.camera.position;
    Object.assign(this.cam, { x: c.x, y: c.y, z: c.z, yaw: this.player.yaw, pitch: this.player.pitch });
    this.active = true;
    document.documentElement.dataset.photo = 'on';
    bus.emit('toast', { icon: '📷', text: 'Photo mode. WASD floats, R/F up and down, Enter takes it, Esc leaves.', ms: 6000 });
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    delete document.documentElement.dataset.photo;
  }

  /** Steer the free camera; returns true while photo mode owns the camera. */
  update(intent, keys, dt) {
    if (!this.active) return false;
    const c = this.cam;
    c.yaw -= intent.look.dx;
    c.pitch = clamp(c.pitch - intent.look.dy, -1.5, 1.5);

    const sin = Math.sin(c.yaw);
    const cos = Math.cos(c.yaw);
    const up = (keys.has('KeyR') ? 1 : 0) - (keys.has('KeyF') ? 1 : 0);
    c.x += (intent.walk.x * cos - intent.walk.y * sin) * SPEED * dt;
    c.z += (-intent.walk.x * sin - intent.walk.y * cos) * SPEED * dt;
    c.y += up * SPEED * dt;

    // Tethered: within RADIUS of where you stand, and never inside the ground.
    const p = this.player.pos;
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.hypot(dx, dz, c.y - p.y - 1.6);
    if (d > RADIUS) {
      const k = RADIUS / d;
      c.x = p.x + dx * k;
      c.z = p.z + dz * k;
      c.y = p.y + 1.6 + (c.y - p.y - 1.6) * k;
    }
    c.y = Math.max(c.y, this.col.groundAt(c.x, c.z, c.y).y + 0.3);

    const cam = this.player.camera;
    cam.position.set(c.x, c.y, c.z);
    cam.rotation.set(c.pitch, c.yaw, 0);
    return true;
  }

  /** Called after the frame is drawn, so the canvas holds exactly what you saw. */
  afterRender() {
    if (!this._shoot) return;
    this._shoot = false;
    const s = env.state;
    savePostcard(this.canvas, null, {
      caption: s.pal.caption,
      place: env.place,
      season: s.season.name,
      weather: s.pal.weather,
      time: `${pad2(Math.floor(s.hour))}:00`,
    }, 1);
  }
}
