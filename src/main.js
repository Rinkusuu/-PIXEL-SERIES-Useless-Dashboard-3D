/* ============================================================================
   main.js — the composition root.

   The ONLY file that knows about every other file. It builds the scene, mounts
   the widgets, wires the topbar, and starts the single tick. Nothing here
   contains logic that belongs anywhere else; if a rule about how the world
   behaves ends up in this file, it's in the wrong place.
   ========================================================================== */

import './styles/fonts.css'; // self-hosted; must land before anything uses them
import './styles/tokens.css';
import './styles/base.css';
import './styles/panels.css';
import './styles/widgets.css';
import './styles/overlays.css';

import { bus } from './core/bus.js';
import { ticker } from './core/ticker.js';
import { store } from './core/store.js';
import { audio } from './core/audio.js';
import { motion } from './core/motion.js';
import { zen } from './core/zen.js';
import { initAchievements } from './core/achievements.js';
import { initServiceWorker } from './core/net.js';
import { play } from './core/play.js';
import { env } from './core/env.js';
import { $, el } from './core/util.js';

import { Scene } from './classic/Scene.js';
import { sunPosition } from './sky/planets.js';
import { makeSprite } from './ui/pixel.js';
import { SEASON_KEYS, SEASON_ICON } from './sky/season.js';

import { ClockWidget } from './widgets/ClockWidget.js';
import { WeatherWidget } from './widgets/WeatherWidget.js';
import { IssWidget } from './widgets/IssWidget.js';
import { QuoteWidget } from './widgets/QuoteWidget.js';
import { MusicWidget } from './widgets/MusicWidget.js';
import { AmbienceWidget } from './widgets/AmbienceWidget.js';
import { PetWidget } from './widgets/PetWidget.js';
import { IdleWidget } from './widgets/IdleWidget.js';
import { FortuneWidget } from './widgets/FortuneWidget.js';
import { MoodWidget } from './widgets/MoodWidget.js';
import { CoffeeWidget } from './widgets/CoffeeWidget.js';
import { FactsWidget } from './widgets/FactsWidget.js';
import { InventoryWidget } from './widgets/InventoryWidget.js';
import { PlayWidget } from './widgets/PlayWidget.js';
import { AchievementsWidget } from './widgets/AchievementsWidget.js';

import './ui/feedback.js'; // registers the toast listener
import { initZen } from './ui/zen-ui.js';
import { initCommandPalette } from './ui/command.js';
import { savePostcard } from './ui/postcard.js';
import { initWorldSettings } from './ui/world-settings.js';

/* ── The brand sigil ─────────────────────────────────────────────────────────
   A 16×16 leaf-in-a-diamond, drawn in code so there is no logo file to ship.
   -------------------------------------------------------------------------- */
function paintSigil() {
  const cv = $('#brandSigil');
  if (!cv) return;

  const sprite = makeSprite(
    [
      '.....dddd.....',
      '...ddhhhhdd...',
      '..dhh.gg.hhd..',
      '.dh..gGGg..hd.',
      '.dh.gGGGGg.hd.',
      'dh..gGGGGg..hd',
      'dh...gGGg...hd',
      'dh....gg....hd',
      'dh....ss....hd',
      '.dh...ss...hd.',
      '.dh........hd.',
      '..dhh....hhd..',
      '...ddhhhhdd...',
      '.....dddd.....',
    ],
    { d: '#2a2a52', h: '#3f3f74', g: '#5fd6a8', G: '#9ff5c8', s: '#3f7a5c' }
  );

  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(sprite, 1, 1);
}

/* ── Widgets ─────────────────────────────────────────────────────────────────
   Each one is mounted in isolation. A widget that throws in its constructor or
   its body() must not be able to take the other thirteen down with it — that
   failure mode cost us an entire dashboard once, and once was enough.
   -------------------------------------------------------------------------- */
function mountWidgets() {
  const grid = $('#grid');

  const widgets = [
    new ClockWidget(),
    new WeatherWidget(),
    new QuoteWidget(),
    new IssWidget(),
    new MusicWidget(),
    new AmbienceWidget(),
    new PetWidget(),
    new PlayWidget(),
    new IdleWidget(),
    new FortuneWidget(),
    new MoodWidget(),
    new CoffeeWidget(),
    new FactsWidget(),
    new InventoryWidget(),
    new AchievementsWidget(),
  ];

  for (const w of widgets) {
    try {
      w.mount(grid);
    } catch (err) {
      console.error(`[widget] ${w.constructor.name} failed to mount:`, err);
    }
  }

  return widgets;
}

/* ── Topbar ──────────────────────────────────────────────────────────────────
   Three buttons live in index.html (sound, motion, time). The rest are appended
   here. Every one of them calls exactly the same function the command palette
   calls — there is no second implementation to drift.
   -------------------------------------------------------------------------- */
function tbtn({ emoji, text, title, ghost = false, onClick }) {
  const ico = el('span.tbtn__emoji', { text: emoji, 'aria-hidden': 'true' });
  const txt = el('span.tbtn__txt', { text });

  const node = el(`button.tbtn${ghost ? '.tbtn--ghost' : ''}`, {
    type: 'button',
    title,
    onclick: () => {
      bus.emit('sfx', 'click');
      onClick(node, { ico, txt });
    },
    onpointerenter: () => bus.emit('sfx', 'hover'),
  }, [ico, txt]);

  return { node, ico, txt };
}

function wireTopbar({ mode, palette, postcard: savePostcardNow, settings }) {
  const tools = $('.topbar__tools');

  /* ── Sound ─────────────────────────────────────────────────────────────── */
  const btnSound = $('#btnSound');
  const syncSound = () => btnSound.setAttribute('aria-pressed', String(audio.enabled));
  btnSound.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled);
    syncSound();
  });
  syncSound();

  /* ── Motion ────────────────────────────────────────────────────────────── */
  const btnMotion = $('#btnMotion');
  const syncMotion = () => btnMotion.setAttribute('aria-pressed', String(motion.enabled));
  btnMotion.addEventListener('click', () => {
    motion.toggle();
    syncMotion();
  });
  syncMotion();

  /* ── Time ──────────────────────────────────────────────────────────────── */
  const TIMES = [
    ['Live', null], ['Dawn', 6], ['Noon', 12],
    ['Golden', 18.5], ['Dusk', 21], ['Midnight', 1],
  ];
  const btnTimeTxt = $('#btnTimeTxt');

  const setTime = (hour) => {
    store.set('timeOverride', hour);
    const found = TIMES.find(([, h]) => h === hour);
    btnTimeTxt.textContent = found ? found[0] : `${String(Math.floor(hour)).padStart(2, '0')}:00`;
  };

  $('#btnTime').addEventListener('click', () => {
    const now = store.get('timeOverride');
    const i = TIMES.findIndex(([, h]) => h === now);
    setTime(TIMES[(i + 1) % TIMES.length][1]);
    bus.emit('sfx', 'click');
  });
  setTime(store.get('timeOverride'));

  // The palette drives the same function, so the label stays in sync for free.
  bus.on('cmd:time', setTime);

  /* ── Season ────────────────────────────────────────────────────────────── */
  /* Hold the element refs directly. An id lookup here once ran BEFORE the button
     was appended, returned null, threw, and took the command palette and the
     ticker down with it. You do not need to search the document for a node you
     are holding in your hand. */
  const season = tbtn({
    emoji: '🍃',
    text: 'Season',
    title: 'Cycle the season (it is not the real calendar anymore)',
    onClick: () => {
      const now = store.get('seasonOverride');
      const i = SEASON_KEYS.indexOf(now);
      // …→ spring → summer → autumn → winter → real calendar → …
      const next = i === SEASON_KEYS.length - 1 ? null : SEASON_KEYS[i + 1];
      setSeason(next);
    },
  });

  const setSeason = (key) => {
    store.set('seasonOverride', key);
    bus.emit('season:override', key);
    season.ico.textContent = key ? SEASON_ICON[key] : '🍃';
    season.txt.textContent = key ? key[0].toUpperCase() + key.slice(1) : 'Season';
  };

  bus.on('cmd:season', setSeason);

  /* ── Glass ─────────────────────────────────────────────────────────────────
     Zen already hides the dashboard completely, and Idle Hands sweeps it aside
     while you play — so why a third thing?

     Because both of those take the panels AWAY, and the reason you want to see
     the world is usually that you are still using them. You want to know if it
     is raining while you read the fortune. This doesn't remove the dashboard, it
     makes it a window: the glass goes from frosted to clear, the world comes up
     through it, and the panel under your cursor frosts back over the instant you
     go anywhere near it. Nothing is hidden and nothing is unreadable.

     tokens.css sets the frosting at 86% and calls it "the legibility floor",
     for a real reason: below it, the grass moving behind the glass changes the
     contrast under the text from second to second. Clear mode goes far below
     that floor — so it pays for it, in the two ways that comment implies. The
     panel you touch comes straight back to full frost, and everything still
     showing gets a hard shadow under its text, which is what keeps a word legible
     over a bright noon sky and a dark lake at the same time. */
  const setGlass = (on) => {
    store.set('glass', on);
    document.documentElement.toggleAttribute('data-glass', on);
    glassBtn.node.setAttribute('aria-pressed', String(on));
    glassBtn.txt.textContent = on ? 'Frost' : 'Glass';
  };

  const glassBtn = tbtn({
    emoji: '🪟',
    text: 'Glass',
    title: 'Clear the glass and let the world through the dashboard',
    onClick: () => {
      setGlass(!store.get('glass'));
      bus.emit('sfx', 'page');
    },
  });

  bus.on('cmd:glass', () => setGlass(!store.get('glass')));

  /* ── Zen ───────────────────────────────────────────────────────────────── */
  const zenBtn = tbtn({
    emoji: '🧘',
    text: 'Zen',
    title: 'Hide everything and breathe',
    onClick: () => zen.toggle(),
  });

  /* ── Postcard ──────────────────────────────────────────────────────────── */
  const postcard = tbtn({
    emoji: '📮',
    text: 'Postcard',
    title: 'Save the world as a PNG',
    onClick: savePostcardNow,
  });

  /* ── Mode ──────────────────────────────────────────────────────────────────
     Classic and the walkable world are two renderers over one store, so
     switching is just remembering the choice and reloading — far simpler and
     safer than tearing one renderer down inside a live page. */
  const modeBtn = tbtn({
    emoji: mode === '3d' ? '🖼️' : '🚪',
    text: mode === '3d' ? 'Classic' : 'Walk',
    title: mode === '3d' ? 'Back to the classic dashboard' : 'Step into the world',
    onClick: () => switchMode(mode === '3d' ? 'classic' : '3d'),
  });

  /* ── ⌘K ────────────────────────────────────────────────────────────────── */
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const paletteBtn = tbtn({
    emoji: '⌘',
    text: mac ? '⌘K' : 'Ctrl K',
    title: 'Everything, one keystroke away',
    ghost: true,
    onClick: () => palette.show(),
  });

  const worldBtn = tbtn({
    emoji: '⚙️',
    text: 'World',
    title: 'Field of view, head bob, snap turn, quality',
    onClick: () => settings?.toggle(),
  });

  // Glass has nothing to clear in the world (the panels only appear when you
  // open them), so 3D leaves it out; Postcard there means photo mode.
  tools.append(
    ...(mode === '3d' ? [season.node, zenBtn.node, postcard.node, worldBtn.node] : [season.node, glassBtn.node, zenBtn.node, postcard.node, modeBtn.node]),
    paletteBtn.node,
  );

  // Only now that the buttons exist can we paint their initial state.
  setSeason(store.get('seasonOverride'));
  setGlass(store.get('glass'));
}

/* ── Mode ────────────────────────────────────────────────────────────────────
   'auto' walks you into the world whenever the browser can draw it. Without
   WebGL2 — or if you chose it — you get the classic dashboard, intact. Asking
   for 3D on a browser that can't do it is answered with Classic and a word.
   -------------------------------------------------------------------------- */
function hasWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function pickMode() {
  const wanted = store.get('mode');
  if (wanted === 'classic') return 'classic';
  if (hasWebGL2()) return '3d';
  if (wanted === '3d') {
    bus.emit('toast', { icon: '🖼️', text: 'This browser cannot draw the world. Here is the classic one.', ms: 6000 });
  }
  return 'classic';
}

function switchMode(next) {
  store.set('mode', next);
  location.reload(); // pagehide flushes the store
}

/* three.js and the world load lazily: Classic, and the shell around both, must
   stay as fast to open as they were before there was a world at all. */
function startWorld() {
  import('./world/index.js')
    .then(({ startWorld: start }) => start($('#world3d')))
    .catch((err) => {
      // Not remembered as a choice: next visit tries the world again.
      console.error('[world] failed to start:', err);
      document.documentElement.dataset.mode = 'classic';
      new Scene($('#scene'), $('#glow'));
      bus.emit('toast', { icon: '🖼️', text: 'The world would not open. Classic it is, for now.', ms: 6000 });
    });
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
function boot() {
  /* First, before anything else: make the app able to exist without a network.
     Everything below this line already worked offline — the world, the sounds,
     ten of the widgets. It just couldn't be OPENED offline, which made all of
     that academic. */
  initServiceWorker();

  paintSigil();

  const mode = pickMode();
  document.documentElement.dataset.mode = mode;

  if (mode === 'classic') new Scene($('#scene'), $('#glow'));
  else startWorld();

  const postcard = () => {
    if (mode !== 'classic') return bus.emit('photo'); // in the world, the postcard is a photo you frame yourself
    const s = env.state;
    savePostcard($('#scene'), $('#glow'), {
      caption: s.pal.caption,
      place: env.place,
      season: s.season.name,
      weather: s.pal.weather,
      time: `${String(Math.floor(s.hour)).padStart(2, '0')}:00`,
    });
  };

  /* ── The caption under the title follows the sky ─────────────────────────── */
  const caption = $('#sceneCaption');
  let golden = false;

  bus.on('phase', (pal) => {
    // Golden hour outranks the phase caption while it's actually happening.
    if (caption && !golden) caption.textContent = pal.caption;
  });

  /* GOLDEN HOUR, AND WHY IT IS ALLOWED TO BE HERE.

     The palette has had a `golden hour` phase since the first commit — and it
     fires at 18:36. Every day. At every latitude. In every season. In Reykjavík
     in June that is the middle of the afternoon; in Jakarta the sun set half an
     hour ago. It was a clock pretending to be a light.

     Now it's the light. The sun's real altitude, from the same Kepler maths the
     planets use, for your latitude, today: golden hour is the band from −4° to
     +6°, and that is not a convention, it is where the atmosphere is thick
     enough to strip the blue out of sunlight and hand you back the gold.

     And it ONLY ever says so while it is happening. No countdown, no "in 20
     minutes", no planning your evening around it. That line was the one thing
     that would have made this dashboard useful, and useful is the one thing it
     has promised never to be. This tells you to look out of the window, the way
     the ISS panel tells you to look up. It does not tell you when to. */
  bus.on('second', () => {
    if (!caption) return;

    const hour = env.hour;
    const d = new Date();
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    const sun = sunPosition(d, env.lat, env.lon);

    const now = sun.alt > -4 && sun.alt < 6;
    if (now === golden) return; // the DOM only hears about it when it changes
    golden = now;

    caption.textContent = now
      ? sun.ha < 0
        ? 'the light has turned gold, and the day has not even started.'
        : 'golden hour. everything is forgiven.'
      : env.state.pal.caption;
  });

  mountWidgets();

  initAchievements();
  initZen();
  const settings = mode === '3d' ? initWorldSettings({ switchMode }) : null;
  const palette = initCommandPalette({ mode, postcard, switchMode, settings });

  wireTopbar({ mode, palette, postcard, settings });

  // FPS, once a second. Sixty times a second would cost more than it measures.
  const fps = $('#fpsReadout');
  let tier = '';
  bus.on('world:tier', (t) => (tier = ` · ${t}`));
  bus.on('second', () => {
    if (fps) fps.textContent = `${Math.round(ticker.fps)} fps${tier}`;
  });

  /* Losing the network is announced exactly once, quietly, and then the world
     handles it. No banner, no modal, no retry button — the fog does the talking
     (see FogLayer) and the panels each degrade on their own terms. */
  bus.on('net', ({ online }) => {
    bus.emit('toast', online
      ? { icon: '📶', text: 'Back on the grid.' }
      : { icon: '📴', text: 'No signal. The world carries on.', ms: 5000 });
  });

  // Escape leaves whatever you were doing with your hands.
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && play.active && !zen.active) play.set(null);
  });

  /* Zen and Idle Hands both clear the dashboard to show you the world, and they
     would happily do it at the same time — leaving a breathing ring floating over
     a man fishing. Zen wins: you went there to stop doing things. */
  bus.on('zen', ({ active }) => {
    if (active) play.set(null);
  });

  store.set('visits', (store.get('visits') || 0) + 1);
  if (!store.get('firstSeen')) store.set('firstSeen', Date.now());

  ticker.start();

  // Lift the veil once there is actually a world behind it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const veil = $('#boot');
      if (veil) veil.dataset.done = 'true';
    });
  });
}

boot();
