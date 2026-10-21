/* ============================================================================
   fishing3d.js — the rod on the dock, picked up.

   E on the rod takes it in hand. Hold E to draw it back (the longer, the
   further), let go to cast: the float flies out and lands on the lake. Then
   nothing happens, for as long as the Poisson process in core/fishing.js
   decides — the same process, at the same rate, as the classic lake. When the
   float goes under you have a moment to press E. Miss it and it was never
   yours. Walk away from the dock, or press Esc, and the rod goes back.
   ========================================================================== */

import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three';
import { BITE_WINDOW, CAST_TIME, bites, landCatch, lostCatch, rollCatch } from '../core/fishing.js';
import { bus } from '../core/bus.js';
import { play } from '../core/play.js';
import { DOCK, WATER_Y, isWater, lakeE } from './layout.js';
import { VoxelGrid, color, grain, voxelMesh } from './voxel.js';
import { castPoint } from './aim.js';

const DRAW_SECONDS = 1.2; // hold this long for the longest cast
const LEASH = 14; // metres from the end of the dock before you put the rod down

export class Fishing {
  constructor(scene, rodOnDock, player, ripples) {
    this.scene = scene;
    this.rodOnDock = rodOnDock;
    this.player = player;
    this.ripples = ripples;
    this.state = 'idle'; // idle | flying | waiting | biting
    this.charge = 0;
    this.t = 0;

    // The rod in your hand: hung off the camera, like the watch.
    // 1.25 cm voxels: this close to the eye, a 2.5 cm rod reads as a plank.
    const g = new VoxelGrid([-0.03, -0.03, -1.4], [0.03, 0.03, 0.15], 0.0125);
    g.fill([-0.03, -0.03, -1.4], [0.03, 0.03, 0.15], (x, y, z) => Math.hypot(x, y) < 0.011 + Math.max(0, z) * 0.04, grain('#7a5030', 0.3));
    g.fillBox(-0.03, -0.05, -0.05, 0.03, 0.0, 0.05, color('#3a3a44')); // the reel
    this.inHand = voxelMesh(g);
    this.inHand.castShadow = false;
    this.inHand.visible = false;
    player.camera.add(this.inHand);

    const fg = new VoxelGrid([-0.06, -0.04, -0.06], [0.06, 0.1, 0.06], 0.025);
    fg.fill([-0.06, -0.04, -0.06], [0.06, 0.02, 0.06], (x, y, z) => Math.hypot(x, y, z) < 0.055, color('#f4efe4'));
    fg.fill([-0.06, 0.02, -0.06], [0.06, 0.1, 0.06], (x, y, z) => Math.hypot(x, y - 0.02, z) < 0.05, color('#d0503c'));
    this.float = voxelMesh(fg);
    this.float.visible = false;
    scene.add(this.float);

    this.line = new Line(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(6), 3)), new LineBasicMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.6 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    this.from = new Vector3();
    this.to = new Vector3();
    this._tip = new Vector3();

    bus.on('play', ({ mode }) => mode !== 'fish' && this._putDown());
    addEventListener('keydown', (e) => e.key === 'Escape' && play.mode === 'fish' && play.set(null));
  }

  get active() {
    return play.mode === 'fish';
  }

  pickUp() {
    play.set('fish');
    this.rodOnDock.visible = false;
    this.inHand.visible = true;
    this.state = 'idle';
    this.charge = 0;
    bus.emit('toast', { icon: '🎣', text: 'Hold E to draw the rod back, let go to cast. Then wait.', ms: 5000 });
  }

  _putDown() {
    this.rodOnDock.visible = true;
    this.inHand.visible = false;
    this.float.visible = this.line.visible = false;
    this.state = 'idle';
  }

  /** What the HUD should say while fishing (or null). */
  tip() {
    if (this.state === 'biting') return 'Strike!';
    if (this.state === 'waiting') return 'Reel in';
    return null;
  }

  update(intent, env, dt) {
    if (!this.active) return;
    const p = this.player.pos;

    // Wandered off the dock with it? It goes back on its post.
    if (Math.hypot(p.x - DOCK.x, p.z - (DOCK.z1 + 4)) > LEASH + 12) return play.set(null);

    // The rod sits in the right hand and bends back while you draw it.
    this.inHand.position.set(0.28, -0.32, -0.25);
    this.inHand.rotation.set(0.55 + this.charge * 0.9, -0.15, 0);

    if (this.state === 'idle') {
      if (intent.useHeld) this.charge = Math.min(1, this.charge + dt / DRAW_SECONDS);
      if (intent.useReleased && this.charge > 0.06) this._cast(env);
      else if (intent.useReleased) this.charge = 0;
      return;
    }

    this.t += dt;
    this.inHand.updateWorldMatrix(true, false);
    this._tip.set(0, 0, -1.4).applyMatrix4(this.inHand.matrixWorld);

    if (this.state === 'flying') {
      const k = Math.min(1, this.t / CAST_TIME);
      this.float.position.lerpVectors(this.from, this.to, k);
      this.float.position.y += Math.sin(k * Math.PI) * 1.6;
      if (k >= 1) {
        this.state = 'waiting';
        this.t = 0;
        this.ripples.spawn(this.to.x, this.to.z, 0.4);
        bus.emit('splash', 0.35);
      }
    } else if (this.state === 'waiting') {
      this.float.position.y = WATER_Y + 0.02 + Math.sin(env.t * 2.1) * 0.01 * env.motion;
      if (intent.use) return this._reset(); // reeled in, empty
      if (bites(dt)) {
        this.state = 'biting';
        this.t = 0;
        bus.emit('fish:bite');
        bus.emit('sfx', 'bite');
        bus.emit('splash', 0.2);
        this.ripples.spawn(this.to.x, this.to.z, 0.7);
      }
    } else if (this.state === 'biting') {
      // The float goes under, hard. (Reduced motion: it simply sits lower.)
      const dip = env.motion ? Math.abs(Math.sin(this.t * 22)) * 0.08 : 0.06;
      this.float.position.y = WATER_Y - dip;
      if (intent.use) {
        bus.emit('splash', 1);
        this.ripples.spawn(this.to.x, this.to.z, 1);
        landCatch(rollCatch(env.pal.night));
        return this._reset();
      }
      if (this.t > BITE_WINDOW) {
        lostCatch();
        return this._reset();
      }
    }

    // The line, from the rod tip to the float.
    const a = this.line.geometry.attributes.position;
    a.setXYZ(0, this._tip.x, this._tip.y, this._tip.z);
    a.setXYZ(1, this.float.position.x, this.float.position.y + 0.06, this.float.position.z);
    a.needsUpdate = true;
  }

  _cast() {
    const p = this.player.pos;
    const target = castPoint(p.x, p.z, this.player.yaw, this.charge);
    this.charge = 0;
    if (!isWater(target.x, target.z) || lakeE(target.x, target.z) > 1.05) {
      bus.emit('toast', { icon: '🎣', text: "That's not the lake. Face the water.", ms: 2500 });
      return;
    }
    this.inHand.updateWorldMatrix(true, false);
    this.from.set(0, 0, -1.4).applyMatrix4(this.inHand.matrixWorld);
    this.to.set(target.x, WATER_Y + 0.02, target.z);
    this.float.visible = this.line.visible = true;
    this.state = 'flying';
    this.t = 0;
    bus.emit('sfx', 'click');
  }

  _reset() {
    this.state = 'idle';
    this.float.visible = this.line.visible = false;
  }
}
