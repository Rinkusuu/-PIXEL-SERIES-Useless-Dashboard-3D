/* ============================================================================
   AmbienceWidget — four sliders that lie to your ears.

   These beds are ADDITIVE, layered on top of whatever the weather is already
   doing. So you can have rain in your headphones under a cloudless sky, or a
   fire crackling through August. The world stays honest; your ears don't have to.

   Everything here is synthesised in core/audio.js — filtered noise for the rain
   and the wind, scheduled bursts for the crickets, and a Poisson process of
   band-passed pops for the fire. There are no audio files. There never were.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el } from '../core/util.js';
import { audio } from '../core/audio.js';
import { button } from '../ui/feedback.js';

const BEDS = [
  { key: 'rain', icon: '🌧️', label: 'Rain', blurb: 'filtered noise, 2.6kHz' },
  { key: 'wind', icon: '🍃', label: 'Wind', blurb: 'a bandpass with a slow LFO' },
  { key: 'crickets', icon: '🦗', label: 'Crickets', blurb: 'four square-wave chirps' },
  { key: 'hearth', icon: '🔥', label: 'Hearth', blurb: 'rumble + random pops' },
];

const PRESETS = [
  { name: 'Rainy night', mix: { rain: 0.7, wind: 0.25, crickets: 0.15, hearth: 0 } },
  { name: 'By the fire', mix: { rain: 0.2, wind: 0.1, crickets: 0, hearth: 0.8 } },
  { name: 'Summer dusk', mix: { rain: 0, wind: 0.3, crickets: 0.65, hearth: 0 } },
  { name: 'Silence', mix: { rain: 0, wind: 0, crickets: 0, hearth: 0 } },
];

export class AmbienceWidget extends Widget {
  constructor() {
    // float:false — you cannot reliably grab a slider that is bobbing.
    super({ title: 'Ambience', icon: '🎧', float: false, className: 'w-amb' });
    this.rows = new Map();
  }

  body() {
    const mix = store.get('mix');

    const list = el('div.amb__list');

    for (const bed of BEDS) {
      const slider = el('input.amb__slider', {
        type: 'range',
        min: '0',
        max: '100',
        value: String(Math.round((mix[bed.key] ?? 0) * 100)),
        'aria-label': bed.label,
        oninput: (e) => {
          const v = Number(e.target.value) / 100;
          // The engine is created lazily on a gesture; dragging a slider IS one.
          audio.setMix(bed.key, v);
          this._syncRow(bed.key, v);
        },
      });

      const level = el('span.amb__level', { text: pct(mix[bed.key] ?? 0) });

      /* Two rows, not four columns. In a single-width panel the four-column
         layout squeezed the label into a 60px gutter and wrapped "filtered
         noise, 2.6kHz" over three lines. The slider gets the full width and the
         header gets the rest; nothing can crush anything. The synthesis note
         moves to the tooltip — the panel's footer already tells you none of this
         is a recording. */
      const row = el('div.amb__row', { title: `${bed.label} — ${bed.blurb}` }, [
        el('span.amb__ico', { text: bed.icon, 'aria-hidden': 'true' }),
        el('span.amb__label', { text: bed.label }),
        level,
        slider,
      ]);

      this.rows.set(bed.key, { row, slider, level });
      list.append(row);
    }

    this.presets = el('div.amb__presets');
    for (const p of PRESETS) {
      this.presets.append(
        button({
          label: p.name,
          sfx: 'confirm',
          onClick: () => this._apply(p),
        })
      );
    }

    this.note = el('p.amb__note', {
      text: 'layered on top of the real weather. nothing here is a recording.',
    });

    return el('div.amb', {}, [list, el('div.divider'), this.presets, this.note]);
  }

  _apply(preset) {
    for (const [key, v] of Object.entries(preset.mix)) {
      audio.setMix(key, v);
      const r = this.rows.get(key);
      if (r) r.slider.value = String(Math.round(v * 100));
      this._syncRow(key, v);
    }
    bus.emit('toast', { icon: '🎧', text: preset.name });
    this.note.textContent =
      preset.name === 'Silence'
        ? 'just the world, then. that is allowed too.'
        : 'layered on top of the real weather. nothing here is a recording.';
  }

  _syncRow(key, v) {
    const r = this.rows.get(key);
    if (!r) return;
    r.level.textContent = pct(v);
    r.row.classList.toggle('is-on', v > 0.02);
  }

  mounted() {
    // Reflect whatever was persisted from last time.
    const mix = store.get('mix');
    for (const bed of BEDS) this._syncRow(bed.key, mix[bed.key] ?? 0);
  }
}

const pct = (v) => `${Math.round(v * 100)}`;
