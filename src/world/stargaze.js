/* ============================================================================
   stargaze.js — your constellations in the 3D sky, drawing new ones from the
   hill, and the shooting stars.

   Every constellation in core/constellations.js is drawn as faint lines
   between the same star indices the classic sky uses, with its name hung under
   it in the classic 3×5 font. Lying on the flat rock after dark, the centre
   dot picks a star and E joins it to the last; Enter keeps the line, Esc lets
   it go.

   A shooting star crosses the sky every 20–40 seconds after dark. Look at it
   while it falls and press E: you made a wish. Nothing happens.
   ========================================================================== */

import {
  BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, LineSegments, NearestFilter,
  Sprite, SpriteMaterial, Vector3,
} from 'three';
import { book } from '../core/constellations.js';
import { play } from '../core/play.js';
import { bus } from '../core/bus.js';
import { pxText, textWidth } from '../ui/pixel.js';
import { LAYER_GLOW } from './renderer.js';
import { aimPick } from './aim.js';
import { skyDir } from './sky3d.js';

const R = 1380; // just inside the star shell
const MAX_SEGMENTS = 400;

export class Stargaze {
  constructor(sky) {
    this.sky = sky;
    this.dirs = sky.starDirs;

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_SEGMENTS * 6), 3));
    this.lineMat = new LineBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.lines = new LineSegments(geo, this.lineMat);
    this.lines.frustumCulled = false;
    this.lines.layers.enable(LAYER_GLOW);
    sky.scene.add(this.lines);

    this.labels = [];
    this._key = '';

    // The shooting star: a short bright streak, head and tail.
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    this.streak = new LineSegments(sg, new LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    this.streak.frustumCulled = false;
    this.streak.layers.enable(LAYER_GLOW);
    this.streak.visible = false;
    sky.scene.add(this.streak);
    this.shooting = null;
    this._wait = 20 + Math.random() * 20;
    this._fwd = new Vector3();

    bus.on('play', ({ mode }) => mode !== 'stars' && book.drawing.length && book.discard());
    addEventListener('keydown', (e) => {
      if (play.mode !== 'stars' || e.target?.closest?.('input, textarea')) return;
      if (e.key === 'Enter') book.commit();
    });
  }

  /* ── Constellations ─────────────────────────────────────────────────── */

  _rebuild() {
    const pos = this.lines.geometry.attributes.position.array;
    let n = 0;
    const seg = (a, b) => {
      if (n >= MAX_SEGMENTS) return;
      this.dirs[a].clone().multiplyScalar(R).toArray(pos, n * 6);
      this.dirs[b].clone().multiplyScalar(R).toArray(pos, n * 6 + 3);
      n++;
    };
    for (const c of book.saved) for (let i = 1; i < c.pts.length; i++) seg(c.pts[i - 1], c.pts[i]);
    for (let i = 1; i < book.drawing.length; i++) seg(book.drawing[i - 1], book.drawing[i]);
    this.lines.geometry.setDrawRange(0, n * 2);
    this.lines.geometry.attributes.position.needsUpdate = true;

    for (const l of this.labels) {
      this.sky.scene.remove(l);
      l.material.map.dispose();
      l.material.dispose();
    }
    this.labels = book.saved.filter((c) => c.name).map((c) => this._label(c));
  }

  /** The name, in the 3×5 font, hung just under the constellation's middle. */
  _label(c) {
    const text = c.name.toUpperCase();
    const cv = document.createElement('canvas');
    cv.width = textWidth(text) + 2;
    cv.height = 7;
    pxText(cv.getContext('2d'), 1, 1, text, '#dfe6ff');
    const tex = new CanvasTexture(cv);
    tex.magFilter = tex.minFilter = NearestFilter;
    const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const mid = new Vector3();
    for (const i of c.pts) mid.add(this.dirs[i]);
    mid.normalize();
    const below = skyDir(Math.asin(mid.y) * (180 / Math.PI) - 4, (Math.atan2(mid.x, -mid.z) * 180) / Math.PI);
    s.position.copy(below.multiplyScalar(R));
    const h = 22; // world units at 1.4 km: about a degree tall
    s.scale.set((h * cv.width) / cv.height, h, 1);
    s.layers.enable(LAYER_GLOW);
    this.sky.scene.add(s);
    return s;
  }

  /** The star under the centre dot, if the stars are out and it's above the horizon. */
  pickStar(camera, pal) {
    if (pal.stars < 0.3) return -1;
    camera.getWorldDirection(this._fwd);
    return aimPick(this._fwd, this.dirs, 2.5, (i) => this.dirs[i].y > 0.02);
  }

  /* ── Shooting stars ─────────────────────────────────────────────────── */

  /** Is the centre dot on a falling star you haven't wished on yet? */
  wishable(camera) {
    const s = this.shooting;
    if (!s || s.wished) return false;
    camera.getWorldDirection(this._fwd);
    return aimPick(this._fwd, [s.head], 6) === 0;
  }

  wish() {
    if (!this.shooting || this.shooting.wished) return;
    this.shooting.wished = true;
    book.wish();
  }

  update(env, dt) {
    const key = JSON.stringify(book.saved) + book.drawing.join(',');
    if (key !== this._key) {
      this._key = key;
      this._rebuild();
    }
    this.lineMat.opacity = 0.35 * Math.min(1, env.pal.stars * 1.4);
    for (const l of this.labels) l.material.opacity = Math.min(1, env.pal.stars * 1.4);

    // A shooting star now and then, only after dark, never under reduced motion
    // (it is exactly the kind of thing that streaks across the screen).
    if (!this.shooting) {
      if (env.pal.stars < 0.5 || !env.motion) return;
      this._wait -= dt;
      if (this._wait > 0) return;
      this._wait = 20 + Math.random() * 20;
      const az = Math.random() * 360;
      const alt = 35 + Math.random() * 35;
      this.shooting = {
        t: 0,
        from: skyDir(alt, az),
        to: skyDir(alt - 12 - Math.random() * 10, az + (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 15)),
        head: new Vector3(),
        wished: false,
      };
      this.streak.visible = true;
    }
    const s = this.shooting;
    s.t += dt / 1.5;
    if (s.t >= 1) {
      this.shooting = null;
      this.streak.visible = false;
      return;
    }
    s.head.lerpVectors(s.from, s.to, s.t).normalize();
    const tail = new Vector3().lerpVectors(s.from, s.to, Math.max(0, s.t - 0.18)).normalize();
    const a = this.streak.geometry.attributes.position;
    a.setXYZ(0, ...s.head.clone().multiplyScalar(R).toArray());
    a.setXYZ(1, ...tail.multiplyScalar(R).toArray());
    a.needsUpdate = true;
    this.streak.material.opacity = Math.sin(s.t * Math.PI);
  }
}
