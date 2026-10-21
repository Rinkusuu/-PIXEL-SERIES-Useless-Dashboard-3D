/* ============================================================================
   audio.js — every sound in this app is SYNTHESIZED. There are no audio files.

   Three buses, one master:

     sfx      short blips for UI (square/triangle pings, fast decay)
     ambient  weather + time of day (filtered noise for wind and rain,
              stochastic bird chirps by day, crickets by night)
     music    a generative lo-fi composer, OR a real <audio> element when the
              user loads a file/URL — both feed the same AnalyserNode so the
              visualiser never needs to know which is playing.

   Rules this file obeys:
     · Nothing makes a sound until the user asks (a gesture + the Sound toggle).
       Autoplaying audio is a hostile act.
     · The AudioContext is created lazily, on the first gesture. Creating it
       earlier gets it born 'suspended' and Chrome logs a warning.
     · Every gain change is ramped. A raw `.value =` on a live gain node is an
       instantaneous discontinuity — that click you hear in bad web audio.
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';
import { clamp, lerp, rng, pick } from './util.js';

// ── Musical material ────────────────────────────────────────────────────────

const A4 = 440;
/** MIDI note → Hz. 69 is A4. */
const mtof = (m) => A4 * Math.pow(2, (m - 69) / 12);

// Scales chosen for "cozy": no leading tones, no tritones, nothing urgent.
const SCALES = {
  pentatonic: [0, 3, 5, 7, 10], // minor pentatonic — cannot sound wrong
  lydian: [0, 2, 4, 6, 7, 9, 11], // dreamy, floating
  dorian: [0, 2, 3, 5, 7, 9, 10], // wistful but warm
};

/**
 * The station list. Each is a seed + a mood, not a recording — the composer
 * renders it live, so a "track" is 3 minutes of music that never repeats
 * exactly and costs zero bytes to download.
 */
export const STATIONS = [
  { id: 'grove',  title: 'Pixel Grove',        artist: 'Ambient Loop FM', bpm: 68, root: 57, scale: 'pentatonic', duration: 192, mood: 'warm'  },
  { id: 'rain',   title: 'Rain on the Window', artist: 'Ambient Loop FM', bpm: 60, root: 55, scale: 'dorian',     duration: 208, mood: 'blue'  },
  { id: 'stars',  title: 'Starlight Dust',     artist: 'Ambient Loop FM', bpm: 74, root: 60, scale: 'lydian',     duration: 176, mood: 'bright'},
  { id: 'hearth', title: 'Hearth & Home',      artist: 'Ambient Loop FM', bpm: 64, root: 53, scale: 'pentatonic', duration: 200, mood: 'warm'  },
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = store.get('sound');
    this.ready = false;

    this.volume = store.get('volume');
    this.playing = false;
    this.trackIndex = 0;

    /** Custom tracks the user loaded (files or URLs). Real audio, not synth. */
    this.userTracks = [];

    this._el = null; // HTMLAudioElement, only when a user track is playing
    this._elSource = null;
    this._schedTimer = 0;
    this._nextNoteTime = 0;
    this._step = 0;
    this._startedAt = 0; // ctx.currentTime when the synth track began
    this._offset = 0; // seconds already elapsed (survives pause)
    this._ambient = null;
    this._spectrum = new Uint8Array(64);

    // What the world listens to. See energy().
    this._energy = { bass: 0, level: 0, beat: false, _avg: 0, _refractory: 0 };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Must be called from inside a user gesture the first time. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;

    // A gentle ceiling. Synth stacks clip easily and clipping is the one sound
    // that will genuinely hurt someone wearing headphones.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;

    this.busSfx = ctx.createGain();
    this.busSfx.gain.value = 0.5;
    this.busAmb = ctx.createGain();
    this.busAmb.gain.value = 0;
    this.busMusic = ctx.createGain();
    this.busMusic.gain.value = 0.85;

    // Everything the visualiser should see goes through here.
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.78;

    // A shared reverb gives the whole app one room to live in — the single
    // biggest difference between "web audio demo" and "a place".
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.28;

    this.busMusic.connect(this.analyser);
    this.busSfx.connect(this.analyser);
    this.analyser.connect(this.limiter);

    this.busAmb.connect(this.limiter);
    this.busMusic.connect(this.reverb);
    this.busSfx.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.limiter);

    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);

    this._noise = this._noiseBuffer(3);
    this.ready = true;
    this._startAmbient();

    return ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    store.set('sound', on);
    if (on) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // 400ms fade — a hard mute is itself a click.
    this._ramp(this.master.gain, on ? this.volume : 0, 0.4);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    store.set('volume', this.volume);
    if (this.ctx && this.enabled) this._ramp(this.master.gain, this.volume, 0.08);
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  /**
   * Named blips. Kept deliberately quiet and short (<200ms) — a UI sound you
   * *notice* is a UI sound you will mute within the hour.
   */
  blip(name = 'click') {
    if (!this.enabled || !this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const P = {
      click:   { type: 'square',   f: 880,  f2: 660,  dur: 0.05, gain: 0.05 },
      hover:   { type: 'sine',     f: 1320, f2: 1400, dur: 0.03, gain: 0.018 },
      confirm: { type: 'triangle', f: 660,  f2: 990,  dur: 0.14, gain: 0.06 },
      coin:    { type: 'square',   f: 988,  f2: 1319, dur: 0.11, gain: 0.05 },
      page:    { type: 'triangle', f: 440,  f2: 587,  dur: 0.08, gain: 0.04 },
      type:    { type: 'square',   f: 1600, f2: 1600, dur: 0.012, gain: 0.012 },
      pop:     { type: 'sine',     f: 300,  f2: 900,  dur: 0.12, gain: 0.05 },
      fanfare: { type: 'square',   f: 523,  f2: 1047, dur: 0.3,  gain: 0.055 },
      sip:     { type: 'sine',     f: 220,  f2: 140,  dur: 0.2,  gain: 0.045 },
      error:   { type: 'sawtooth', f: 180,  f2: 110,  dur: 0.16, gain: 0.04 },
      // A bite. Short, upward, urgent — it has to make you flinch.
      bite:    { type: 'triangle', f: 300,  f2: 880,  dur: 0.09, gain: 0.06 },
      reel:    { type: 'square',   f: 420,  f2: 240,  dur: 0.07, gain: 0.03 },

      /* The hour. The one sound here that breaks the "<200ms" rule above, on
         purpose: everything else is a blip acknowledging something YOU did, and
         this is the only sound the app makes on its own. It has to arrive like a
         clock in another room — long, soft, falling, and easy to miss. A short
         bright one would be a notification, and nobody asked to be notified. */
      chime:   { type: 'sine',     f: 784,  f2: 523,  dur: 1.6,  gain: 0.035 },
    }[name] || null;
    if (!P) return;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = P.type;
    osc.frequency.setValueAtTime(P.f, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, P.f2), t + P.dur);

    // Percussive envelope: 4ms attack (any faster clicks), exponential tail.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(P.gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + P.dur);

    osc.connect(g).connect(this.busSfx);
    osc.start(t);
    osc.stop(t + P.dur + 0.02);

    if (name === 'fanfare') {
      // A second voice a fifth up, delayed — an arpeggio, not a chord.
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'square';
      o2.frequency.setValueAtTime(784, t + 0.09);
      g2.gain.setValueAtTime(0.0001, t + 0.09);
      g2.gain.exponentialRampToValueAtTime(0.045, t + 0.1);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o2.connect(g2).connect(this.busSfx);
      o2.start(t + 0.09);
      o2.stop(t + 0.36);
    }
  }

  // ── Ambience ──────────────────────────────────────────────────────────────

  /**
   * A permanent noise bed whose filter and gain are re-aimed as the weather and
   * the hour change. Two looping noise sources, never restarted — restarting a
   * noise loop is audible, re-filtering it is not.
   */
  _startAmbient() {
    const ctx = this.ctx;

    const mk = (freq, q, gain, type = 'bandpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.busAmb);
      src.start();
      return { src, f, g };
    };

    this._ambient = {
      wind: mk(420, 0.7, 0.5),
      rain: mk(2400, 0.4, 0.0),
      // The hearth: a low, breathing rumble. The CRACKLE is scheduled separately
      // (see _hearthLoop) — a fire is a rumble plus a Poisson process of pops,
      // and you need both or it sounds like a boiler.
      fire: mk(180, 0.9, 0.0, 'lowpass'),
    };

    // Slow LFO on the wind's cutoff — the difference between "wind" and "hiss".
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(this._ambient.wind.f.frequency);
    lfo.start();

    // The ambience bus starts SILENT and is opened here, once, at init. It used
    // to be opened only inside setAmbience() — which meant that if no day/night
    // phase boundary happened to be crossed, you turned sound on and heard
    // nothing at all.
    this._ramp(this.busAmb.gain, 0.6, 2);

    this._chirpLoop();
    this._hearthLoop();

    // Re-apply whatever the world last told us. Without this, an ambience set
    // before the AudioContext existed (i.e. every single one, since the context
    // is born on the first click) is silently discarded.
    if (this._amb) this.setAmbience(this._amb);
    this._applyMix();
  }

  // ── The mixer ─────────────────────────────────────────────────────────────

  /**
   * Four beds the user can raise on top of the weather. These are ADDITIVE, not
   * overrides: setting rain to 0.5 gives you rain in your ears under a clear
   * sky, and it stacks on top of real rain when it's actually raining. The
   * weather still drives the world; this just lets you lie to your own ears.
   */
  setMix(key, value) {
    const mix = { ...store.get('mix'), [key]: clamp(value, 0, 1) };
    store.set('mix', mix);
    if (this.enabled) this.init();
    this._applyMix();
  }

  getMix() {
    return store.get('mix');
  }

  _applyMix() {
    if (!this.ready) return;
    // The weather's own contribution is recomputed and re-summed, so raising a
    // slider can never strand the weather bed at a stale value.
    this.setAmbience(this._amb || { kind: 'clear', night: false, wind: 0.3 });
  }

  /**
   * Birds by day, crickets by night, silence in a storm. Scheduled with random
   * gaps — a chirp on a fixed interval is a metronome, and the ear finds it
   * instantly.
   */
  _chirpLoop() {
    const gap = 2600 + Math.random() * 6000;
    setTimeout(() => {
      this._chirpLoop();
      if (!this.enabled || !this.ready) return;

      const { night = false, kind = 'clear' } = this._amb ?? {};
      const cricketMix = store.get('mix').crickets;

      // The user's cricket slider overrides the weather's veto: if you want
      // crickets in a snowstorm at noon, that is between you and the crickets.
      const wet = kind === 'rain' || kind === 'storm' || kind === 'snow';
      if (wet && cricketMix < 0.05) return;
      if (Math.random() > 0.55 + cricketMix * 0.4) return;

      if (night || cricketMix > 0.05) this._cricket(0.006 + cricketMix * 0.02);
      else if (!wet) this._birdsong();
    }, gap);
  }

  /**
   * The hearth crackle. Pops arrive as a Poisson-ish process — a random gap
   * every time, never a rhythm. A fire on a metronome is a dripping tap.
   */
  _hearthLoop() {
    const gap = 70 + Math.random() * 320;
    setTimeout(() => {
      this._hearthLoop();
      // In the 3D world the fire in the hearth is real, so it crackles on its own.
      const level = Math.max(store.get('mix').hearth, this._spatial ? 0.6 : 0);
      if (!this.enabled || !this.ready || level < 0.03) return;
      if (Math.random() > 0.55) return;

      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._noise;

      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      // Each pop picks its own pitch, so the fire has big logs and small twigs.
      f.frequency.value = 900 + Math.random() * 2600;
      f.Q.value = 2 + Math.random() * 5;

      const g = ctx.createGain();
      const peak = (0.01 + Math.random() * 0.05) * level;
      const dur = 0.012 + Math.random() * 0.05;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(f).connect(g).connect(this._hearthOut());
      src.start(t, Math.random() * 2);
      src.stop(t + dur + 0.02);
    }, gap);
  }

  _birdsong() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.08 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const f = 2000 + Math.random() * 1800;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.7), t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.02, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(this.busAmb);
      o.start(t);
      o.stop(t + 0.11);
    }
  }

  _cricket(peak = 0.006) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    // In the walkable world each cricket is somewhere: a few metres off in the grass.
    const spot = this._spot(6, 18);
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 4400 + Math.random() * 400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(spot);
      o.start(t);
      o.stop(t + 0.04);
    }
  }

  // ── Positional sound (the 3D world only) ──────────────────────────────────
  /* Classic never calls these, and everything below falls back to the plain
     ambience bus when it hasn't been asked for. All of it still runs through
     busAmb, so the mixer, the volume and mute apply exactly as before. */

  /** Turn positional sound on: the hearth's position, in metres. */
  enableSpatial({ hearth }) {
    this._spatial = { hearth };
    if (!this.ready) return; // re-applied on init (see _hearthOut)
    this._applyMix();
  }

  /** The hearth bed and its crackle: through a panner at the fireplace, if there is one. */
  _hearthOut() {
    if (!this._spatial) return this.busAmb;
    if (!this._hearthPanner) {
      const p = this._panner(...this._spatial.hearth);
      p.refDistance = 2;
      p.rolloffFactor = 1.6;
      this._hearthPanner = p;
      // Re-route the rumble bed too, once.
      this._ambient.fire.g.disconnect();
      this._ambient.fire.g.connect(p);
    }
    return this._hearthPanner;
  }

  _panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(this.busAmb);
    return p;
  }

  /** A one-shot's destination: a random spot `min`–`max` metres from the listener (3D), or the bus. */
  _spot(min, max) {
    if (!this._spatial || !this._listener) return this.busAmb;
    const a = Math.random() * Math.PI * 2;
    const r = min + Math.random() * (max - min);
    const [x, y, z] = this._listener;
    const p = this._panner(x + Math.cos(a) * r, y - 1.2, z + Math.sin(a) * r);
    p.refDistance = 3;
    setTimeout(() => p.disconnect(), 1500);
    return p;
  }

  /** Where your ears are and which way they face. Called a few times a second. */
  setListener(x, y, z, fx, fy, fz) {
    this._listener = [x, y, z];
    if (!this.ready) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(x, t, 0.05);
      l.positionY.setTargetAtTime(y, t, 0.05);
      l.positionZ.setTargetAtTime(z, t, 0.05);
      l.forwardX.setTargetAtTime(fx, t, 0.05);
      l.forwardY.setTargetAtTime(fy, t, 0.05);
      l.forwardZ.setTargetAtTime(fz, t, 0.05);
    } else {
      l.setPosition(x, y, z); // older Safari
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
    this._hearthOut();
  }

  /** Under the cabin roof or not: the rain changes character. */
  setIndoors(on) {
    if (this._indoors === on) return;
    this._indoors = on;
    if (this.ready && this._amb) this.setAmbience(this._amb);
  }

  /**
   * The one place ambient levels are decided. Called on EVERY weather change,
   * every phase change, every mixer move, and once at init.
   *
   * It used to be called only when the day/night phase changed, which produced
   * the bug this rewrite exists to kill: force a storm, wait for a phase
   * boundary so the rain bed ramps up, then switch back to clear — and the rain
   * would keep pouring into your ears under a cloudless sky until the next
   * boundary, potentially hours later. The gain was simply never revisited.
   *
   * The rule now: this function is IDEMPOTENT and recomputes every bed from
   * scratch. Call it as often as you like; it always lands on the truth.
   */
  setAmbience({ kind = 'clear', night = false, wind = 0.3, precip = 1 } = {}) {
    this._amb = { kind, night, wind, precip };
    if (!this.ready) return;

    const A = this._ambient;
    const mix = store.get('mix');

    const rainy = kind === 'rain' || kind === 'storm';
    const snowy = kind === 'snow';

    // Weather bed + user bed, summed. The user's rain is quieter per-unit than
    // real rain so a full slider sits *under* a real downpour, not over it.
    /* Scaled by how hard it is actually falling. A 0.2mm drizzle used to come
       through the speakers at exactly the volume of an 8mm downpour, which is
       its own small lie — and the loudest one, because you hear it before you
       look at anything. A storm is always a storm. */
    const wet = kind === 'storm' ? 1 : clamp(precip, 0, 1);
    const rainFromSky = rainy ? (kind === 'storm' ? 0.14 : 0.09 * (0.35 + wet * 0.65)) : 0;
    this._ramp(A.rain.g.gain, rainFromSky + mix.rain * 0.11, 2.5);
    // Under a roof the rain is a dull drumming overhead, not a hiss.
    A.rain.f.frequency.setTargetAtTime(this._indoors ? 700 : kind === 'storm' ? 1800 : 2600, this.ctx.currentTime, 0.6);

    // Snow is *quieter* than clear — muffled, not silent. That's the whole trick.
    const windFromSky = snowy ? 0.02 : rainy ? 0.05 : 0.03 + wind * 0.05;
    this._ramp(A.wind.g.gain, windFromSky + mix.wind * 0.09, 3);

    this._ramp(A.fire.g.gain, mix.hearth * 0.1 + (this._spatial ? 0.08 : 0), 2);
  }

  /**
   * A splash. Noise through a bandpass that sweeps DOWN — water entering water
   * is broadband at the moment of impact and gets duller as the cavity collapses.
   * A sine sweep would sound like a cartoon droplet; this sounds wet.
   *
   * @param size 0–1 — a skipped pebble is 0.15, a cast float is 0.35, a fish is 1.
   */
  splash(size = 0.4) {
    if (!this.enabled || !this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this._noise;

    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    // Big splashes start lower and last longer. Small ones are a tick of treble.
    f.frequency.setValueAtTime(2600 - size * 900, t);
    f.frequency.exponentialRampToValueAtTime(320 + size * 180, t + 0.1 + size * 0.25);

    const g = ctx.createGain();
    const peak = 0.05 + size * 0.13;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + size * 0.4);

    src.connect(f).connect(g).connect(this.busAmb);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.7 + size);
  }

  /** A thunderclap: a filtered noise burst with a long, rumbling tail. */
  thunder(distance = 0.5) {
    if (!this.enabled || !this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.15 + distance * 1.6; // sound lags the flash

    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    // Distant thunder has lost its highs to the air. Near thunder cracks.
    f.frequency.setValueAtTime(900 - distance * 620, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 1.6);
    const g = ctx.createGain();
    const peak = 0.28 * (1 - distance * 0.65);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);

    src.connect(f).connect(g).connect(this.busAmb);
    src.start(t, Math.random() * 2);
    src.stop(t + 2);
  }

  // ── Music: transport ──────────────────────────────────────────────────────

  get tracks() {
    return [...STATIONS, ...this.userTracks];
  }

  get track() {
    return this.tracks[this.trackIndex % this.tracks.length];
  }

  addUserTrack(t) {
    this.userTracks.push(t);
    this.trackIndex = this.tracks.length - 1;
    this._teardown();
    this.play();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  play() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Playing music with sound off is a black hole for bug reports.
    if (!this.enabled) this.setEnabled(true);

    this.playing = true;
    const track = this.track;

    if (track.src) {
      this._playElement(track);
    } else {
      this._startedAt = this.ctx.currentTime - this._offset;
      this._nextNoteTime = this.ctx.currentTime + 0.05;
      this._composer = this._makeComposer(track);
      this._schedule();
    }
    bus.emit('music', this.status());
  }

  pause() {
    this.playing = false;
    this._offset = this.position;
    clearTimeout(this._schedTimer);
    if (this._el) this._el.pause();
    bus.emit('music', this.status());
  }

  next() {
    this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
    this._restart();
  }

  prev() {
    // Standard transport behaviour: >3s in, "prev" restarts the current track.
    if (this.position > 3) {
      this._offset = 0;
      this._restart();
      return;
    }
    this.trackIndex = (this.trackIndex - 1 + this.tracks.length) % this.tracks.length;
    this._restart();
  }

  seek(fraction) {
    const d = this.duration;
    this._offset = clamp(fraction, 0, 0.999) * d;
    if (this._el) {
      this._el.currentTime = this._offset;
    } else if (this.playing) {
      this._restart(true);
      return;
    }
    bus.emit('music', this.status());
  }

  _restart(keepOffset = false) {
    const wasPlaying = this.playing;
    this._teardown();
    if (!keepOffset) this._offset = 0;
    if (wasPlaying) this.play();
    else bus.emit('music', this.status());
  }

  _teardown() {
    clearTimeout(this._schedTimer);
    this.playing = false;
    if (this._el) {
      this._el.pause();
      this._el.src = '';
      this._el = null;
      this._elSource = null;
    }
  }

  get duration() {
    const t = this.track;
    if (t.src && this._el && isFinite(this._el.duration)) return this._el.duration;
    return t.duration || 180;
  }

  get position() {
    if (this._el) return this._el.currentTime || 0;
    if (!this.playing || !this.ctx) return this._offset;
    return Math.min(this.ctx.currentTime - this._startedAt, this.duration);
  }

  status() {
    return {
      playing: this.playing,
      track: this.track,
      index: this.trackIndex,
      position: this.position,
      duration: this.duration,
      count: this.tracks.length,
    };
  }

  /** 64 bins of 0–1 magnitude for the visualiser. Safe to call when silent. */
  spectrum() {
    if (!this.ready) return null;
    this.analyser.getByteFrequencyData(this._spectrum);
    return this._spectrum;
  }

  /**
   * The energy read the WORLD listens to: bass, overall level, and a beat flag.
   *
   * The beat detector is a running-average threshold — a bin is "a beat" when
   * the bass jumps meaningfully above its own recent mean, not when it crosses
   * some fixed number. A fixed threshold works on exactly one track at exactly
   * one volume and fails on everything else; this adapts to whatever is playing.
   *
   * `energy.beat` latches true for one frame only. Callers use it to KICK
   * something (flare the fireflies, punch the bloom); `energy.bass` is the
   * continuous value they lerp toward.
   */
  energy(dt = 1 / 60) {
    const e = this._energy;
    const spec = this.spectrum();

    if (!spec || !this.playing) {
      // Decay to rest rather than snapping — the world shouldn't slam still the
      // instant you hit pause.
      e.bass = Math.max(0, e.bass - dt * 1.8);
      e.level = Math.max(0, e.level - dt * 1.8);
      e.beat = false;
      return e;
    }

    // Bins 1–6 of a 64-bin FFT ≈ 40–260Hz at 44.1kHz. That's the kick and the
    // bass. Bin 0 is DC and is always garbage.
    let bass = 0;
    for (let i = 1; i < 7; i++) bass += spec[i];
    bass = bass / 6 / 255;

    let level = 0;
    for (let i = 1; i < spec.length; i++) level += spec[i];
    level = level / (spec.length - 1) / 255;

    // Attack fast, release slow — same asymmetry as the equaliser bars.
    e.bass = bass > e.bass ? lerp(e.bass, bass, 1 - Math.exp(-22 * dt)) : lerp(e.bass, bass, 1 - Math.exp(-5 * dt));
    e.level = lerp(e.level, level, 1 - Math.exp(-8 * dt));

    // Running mean of the bass, over roughly the last second.
    e._avg = lerp(e._avg, bass, 1 - Math.exp(-1.4 * dt));

    // A beat is a transient 35% above the recent mean, with a refractory period
    // so one kick can't register three times as it decays.
    e._refractory = Math.max(0, e._refractory - dt);
    e.beat = false;
    if (bass > e._avg * 1.35 && bass > 0.12 && e._refractory <= 0) {
      e.beat = true;
      e._refractory = 0.12; // ≈ 500 BPM ceiling. Nothing legitimate beats faster.
    }

    return e;
  }

  // ── Music: real files & streams ───────────────────────────────────────────

  _playElement(track) {
    if (!this._el) {
      const a = new Audio();
      a.crossOrigin = 'anonymous'; // required or the analyser sees silence
      a.src = track.src;
      a.loop = false;
      a.addEventListener('ended', () => this.next());
      a.addEventListener('error', () => {
        bus.emit('toast', { icon: '⚠️', text: "That track won't load. CORS, probably." });
        this.blip('error');
        this.pause();
      });
      // A MediaElementSource can only be created once per element, ever.
      this._elSource = this.ctx.createMediaElementSource(a);
      this._elSource.connect(this.busMusic);
      this._el = a;
    }
    this._el.currentTime = this._offset || 0;
    this._el.play().catch(() => {
      bus.emit('toast', { icon: '⚠️', text: 'Playback was blocked. Tap play again.' });
      this.playing = false;
    });
  }

  // ── Music: the composer ───────────────────────────────────────────────────

  /**
   * Builds the generator for one station. Returns a `step(i, time)` that renders
   * the i-th sixteenth note at `time`.
   *
   * The arrangement is four voices on a 16-step bar:
   *   pad   — a held triad, swelling, one chord per bar
   *   bass  — root on the downbeat and the 'and' of 3
   *   arp   — sparse plucks from the scale, probabilistic, never on every step
   *   kick/hat — very soft, felt more than heard
   *
   * Randomness is seeded per-station so a station has a *character* while never
   * playing the same bar twice.
   */
  _makeComposer(track) {
    const ctx = this.ctx;
    const rand = rng(track.id.length * 7919 + track.bpm);
    const scale = SCALES[track.scale];
    const root = track.root;

    // ii–V–I-ish motion, but modal: nothing resolves too hard.
    const progression = [0, 5, 3, 4];

    const voice = (freq, time, dur, type, gain, detune = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400;
      f.Q.value = 0.6;
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      // Soft attack + long release = "pad". Sharp attack = "pluck". Same graph.
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(gain, time + dur * 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      o.connect(f).connect(g).connect(this.busMusic);
      o.start(time);
      o.stop(time + dur + 0.05);
    };

    const perc = (time, hz, dur, gain, type = 'lowpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this._noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(f).connect(g).connect(this.busMusic);
      src.start(time, rand() * 2);
      src.stop(time + dur + 0.02);
    };

    return (i, time) => {
      const step = i % 16;
      const bar = Math.floor(i / 16);
      const deg = progression[bar % progression.length];
      const chordRoot = root + scale[deg % scale.length];

      // Pad — one swelling triad per bar.
      if (step === 0) {
        const third = chordRoot + scale[(deg + 2) % scale.length] - scale[deg % scale.length];
        const fifth = chordRoot + 7;
        const dur = (60 / track.bpm) * 4 * 0.98;
        voice(mtof(chordRoot), time, dur, 'sine', 0.055);
        voice(mtof(third), time, dur, 'sine', 0.04, +6);
        voice(mtof(fifth), time, dur, 'triangle', 0.03, -6);
      }

      // Bass.
      if (step === 0 || step === 10) {
        voice(mtof(chordRoot - 12), time, 0.55, 'triangle', 0.11);
      }

      // Arp — sparse and probabilistic. Silence is a note.
      if (step % 2 === 0 && rand() > 0.52) {
        const oct = rand() > 0.75 ? 12 : 0;
        const n = root + 12 + oct + pick(scale, rand);
        voice(mtof(n), time, 0.42, 'square', 0.028);
      }

      // Percussion — barely there.
      if (step === 0 || step === 8) perc(time, 120, 0.16, 0.09);
      if (step % 4 === 2 && rand() > 0.3) perc(time, 7000, 0.03, 0.012, 'highpass');
    };
  }

  /**
   * Lookahead scheduler. `setTimeout` is not accurate enough to place notes,
   * so we run it *coarsely* (every 25ms) and use it only to queue notes onto
   * the audio clock up to 120ms ahead — the clock is sample-accurate, the timer
   * only has to be early.
   */
  _schedule() {
    if (!this.playing || !this.ctx) return;
    const spb = 60 / this.track.bpm / 4; // seconds per 16th

    while (this._nextNoteTime < this.ctx.currentTime + 0.12) {
      this._composer(this._step, this._nextNoteTime);
      this._nextNoteTime += spb;
      this._step++;
    }

    if (this.position >= this.duration) {
      this._offset = 0;
      this._step = 0;
      this.next();
      return;
    }

    this._schedTimer = setTimeout(() => this._schedule(), 25);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _ramp(param, to, seconds) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(to, t + seconds);
  }

  _noiseBuffer(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * Synthetic impulse response: exponentially decaying noise. Not a real hall,
   * but two decaying noise channels is genuinely all a plausible reverb needs.
   */
  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
}

export const audio = new AudioEngine();

// Any widget can ask for a sound without importing the engine.
bus.on('sfx', (name) => audio.blip(name));
bus.on('splash', (size) => audio.splash(size));
