/* ============================================================================
   command.js — ⌘K. Every action in the app, one keystroke away.

   The thing that makes a command palette feel *premium* rather than merely
   present is that it is the FASTEST path to everything, not a second-class
   duplicate of the buttons. So every action here is the same function the button
   calls — there is no parallel implementation to drift out of sync.

   Fuzzy matching, not substring matching: typing "storm" should find "Force a
   thunderstorm", and typing "wtr" should still find the weather commands. A
   palette that only does `includes()` makes you type the words exactly right,
   which defeats the entire purpose of not having to find the button.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { audio } from '../core/audio.js';
import { motion } from '../core/motion.js';
import { zen } from '../core/zen.js';
import { el, $, clamp } from '../core/util.js';
import { SEASON_KEYS, SEASON_ICON } from '../scene/season.js';
import { savePostcard } from './postcard.js';
import { play, MODES } from '../core/play.js';

/**
 * Subsequence fuzzy match. Returns a score, or -1 for no match.
 * Consecutive hits and hits at word boundaries score higher, so "pc" ranks
 * "PostCard" above "PixelPet Coffee".
 */
function fuzzy(needle, haystack) {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!n) return 0;

  let score = 0;
  let hi = 0;
  let streak = 0;

  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return -1;

    // A hit right after the previous one, or at the start of a word, is worth
    // more — that's what makes acronyms rank properly.
    if (found === hi) streak++;
    else streak = 0;

    score += 1 + streak * 2;
    if (found === 0 || h[found - 1] === ' ') score += 3;

    hi = found + 1;
  }

  // Shorter haystacks win ties: an exact-ish match on a short label beats a
  // scattered match inside a long one.
  return score - h.length * 0.02;
}

export function initCommandPalette(scene) {
  /* ── The action list ────────────────────────────────────────────────────────
     Each command is { id, icon, label, hint, run }. Nothing here reimplements
     anything; `run` calls the same code the UI does. */
  const commands = () => [
    {
      icon: '🧘', label: 'Enter Zen mode', hint: 'hide everything and breathe',
      run: () => zen.start(),
    },
    {
      icon: audio.enabled ? '🔇' : '🔊',
      label: audio.enabled ? 'Turn sound off' : 'Turn sound on',
      hint: 'ambience and UI blips',
      run: () => audio.setEnabled(!audio.enabled),
    },
    {
      icon: motion.enabled ? '🧊' : '🎐',
      label: motion.enabled ? 'Reduce motion' : 'Restore motion',
      hint: 'stills the world',
      run: () => motion.toggle(),
    },
    {
      icon: '🪟',
      label: store.get('glass') ? 'Frost the glass' : 'Clear the glass',
      hint: 'see the world through the dashboard',
      run: () => bus.emit('cmd:glass'),
    },
    {
      icon: '📮', label: 'Save a postcard', hint: 'export the world as a PNG',
      run: () => {
        const pal = scene.env.pal;
        const w = scene.env;
        savePostcard($('#scene'), $('#glow'), {
          caption: pal.caption,
          place: scene.place || '',
          season: scene.env.season.name,
          weather: pal.weather,
          time: `${String(Math.floor(w.hour)).padStart(2, '0')}:00`,
        });
      },
    },
    {
      icon: '🎵', label: audio.playing ? 'Pause music' : 'Play music',
      hint: 'Ambient Loop FM',
      run: () => audio.toggle(),
    },
    { icon: '⏭', label: 'Next track', hint: 'a different generated station', run: () => audio.next() },
    { icon: '💬', label: 'Next quote', hint: 'ask the wanderer again', run: () => bus.emit('cmd:quote') },

    // The four pointless things. Same call the panel's buttons make.
    ...Object.entries(MODES).map(([key, m]) => ({
      icon: m.icon,
      label: play.mode === key ? `Stop — ${m.label.toLowerCase()}` : m.label,
      hint: m.hint,
      run: () => play.toggle(key),
    })),
    { icon: '🍬', label: 'Feed the slime', hint: 'it will be delighted', run: () => bus.emit('cmd:feed') },
    { icon: '☕', label: 'Log a coffee', hint: 'we believe you', run: () => bus.emit('cmd:coffee') },

    // Weather.
    ...['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'].map((k) => ({
      icon: { clear: '☀️', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️' }[k],
      label: `Make it ${k}`,
      hint: 'force the weather',
      run: () => bus.emit('cmd:weather', k),
    })),

    // Time.
    ...[
      ['Live', null], ['Dawn', 6], ['Noon', 12], ['Golden hour', 18.5], ['Dusk', 21], ['Midnight', 1],
    ].map(([name, hour]) => ({
      icon: '🕰️',
      label: `Set time: ${name}`,
      hint: hour == null ? 'follow the real clock' : 'freeze the sky here',
      run: () => bus.emit('cmd:time', hour),
    })),

    // Seasons.
    ...SEASON_KEYS.map((k) => ({
      icon: SEASON_ICON[k],
      label: `Make it ${k}`,
      hint: 'force the season',
      run: () => bus.emit('cmd:season', k),
    })),
    {
      icon: '📅', label: 'Season: follow the calendar', hint: 'back to the real date',
      run: () => bus.emit('cmd:season', null),
    },
  ];

  // ── DOM ───────────────────────────────────────────────────────────────────
  const input = el('input.cmd__input', {
    type: 'text',
    placeholder: 'do something useless…',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Command',
    'aria-controls': 'cmdList',
  });

  const list = el('ul.cmd__list', { id: 'cmdList', role: 'listbox' });

  const panel = el('div.cmd__panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Commands' }, [
    el('div.cmd__bar', {}, [el('span.cmd__prompt', { text: '›', 'aria-hidden': 'true' }), input]),
    list,
    el('div.cmd__foot', {}, [
      el('span', { text: '↑↓ move' }),
      el('span', { text: '⏎ run' }),
      el('span', { text: 'esc close' }),
    ]),
  ]);

  const root = el('div.cmd', { id: 'cmd', 'aria-hidden': 'true' }, [panel]);
  document.body.append(root);

  let open = false;
  let items = [];
  let active = 0;

  const render = () => {
    const q = input.value.trim();

    items = commands()
      .map((c) => ({ c, score: fuzzy(q, `${c.label} ${c.hint}`) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.c);

    active = 0;

    list.replaceChildren(
      ...items.map((c, i) =>
        el(
          `li.cmd__item${i === 0 ? '.is-active' : ''}`,
          {
            role: 'option',
            'aria-selected': String(i === 0),
            onclick: () => run(i),
            onpointerenter: () => setActive(i),
          },
          [
            el('span.cmd__ico', { text: c.icon, 'aria-hidden': 'true' }),
            el('span.cmd__label', { text: c.label }),
            el('span.cmd__hint', { text: c.hint }),
          ]
        )
      )
    );

    if (items.length === 0) {
      list.append(el('li.cmd__empty', { text: 'nothing does that. try something else.' }));
    }
  };

  const setActive = (i) => {
    active = clamp(i, 0, items.length - 1);
    [...list.children].forEach((n, j) => {
      n.classList.toggle('is-active', j === active);
      n.setAttribute('aria-selected', String(j === active));
    });
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };

  const run = (i) => {
    const c = items[i ?? active];
    if (!c) return;
    close();
    bus.emit('sfx', 'confirm');
    c.run();
  };

  const show = () => {
    open = true;
    root.dataset.on = 'true';
    root.setAttribute('aria-hidden', 'false');
    input.value = '';
    render();
    // The input must be focused AFTER the element is displayed, or the browser
    // refuses (you cannot focus a `display: none` node).
    requestAnimationFrame(() => input.focus());
    bus.emit('sfx', 'page');
  };

  const close = () => {
    open = false;
    root.dataset.on = 'false';
    root.setAttribute('aria-hidden', 'true');
    input.blur();
  };

  input.addEventListener('input', render);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  // Clicking the backdrop dismisses. Clicking the panel must not.
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
  });

  addEventListener('keydown', (e) => {
    // ⌘K / Ctrl-K opens it. It also TOGGLES, so the same chord gets you out.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open ? close() : show();
      return;
    }
    // "/" is the other universal open-search key — but not while the user is
    // typing into an actual field somewhere.
    if (e.key === '/' && !open) {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      show();
    }
  });

  return { show, close };
}
