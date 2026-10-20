/* ============================================================================
   WeatherWidget — real conditions, and the control surface for the sky.

   It does two jobs. It REPORTS the weather (temperature, humidity, wind,
   sunrise, sunset), and it lets you OVERRIDE it — because the single most
   delightful thing you can do with a dashboard that renders weather into a
   living scene is let someone press "storm" and watch it roll in.

   The override is honest about itself: once you've forced a condition, the
   panel says so and offers you the way back to reality.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el } from '../core/util.js';
import { button } from '../ui/feedback.js';
import { getWeather, offlineModel, syntheticModel, KINDS } from '../services/weather.js';

/* The condition strip. These are the buttons, so they're always the daytime
   glyph — a moon on a button that means "clear" reads as "make it night". */
const KIND_ICON = {
  clear: '☀️', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️',
};

/* The READOUT, though, has to know what time it is. A sun blazing away in the
   panel at 1am — while the scene behind it is full of stars — is the kind of
   detail that quietly tells someone the whole thing is fake. */
const NIGHT_ICON = {
  clear: '🌙', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '🌨️', storm: '⛈️',
};

/** "2026-07-13T05:12" → "05:12". Sunrise strings arrive local to the location. */
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '—');

/** "3 minutes ago" / "2 hours ago" / "yesterday". Precision nobody needs. */
function ago(min) {
  if (min < 2) return 'a moment ago';
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export class WeatherWidget extends Widget {
  constructor() {
    super({ title: 'Outside', span: 'span-2', icon: '🌤️', className: 'w-weather' });
    this.real = null; // the last genuinely-fetched model
    this.forced = null; // the kind the user has forced, if any
  }

  body() {
    this.icon = el('div.wx__icon', { text: '…', 'aria-hidden': 'true' });
    this.temp = el('div.wx__temp', { text: '--°' });
    this.label = el('div.wx__label', { text: 'Reading the sky…' });
    this.place = el('div.wx__place', { text: 'locating…' });

    this.stats = el('div.wx__stats');

    // The override strip. Six little buttons, one per condition the world knows.
    this.kinds = el('div.wx__kinds', { role: 'group', 'aria-label': 'Force a weather condition' });
    for (const k of KINDS) {
      const b = button({
        label: KIND_ICON[k],
        title: `Force ${k}`,
        sfx: 'confirm',
        onClick: () => this._force(k),
      });
      b.dataset.kind = k;
      b.classList.add('wx__kind');
      this.kinds.append(b);
    }

    this.note = el('p.wx__note');

    this.listen('cmd:weather', (kind) => this._force(kind));

    this._load();

    return el('div.wx', {}, [
      el('div.wx__main', {}, [
        this.icon,
        el('div.wx__read', {}, [this.temp, this.label, this.place]),
      ]),
      this.stats,
      el('div.divider'),
      this.kinds,
      this.note,
    ]);
  }

  async _load() {
    const w = await getWeather().catch(offlineModel);
    this.real = w;
    if (!this.forced) this._publish(w);
    else this._publish(syntheticModel(this.forced, w)); // keep the forced sky
  }

  _force(kind) {
    if (!this.real) return;

    if (this.forced === kind) {
      // Pressing the active condition again returns you to reality.
      this.forced = null;
      this._publish(this.real);
      bus.emit('toast', { icon: '🌍', text: 'Back to the real sky.' });
      return;
    }

    this.forced = kind;
    this._publish(syntheticModel(kind, this.real));
  }

  /** The scene owns the truth about whether it's night — it may be running on a
      forced hour, in which case the real clock is irrelevant. */
  onPhase(pal) {
    this.night = pal.night;
    if (this.model) this.icon.textContent = this._iconFor(this.model);
  }

  _iconFor(w) {
    return this.night ? NIGHT_ICON[w.kind] ?? w.icon : w.icon;
  }

  /** Update the panel AND tell the world. The scene listens on 'weather'. */
  _publish(w) {
    this.model = w;
    bus.emit('weather', w);

    this.icon.textContent = this._iconFor(w);
    this.temp.textContent = `${Math.round(w.tempC)}°`;
    this.label.textContent = w.label;
    this.place.textContent = [w.place, w.region].filter(Boolean).join(', ');

    const stat = (k, v) => el('div.stat', {}, [
      el('span.stat__k', { text: k }),
      el('span.stat__v', { text: v }),
    ]);

    this.stats.replaceChildren(
      stat('Feels', `${Math.round(w.feelsC)}°`),
      stat('Humidity', `${w.humidity}%`),
      stat('Wind', `${Math.round(w.windKph)} km/h`),
      stat('Sunrise', hhmm(w.sunrise)),
      stat('Sunset', hhmm(w.sunset)),
      stat('Range', w.minC != null ? `${Math.round(w.minC)}° / ${Math.round(w.maxC)}°` : '—')
    );

    for (const b of this.kinds.children) {
      b.setAttribute('aria-pressed', String(b.dataset.kind === w.kind));
      b.classList.toggle('is-active', b.dataset.kind === w.kind);
    }

    this.note.textContent = this._noteFor(w);
    this.note.classList.toggle('is-forced', Boolean(w.synthetic));
  }

  /* Four different things can be true about the weather on screen, and the panel
     is required to say which. A dashboard that renders someone else's rain
     without mentioning it isn't charming, it's just wrong — and it's exactly how
     a dry, cloudy afternoon ended up being reported as a light drizzle. */
  _noteFor(w) {
    if (w.synthetic) return '↑ you are making this weather happen. press it again to stop.';

    /* Stale, but REAL. This is your city, your sky — just from a while ago. An
       honest age is worth more than a freshly invented sunny day, which is what
       we used to serve here. */
    if (w.stale) return `offline — ${w.place}'s sky as it was ${ago(w.ageMin)}.`;

    if (w.offline) return 'offline, and no sky remembered. so: an invented one.';
    if (w.fallback) return `couldn't find you. this is ${w.place}'s sky, not yours.`;
    if (w.corrected) return 'the forecast claimed rain. nothing is falling, so: clouds.';
    return 'the sky above matches the sky outside';
  }
}
