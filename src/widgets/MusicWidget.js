/* ============================================================================
   MusicWidget — a retro player with a live visualiser.

   The stations are GENERATED, not streamed (see core/audio.js): four seeded
   lo-fi compositions rendered by WebAudio, so "Pixel Grove" is three minutes of
   music that never repeats a bar and weighs zero bytes. You can also drop in a
   local file or paste a stream URL, and everything below — the equaliser, the
   waveform, the vinyl, the notes — is driven off a shared AnalyserNode and does
   not care which is playing.

   Visualiser notes:
     · Bars are drawn from the FFT with a per-bar FALL rate. Without it, bars
       snap back to zero and the whole thing strobes. With it, they drop like
       they have weight, which is the entire aesthetic of a good equaliser.
     · Bars are quantised to a pixel grid — an "analogue" smooth bar in a pixel
       UI is instantly wrong.
     · When the analyser is silent (paused, or sound off) the bars settle into a
       slow idle sine instead of flatlining. A dead visualiser looks broken; a
       breathing one looks like it's waiting.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el, clamp, lerp, pad2, TAU } from '../core/util.js';
import { button } from '../ui/feedback.js';
import { audio } from '../core/audio.js';
import { unlock } from '../core/achievements.js';

const BARS = 28;
const NOTE_GLYPHS = ['♪', '♫', '♬', '♩'];

export class MusicWidget extends Widget {
  constructor() {
    // float:false — you cannot reliably grab a scrubber that is bobbing.
    super({ title: 'Ambient Loop FM', span: 'span-2', icon: '🎵', float: false, className: 'w-music' });

    this.levels = new Float32Array(BARS);
    this.peaks = new Float32Array(BARS);
    this.notes = [];
    this._noteTimer = 0;
    this._vinyl = 0;
  }

  body() {
    // ── Visualiser canvas ───────────────────────────────────────────────────
    this.cv = el('canvas.viz', { 'aria-hidden': 'true' });
    this.vg = this.cv.getContext('2d');
    this.vg.imageSmoothingEnabled = false;

    // ── Now playing ─────────────────────────────────────────────────────────
    this.vinyl = el('canvas.vinyl', { width: 56, height: 56, 'aria-hidden': 'true' });
    this.vinylG = this.vinyl.getContext('2d');
    this.vinylG.imageSmoothingEnabled = false;

    this.trackName = el('div.mus__title', { text: '—' });
    this.trackArtist = el('div.mus__artist', { text: '—' });

    // ── Transport ───────────────────────────────────────────────────────────
    this.btnPlay = button({
      icon: '▶',
      title: 'Play',
      primary: true,
      sfx: 'confirm',
      iconOnly: true,
      onClick: () => {
        audio.toggle();
        if (audio.playing) unlock('music');
      },
    });

    const transport = el('div.mus__transport', {}, [
      button({ icon: '⏮', title: 'Previous', iconOnly: true, sfx: 'page', onClick: () => audio.prev() }),
      this.btnPlay,
      button({ icon: '⏭', title: 'Next', iconOnly: true, sfx: 'page', onClick: () => audio.next() }),
    ]);

    // ── Progress ────────────────────────────────────────────────────────────
    this.seek = el('input.mus__seek', {
      type: 'range', min: '0', max: '1000', value: '0',
      'aria-label': 'Seek',
      oninput: (e) => audio.seek(Number(e.target.value) / 1000),
    });
    this.tNow = el('span.mus__t', { text: '0:00' });
    this.tEnd = el('span.mus__t', { text: '0:00' });

    // ── Volume ──────────────────────────────────────────────────────────────
    this.vol = el('input.mus__vol', {
      type: 'range', min: '0', max: '100', value: String(audio.volume * 100),
      'aria-label': 'Volume',
      oninput: (e) => audio.setVolume(Number(e.target.value) / 100),
    });

    // ── Load your own ───────────────────────────────────────────────────────
    this.file = el('input', {
      type: 'file', accept: 'audio/*', hidden: true, id: 'musFile',
      onchange: (e) => this._loadFile(e.target.files?.[0]),
    });

    const loadBtn = button({
      label: 'Load',
      title: 'Play a local audio file',
      sfx: 'click',
      onClick: () => this.file.click(),
    });

    const urlBtn = button({
      label: 'URL',
      title: 'Play an audio stream by URL',
      sfx: 'click',
      onClick: () => this._loadUrl(),
    });

    this.addTool(loadBtn);
    this.addTool(urlBtn);

    this.listen('music', () => this._sync());
    this._sync();

    return el('div.mus', {}, [
      this.cv,
      el('div.mus__now', {}, [
        this.vinyl,
        el('div.mus__meta', {}, [this.trackName, this.trackArtist]),
        transport,
      ]),
      el('div.mus__bar', {}, [this.tNow, this.seek, this.tEnd]),
      el('div.mus__foot', {}, [
        el('span.mus__vollabel', { text: '🔊', 'aria-hidden': 'true' }),
        this.vol,
        this.file,
      ]),
    ]);
  }

  mounted() {
    // Size the visualiser buffer to its CSS box, at 1:1 — it's pixel art, so it
    // must NOT be rendered at devicePixelRatio.
    const fit = () => {
      const r = this.cv.getBoundingClientRect();
      if (r.width < 2) return;
      this.cv.width = Math.round(r.width / 2); // half-res: chunkier, cheaper
      this.cv.height = Math.round(r.height / 2);
      this.vg.imageSmoothingEnabled = false;
    };
    new ResizeObserver(fit).observe(this.cv);
    fit();
  }

  _loadFile(f) {
    if (!f) return;
    audio.addUserTrack({
      id: `file:${f.name}`,
      title: f.name.replace(/\.[^.]+$/, ''),
      artist: 'From your machine',
      src: URL.createObjectURL(f),
      duration: 0,
    });
    bus.emit('toast', { icon: '💿', text: `Loaded ${f.name}` });
    unlock('music');
  }

  _loadUrl() {
    const url = prompt('Paste an audio URL (mp3, ogg, or a stream):');
    if (!url) return;
    let clean;
    try {
      clean = new URL(url).href; // reject anything that isn't a real URL
    } catch {
      bus.emit('toast', { icon: '⚠️', text: "That doesn't look like a URL." });
      return;
    }
    audio.addUserTrack({
      id: `url:${clean}`,
      title: clean.split('/').pop()?.slice(0, 28) || 'Stream',
      artist: 'From the internet',
      src: clean,
      duration: 0,
    });
    unlock('music');
  }

  /** Pull transport state out of the engine and into the DOM. */
  _sync() {
    const s = audio.status();
    this.trackName.textContent = s.track?.title ?? '—';
    this.trackArtist.textContent = s.track?.artist ?? '—';
    this.btnPlay.querySelector('.btn__ico').textContent = s.playing ? '⏸' : '▶';
    this.btnPlay.title = s.playing ? 'Pause' : 'Play';
    this.root.classList.toggle('is-playing', s.playing);
  }

  tick({ dt, t }) {
    const s = audio.status();

    // ── Progress (DOM writes only when the displayed value actually changes) ──
    if (s.duration > 0) {
      const f = clamp(s.position / s.duration, 0, 1);
      // Don't fight the user while they're dragging the scrubber.
      if (document.activeElement !== this.seek) {
        this.seek.value = String(Math.round(f * 1000));
      }
      const now = fmt(s.position);
      const end = fmt(s.duration);
      if (this.tNow.textContent !== now) this.tNow.textContent = now;
      if (this.tEnd.textContent !== end) this.tEnd.textContent = end;
    }

    this._levels(dt, t, s.playing);
    this._drawViz(t, s.playing);
    this._drawVinyl(dt, s.playing);
    this._floatNotes(dt, s.playing);
  }

  /** Feed the bar heights from the FFT, with gravity. */
  _levels(dt, t, playing) {
    const spec = audio.spectrum();

    for (let i = 0; i < BARS; i++) {
      let target;

      if (spec && playing) {
        // The FFT's low bins hold nearly all the energy, so a linear mapping
        // gives you three tall bars and 25 dead ones. Sampling the bins on a
        // curve spreads the spectrum across the bar field the way a real
        // (logarithmic) equaliser does.
        const idx = Math.floor(Math.pow(i / BARS, 1.6) * spec.length * 0.75);
        target = (spec[idx] / 255) ** 1.1;
        // Tilt the response up at the top end — otherwise the right half of the
        // display is permanently dead, because music has no energy up there.
        target *= 1 + (i / BARS) * 0.9;
      } else {
        // Idle: a slow, low wave. It looks like it's breathing, not broken.
        target = 0.06 + 0.05 * Math.sin(t * 1.4 + i * 0.35);
      }

      target = clamp(target, 0, 1);

      // Attack fast, release slow. This asymmetry IS the equaliser look.
      const level = this.levels[i];
      this.levels[i] = target > level
        ? lerp(level, target, 1 - Math.exp(-26 * dt))
        : lerp(level, target, 1 - Math.exp(-7 * dt));

      // Peak caps: hold, then fall under gravity.
      this.peaks[i] = Math.max(this.peaks[i] - dt * (playing ? 0.55 : 0.3), this.levels[i]);
    }
  }

  _drawViz(t, playing) {
    const g = this.vg;
    const W = this.cv.width;
    const H = this.cv.height;
    if (W < 4) return;

    g.clearRect(0, 0, W, H);

    const css = getComputedStyle(this.root);
    const glow = css.getPropertyValue('--amb-glow').trim() || '#ffd479';
    const accent = css.getPropertyValue('--amb-accent').trim() || '#7fd6c2';

    const gap = 1;
    const bw = Math.max(1, Math.floor((W - gap * (BARS - 1)) / BARS));
    const cell = 2; // bars are built from 2px blocks — a pixel-art meter

    for (let i = 0; i < BARS; i++) {
      const x = i * (bw + gap);
      const h = Math.max(cell, Math.round((this.levels[i] * H * 0.82) / cell) * cell);

      // Vertical gradient across the bar, done as discrete blocks.
      for (let y = 0; y < h; y += cell) {
        const f = y / (H * 0.82);
        g.fillStyle = f > 0.66 ? '#ff8fa3' : f > 0.33 ? glow : accent;
        g.globalAlpha = 0.55 + f * 0.45;
        g.fillRect(x, H - y - cell, bw, cell);
      }
      g.globalAlpha = 1;

      // Peak cap — the little floating tick. Nothing says "equaliser" faster.
      const py = Math.round((H - this.peaks[i] * H * 0.82) / cell) * cell;
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.75;
      g.fillRect(x, clamp(py - cell, 0, H - cell), bw, 1);
      g.globalAlpha = 1;
    }

    // Waveform: a single line across the middle, riding the same levels. It ties
    // the bar field together and gives the eye something continuous to follow.
    g.globalAlpha = 0.5;
    g.fillStyle = accent;
    for (let x = 0; x < W; x++) {
      const i = Math.floor((x / W) * BARS);
      const amp = this.levels[i] * H * 0.3;
      const y = H * 0.5 + Math.sin(x * 0.22 + t * 6) * amp;
      g.fillRect(x, Math.round(y), 1, 1);
    }
    g.globalAlpha = 1;
  }

  /** The record. Spins while playing, coasts to a stop when paused. */
  _drawVinyl(dt, playing) {
    const g = this.vinylG;
    const S = 56;
    const c = S / 2;

    this._vinyl += (playing ? 1.6 : 0) * dt;

    g.clearRect(0, 0, S, S);
    g.save();
    g.translate(c, c);
    g.rotate(this._vinyl);

    // Disc.
    g.fillStyle = '#15162a';
    g.beginPath();
    g.arc(0, 0, 25, 0, TAU);
    g.fill();

    // Grooves — the thing that makes the rotation legible. A featureless black
    // circle spinning is indistinguishable from a black circle not spinning.
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.lineWidth = 1;
    for (let r = 8; r < 24; r += 3) {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.stroke();
    }

    // A single bright sheen streak, so one point on the disc is trackable.
    g.strokeStyle = 'rgba(255,255,255,.30)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 18, -0.5, 0.2);
    g.stroke();

    // Label.
    const css = getComputedStyle(this.root);
    g.fillStyle = css.getPropertyValue('--amb-glow').trim() || '#ffd479';
    g.beginPath();
    g.arc(0, 0, 8, 0, TAU);
    g.fill();

    // Spindle hole.
    g.fillStyle = '#15162a';
    g.beginPath();
    g.arc(0, 0, 2, 0, TAU);
    g.fill();

    g.restore();
  }

  /** Musical notes that drift up out of the panel while it plays. */
  _floatNotes(dt, playing) {
    this._noteTimer -= dt;

    if (playing && this._noteTimer <= 0) {
      this._noteTimer = 0.55 + Math.random() * 0.7;

      const n = el('span.mus__note', {
        text: NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)],
        'aria-hidden': 'true',
        style: {
          left: `${18 + Math.random() * 24}%`,
          // Each note gets its own drift and duration, or they'd rise in a
          // column like a fountain instead of wandering like sound.
          '--drift': `${(Math.random() - 0.5) * 70}px`,
          '--dur': `${2.4 + Math.random() * 1.4}s`,
        },
      });
      this.root.append(n);
      // The animation is `forwards`; without this the DOM fills with dead notes.
      setTimeout(() => n.remove(), 4200);
    }
  }
}

const fmt = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${pad2(Math.floor(s % 60))}`;
};
