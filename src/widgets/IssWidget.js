/* ============================================================================
   IssWidget — where the space station is, and whether you could see it.

   This is the most useless widget on the dashboard and by some distance the most
   affecting. The ISS passing over your house changes nothing about your day. But
   there are people up there, right now, going round at 7.66 km/s, and when this
   panel says "look up" it means it.

   It publishes onto the bus so IssLayer can draw the station in the actual sky.
   The panel is just the readout; the sky is the feature.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el, clamp, damp } from '../core/util.js';
import { getISS, reckon } from '../services/iss.js';
import { unlock } from '../core/achievements.js';

const POLL = 5000; // the API is happy with 1/sec; 5 is plenty and polite

/** "45s" / "12m" — how long we've been guessing. */
const mmss = (sec) => (sec < 90 ? `${sec}s` : `${Math.round(sec / 60)}m`);

export class IssWidget extends Widget {
  constructor() {
    super({ title: 'Overhead', span: 'span-2', icon: '🛰️', className: 'w-iss' });

    this.obs = null; // observer lat/lon, once the weather resolves
    this.iss = null;
    this.night = false;
    this._timer = 0;
    this._seen = false;
  }

  body() {
    this.state = el('div.iss__state', { text: 'finding the station…' });
    this.dist = el('div.iss__dist', { text: '—' });

    this.grid = el('div.iss__grid');
    this.note = el('p.iss__note', {
      text: 'seven people live up there. they are going 27,600 km/h.',
    });

    // The sky bar: a horizon line with the station plotted on it by elevation.
    // Not a radar sweep — a horizon. It answers "how high up, and which way".
    this.sky = el('canvas.iss__sky', { width: 220, height: 56, 'aria-hidden': 'true' });
    this.skyG = this.sky.getContext('2d');
    this.skyG.imageSmoothingEnabled = false;

    // We need to know where the user is. The weather already asked.
    this.listen('weather', (w) => {
      if (typeof w.lat === 'number' && !this.obs) {
        this.obs = { lat: w.lat, lon: w.lon };
        this._poll();
      }
    });
    this.listen('phase', (pal) => {
      this.night = pal.night;
    });

    return el('div.iss', {}, [
      el('div.iss__head', {}, [
        el('span.iss__ico', { text: '🛰️', 'aria-hidden': 'true' }),
        el('div', {}, [this.state, this.dist]),
      ]),
      this.sky,
      this.grid,
      this.note,
    ]);
  }

  async _poll() {
    if (!this.obs) return;
    let iss = await getISS(this.obs.lat, this.obs.lon);

    if (!iss) {
      /* No network — so FLY IT OURSELVES.

         The old behaviour was to print "can't reach the station" and leave the
         dot frozen in the sky, which was the worst of both worlds: a satellite
         that has stopped moving is indistinguishable from a star, and the panel
         was announcing a networking problem to someone who wanted to know where
         the ISS was. It's in a 92-minute orbit. We know where it is. */
      iss = reckon(this._lastFix, this.obs.lat, this.obs.lon);

      if (!iss) {
        this.state.textContent = "can't reach the station";
        this.note.textContent = 'the tracker is offline, and we never had a fix.';
        return;
      }
    } else {
      // Remember the direction of travel so the dead reckoning knows which way
      // along the orbit to go — north-bound and south-bound look identical from
      // a single fix.
      if (this._lastFix) iss.ascending = iss.lat >= this._lastFix.lat;
      this._lastFix = iss;
    }

    this.iss = iss;
    bus.emit('iss', iss); // the sky layer is listening
    this._paint();

    /* A real, genuinely rare thing: it is above you AND lit AND your sky is dark.
       We will not tell someone to go outside and look at a specific patch of sky
       on the strength of a position we guessed. Dead reckoning drifts about a
       degree a minute; after a couple of minutes the claim isn't good enough to
       stake someone's evening on. */
    const trustworthy = !iss.estimated || iss.ageSec < 120;

    if (iss.visible && this.night && trustworthy) {
      if (!this._seen) {
        this._seen = true;
        unlock('iss');
        bus.emit('toast', {
          icon: '🛰️',
          text: `The ISS is ${Math.round(iss.elevation)}° above the ${iss.compass}. Go look.`,
          ms: 8000,
        });
      }
    } else {
      this._seen = false;
    }
  }

  _paint() {
    const iss = this.iss;
    const up = iss.elevation > 0;

    // The headline. It should read like a person telling you something.
    if (up && iss.sunlit && this.night) {
      this.state.textContent = 'LOOK UP — it is right there';
      this.state.dataset.kind = 'visible';
    } else if (up) {
      this.state.textContent = `above your horizon, to the ${iss.compass}`;
      this.state.dataset.kind = 'up';
    } else {
      this.state.textContent = 'on the other side of the world';
      this.state.dataset.kind = '';
    }

    this.dist.textContent = `${fmt(Math.round(iss.rangeKm))} km away`;

    if (iss.estimated) {
      this.note.textContent = `estimated — no signal for ${mmss(iss.ageSec)}. it has not stopped.`;
    } else {
      this.note.textContent = 'seven people live up there. they are going 27,600 km/h.';
    }

    const stat = (k, v) =>
      el('div.stat', {}, [el('span.stat__k', { text: k }), el('span.stat__v', { text: v })]);

    this.grid.replaceChildren(
      stat('Elevation', up ? `${Math.round(iss.elevation)}°` : 'below horizon'),
      stat('Bearing', `${Math.round(iss.azimuth)}° ${iss.compass}`),
      stat('Altitude', `${Math.round(iss.altKm)} km`),
      stat('Speed', `${fmt(Math.round(iss.speedKph))} km/h`),
      stat('Latitude', `${iss.lat.toFixed(1)}°`),
      stat('Sunlight', iss.sunlit ? 'in daylight' : "in earth's shadow")
    );

    this.note.textContent = up
      ? iss.sunlit
        ? this.night
          ? 'lit by a sun that has already set for you. this is the only time it is visible.'
          : 'it is up there, but your sky is too bright to see it.'
        : "it is overhead but in the earth's shadow. invisible."
      : 'it will be back. it goes round every 92 minutes.';
  }

  /**
   * The horizon strip. A line for the horizon, tick marks for the compass, and
   * the station plotted by bearing and elevation. When it's below the horizon it
   * sits *under* the line, dimmed — which shows you it's coming.
   */
  tick({ dt, t }) {
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = POLL / 1000;
      this._poll();
    }

    const g = this.skyG;
    const W = this.sky.width;
    const H = this.sky.height;
    g.clearRect(0, 0, W, H);

    const css = getComputedStyle(this.root);
    const ink = css.getPropertyValue('--amb-ink-soft').trim() || '#9aa';
    const glow = css.getPropertyValue('--amb-glow').trim() || '#ffd479';
    const accent = css.getPropertyValue('--amb-accent').trim() || '#7fd6c2';

    const horizonY = H - 14;

    // Horizon.
    g.fillStyle = ink;
    g.globalAlpha = 0.5;
    for (let x = 0; x < W; x += 2) g.fillRect(x, horizonY, 1, 1);
    g.globalAlpha = 1;

    // Compass ticks: E … S … W, left to right, matching the sky projection.
    g.font = '8px monospace';
    g.globalAlpha = 0.6;
    g.fillStyle = ink;
    [['E', 0], ['SE', 0.25], ['S', 0.5], ['SW', 0.75], ['W', 1]].forEach(([label, f]) => {
      const x = 6 + f * (W - 12);
      g.fillRect(Math.round(x), horizonY + 2, 1, 3);
      g.fillText(label, Math.round(x) - label.length * 2, H - 2);
    });
    g.globalAlpha = 1;

    if (!this.iss || this.iss.elevation == null) return;

    const iss = this.iss;
    const a = ((iss.azimuth - 90 + 360) % 360) / 180;
    const x = 6 + clamp(a, 0, 1) * (W - 12);
    const up = iss.elevation > 0;
    const y = up
      ? horizonY - (clamp(iss.elevation, 0, 90) / 90) * (horizonY - 6)
      : horizonY + 4;

    // The station. It pulses gently when it is genuinely visible to you.
    const visible = up && iss.sunlit && this.night;
    const pulse = visible ? 0.6 + 0.4 * Math.sin(t * 3) : 1;

    g.globalAlpha = up ? pulse : 0.3;
    g.fillStyle = visible ? glow : up ? accent : ink;
    g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);

    if (visible) {
      g.globalAlpha = 0.25 * pulse;
      g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
    }
    g.globalAlpha = 1;
  }
}

const fmt = (n) => n.toLocaleString('en-US');
