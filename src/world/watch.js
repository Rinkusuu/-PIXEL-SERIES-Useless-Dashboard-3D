/* ============================================================================
   watch.js — the dashboard on your wrist.

   Q lifts your arm and you glance at a wristwatch; Q again turns the page
   (time, weather, the station overhead); one more and the arm drops. The
   world never stops while you look. The face is a tiny pixel canvas drawn in
   the classic scene's own 3×5 font, so the watch is the same object in both
   worlds' language.

   When the ISS is genuinely visible after dark, the watch buzzes: the arm
   twitches into the bottom of your view with "LOOK UP" on it. It does not tell
   you anything else — that is the whole of what the Overhead panel promises.

   Reduced motion: no swing, no twitch. The arm fades in and out where it is.
   ========================================================================== */

import { CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace } from 'three';
import { VoxelGrid, grain, mesh } from './voxel.js';
import { pxText, textWidth } from '../ui/pixel.js';
import { bus } from '../core/bus.js';
import { clamp, rgbCss, smoothstep } from '../core/util.js';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * The pages, as lines of at most 8 characters (the face is 32 px wide).
 * Pure, so it can be tested. Also what the screen reader hears.
 */
export function watchPages(date, weather, iss) {
  const pages = [[`${pad(date.getHours())}:${pad(date.getMinutes())}`, `${DAYS[date.getDay()]} ${date.getDate()}`, MONTHS[date.getMonth()]]];
  pages.push(weather
    ? [`${Math.round(weather.tempC)}°`, (weather.label || weather.kind).split(' ')[0].slice(0, 8), weather.offline ? 'OFFLINE' : '']
    : ['--°', 'NO SKY', 'YET']);
  pages.push(!iss
    ? ['ISS', 'NO FIX', '']
    : iss.up
      ? ['ISS', `${Math.round(iss.elevation)}° ${iss.compass}`, iss.visible ? 'LOOK UP' : 'IN SHADE']
      : ['ISS', 'BELOW', `${iss.compass}`]);
  return pages;
}

const SPOKEN = ['time', 'weather', 'the space station'];

export class Watch {
  constructor(camera, hud) {
    this.hud = hud;
    this.page = 0;
    this.up = false;
    this.t = 0; // 0 lowered → 1 raised
    this.buzz = 0; // seconds of buzzing left
    this.weather = null;
    this.iss = null;
    this.night = false;

    // The arm, in camera space, built from 2.5 cm voxels: sleeve, wrist, fist, strap, case.
    const g = new VoxelGrid([-0.06, -0.04, -0.1], [0.06, 0.06, 0.32], 0.025);
    g.fillBox(-0.04, -0.025, 0.1, 0.04, 0.03, 0.32, grain('#3a4a6a', 0.5)); // sleeve
    g.fillBox(-0.035, -0.02, -0.0, 0.035, 0.025, 0.1, grain('#e0b896', 0.2)); // wrist
    g.fillBox(-0.045, -0.025, -0.1, 0.045, 0.03, 0.0, grain('#e0b896', 0.2)); // fist
    g.fillBox(-0.04, -0.025, 0.025, 0.04, 0.03, 0.075, grain('#2a2a30', 0.2)); // strap
    g.fillBox(-0.05, 0.03, -0.0, 0.05, 0.05, 0.1, grain('#b8a070', 0.2)); // case
    this.material = new MeshLambertMaterial({ vertexColors: true, transparent: true });
    const arm = new Mesh(mesh(g), this.material);

    // The face: a 32×24 pixel canvas on top of the case.
    this.canvas = document.createElement('canvas');
    this.canvas.width = 32;
    this.canvas.height = 24;
    this.g2d = this.canvas.getContext('2d');
    this.tex = new CanvasTexture(this.canvas);
    this.tex.magFilter = this.tex.minFilter = NearestFilter;
    this.tex.colorSpace = SRGBColorSpace;
    this.faceMat = new MeshBasicMaterial({ map: this.tex, transparent: true });
    const face = new Mesh(new PlaneGeometry(0.072, 0.054), this.faceMat);
    face.rotation.order = 'YXZ';
    face.rotation.x = -Math.PI / 2;
    face.rotation.y = 0.75 - Math.PI / 2; // the face reads across the wrist, and the arm's roll is undone
    face.position.set(0, 0.0615, 0.05); // just above the case top, which the 2.5 cm grid snaps to 6 cm

    this.arm = new Group();
    this.arm.add(arm, face);
    // Face toward the eye first (x), then roll the forearm out to the lower right (z).
    this.arm.rotation.order = 'ZYX';
    this.arm.visible = false;
    camera.add(this.arm);

    bus.on('weather', (w) => (this.weather = w));
    bus.on('iss', (iss) => {
      const was = this.iss?.visible && this.night;
      this.iss = iss;
      // Buzz once when it becomes visible after dark; never on a guess older than two minutes.
      if (iss.visible && this.night && !was && (!iss.estimated || iss.ageSec < 120)) {
        this.buzz = 2;
        hud.announce(`Your watch buzzes. The space station is ${Math.round(iss.elevation)} degrees above the ${iss.compass}.`);
      }
    });
    bus.on('phase', (pal) => (this.night = pal.night));
  }

  /** Q: raise, then page through, then lower. */
  press() {
    if (!this.up) {
      this.up = true;
      this.page = 0;
    } else if (this.page < 2) this.page++;
    else this.up = false;
    this._announce();
  }

  lower() {
    if (this.up) {
      this.up = false;
      this._announce();
    }
  }

  _announce() {
    if (!this.up) return this.hud.announce('You lower your arm.');
    const lines = watchPages(new Date(), this.weather, this.iss)[this.page].filter(Boolean);
    this.hud.announce(`Your watch, ${SPOKEN[this.page]}: ${lines.join(', ')}.`);
  }

  _draw(pal) {
    const g = this.g2d;
    g.fillStyle = rgbCss(pal.night ? [10, 14, 24] : [18, 22, 30]);
    g.fillRect(0, 0, 32, 24);
    const page = this.buzz > 0 ? ['', 'LOOK UP', ''] : watchPages(new Date(), this.weather, this.iss)[this.page];
    const ink = rgbCss(pal.glow);
    page.forEach((line, i) => pxText(g, Math.floor((32 - textWidth(line)) / 2), 3 + i * 7, line, i === 0 ? ink : rgbCss(pal.inkSoft)));
    // A page marker, three dots along the bottom.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === this.page ? ink : 'rgba(255,255,255,0.18)';
      g.fillRect(12 + i * 3, 22, 2, 1);
    }
    this.tex.needsUpdate = true;
  }

  update(env, dt) {
    const target = this.up ? 1 : this.buzz > 0 ? 0.45 : 0;
    this.buzz = Math.max(0, this.buzz - dt);
    this.t += clamp(target - this.t, -dt * 3.5, dt * 3.5);
    const k = smoothstep(clamp(this.t, 0, 1));
    this.arm.visible = this.t > 0.01;
    if (!this.arm.visible) return;

    // Reduced motion: the arm stays where it would end up, and only fades.
    const pose = env.motion ? k : 1;
    const shake = env.motion && this.buzz > 0 ? Math.sin(env.t * 60) * 0.004 : 0;
    this.arm.position.set(0.1 - 0.1 * pose + shake, -0.36 + 0.34 * pose, -0.24);
    this.arm.rotation.set(Math.PI / 2 - 0.25, 0, 0.75 + 0.25 * (1 - pose));
    const opacity = env.motion ? 1 : k;
    this.material.opacity = this.faceMat.opacity = opacity;
    this._draw(env.pal);
  }
}
