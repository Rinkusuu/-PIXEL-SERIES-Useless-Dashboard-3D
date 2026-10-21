/* ============================================================================
   postcard.js — export the world as a PNG. "A postcard from a place that
   doesn't exist."

   The scene is already two canvases. Compositing them is the entire feature:
   draw the scene, screen-blend the (blurred) glow buffer over it, add a frame
   and a caption, and hand the user a download.

   THE BLUR IS THE ONLY HARD PART. On screen, the bloom is done by CSS
   (`filter: blur()` on the glow canvas). CSS filters are a compositor effect —
   they exist in the browser's render tree, not in the canvas bitmap — so if you
   just drawImage() the glow buffer you get the raw, unblurred emissive pixels
   and the postcard looks nothing like the screen. We have to re-do the blur
   ourselves, in canvas, at export time. `ctx.filter` does it in one line.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { unlock } from '../core/achievements.js';
import { pad2 } from '../core/util.js';

const SCALE = 3; // the export is 3× the scene buffer — chunky, and poster-sized

/**
 * @param {HTMLCanvasElement} scene
 * @param {HTMLCanvasElement} glow
 * @param {object} info  { caption, place, season, weather, hour }
 */
export function exportPostcard(scene, glow, info = {}, scale = SCALE) {
  // `scale` sizes the image (the 3D world is already full resolution: 1×).
  // `u` sizes the frame and lettering from the output's height, so a postcard
  // from either world wears the same border.
  const W = scene.width;
  const H = scene.height;

  const out = document.createElement('canvas');
  out.width = W * scale;
  out.height = H * scale;
  const u = out.height / 270;
  const g = out.getContext('2d');

  // Nearest-neighbour, or the whole point of the art style is lost in the upscale.
  g.imageSmoothingEnabled = false;

  // 1 — the scene.
  g.drawImage(scene, 0, 0, out.width, out.height);

  // 2 — the bloom. Re-created here because the on-screen version is a CSS
  // compositor filter and does not exist in the bitmap we're copying.
  // (The 3D world has its bloom in the frame already, and passes no glow.)
  if (glow) {
  g.save();
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.85;
  g.filter = `blur(${14 * (u / 3)}px) saturate(1.35)`;
  g.imageSmoothingEnabled = true; // the bloom IS smooth; only the scene is hard
  g.drawImage(glow, 0, 0, out.width, out.height);
  g.restore();
  }

  // 3 — vignette, matching the one on screen.
  const vg = g.createRadialGradient(
    out.width / 2, out.height * 0.42, 0,
    out.width / 2, out.height * 0.42, out.width * 0.75
  );
  vg.addColorStop(0.5, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,4,14,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, out.width, out.height);

  // 4 — the caption bar. A postcard has writing on it.
  drawCaption(g, out.width, out.height, info, u);

  // 5 — a chunky pixel border, so it reads as an object rather than a screenshot.
  const b = 4 * u;
  g.strokeStyle = '#f4f1ff';
  g.lineWidth = b;
  g.strokeRect(b / 2, b / 2, out.width - b, out.height - b);
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 2 * u;
  g.strokeRect(b * 1.4, b * 1.4, out.width - b * 2.8, out.height - b * 2.8);

  return out;
}

function drawCaption(g, W, H, info, u = SCALE) {
  const pad = 14 * u;
  const barH = 26 * u;
  const y = H - barH - pad;

  g.fillStyle = 'rgba(10,12,28,0.72)';
  g.fillRect(pad, y, W - pad * 2, barH);

  g.fillStyle = '#f4f1ff';
  g.textBaseline = 'middle';

  const left = info.caption || 'a place that does not exist';
  // The metadata, right-aligned: where, when, what the weather was doing.
  const bits = [info.place, info.season, info.weather, info.time].filter(Boolean);
  const right = bits.join('  ·  ');

  // A long caption and a long place name used to print over each other. Shrink
  // the lettering until both fit side by side.
  const room = W - pad * 2 - 16 * u - 12 * u;
  let size = 9 * u;
  do {
    g.font = `${size}px monospace`;
    size -= 0.5;
  } while (size > 5 * u && g.measureText(left).width + g.measureText(right).width > room);

  g.fillText(left, pad + 8 * u, y + barH / 2);
  g.textAlign = 'right';
  g.globalAlpha = 0.7;
  g.fillText(right, W - pad - 8 * u, y + barH / 2);
  g.globalAlpha = 1;
  g.textAlign = 'left';
}

/** Compose, then hand it to the browser as a download. */
export function savePostcard(scene, glow, info, scale) {
  const canvas = exportPostcard(scene, glow, info, scale);

  canvas.toBlob((blob) => {
    if (!blob) {
      bus.emit('toast', { icon: '⚠️', text: "The postcard didn't develop." });
      return;
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postcard-${stamp}.png`;
    a.click();

    // The object URL pins the blob in memory until it's revoked. A dashboard
    // left open for a day, taking postcards, would leak megabytes.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    bus.emit('toast', { icon: '📮', text: 'Postcard saved. Send it to nobody.' });
    unlock('postcard'); // the achievement existed, and nothing ever unlocked it
    bus.emit('sfx', 'fanfare');
  }, 'image/png');
}
