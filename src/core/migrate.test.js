import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, STORE_VERSION } from './migrate.js';

// Minimal browser surface for store.js: localStorage plus the page events it flushes on.
function fakeBrowser(seed = {}) {
  const data = new Map(Object.entries(seed));
  const handlers = {};
  vi.stubGlobal('localStorage', {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  });
  vi.stubGlobal('addEventListener', (ev, fn) => (handlers[ev] = fn));
  vi.stubGlobal('document', { hidden: false });
  return { data, flush: () => handlers.pagehide() };
}

async function freshStore() {
  vi.resetModules();
  return (await import('./store.js')).store;
}

const V1 = {
  sound: true, volume: 0.4, coins: 312.6, mood: 71,
  mix: { rain: 0.5, wind: 0, crickets: 0.2, hearth: 0 },
  achievements: ['arrive', 'angler', 'angler'],
  catches: ['carp', 'carp', 'boot'],
  stars: [
    { name: 'Ladle', pts: [57, 12, 190], at: 1760000000000 },
    { name: 'Lonely', pts: [3, 999] },
  ],
  coffeeDay: '2026-10-19', seasonsSeen: ['autumn'], glass: true,
  timeOverride: 18.5, someFutureKey: { kept: true },
};

describe('migrate (pure)', () => {
  let DEFAULTS;
  beforeEach(async () => {
    fakeBrowser();
    DEFAULTS = (await freshStore()).all(); // a fresh store IS the defaults
  });

  it('brings every v1 value across', () => {
    const s = migrate(V1, DEFAULTS);
    expect(s.v).toBe(STORE_VERSION);
    expect(s.coins).toBe(312.6);
    expect(s.mood).toBe(71);
    expect(s.sound).toBe(true);
    expect(s.mix).toEqual(V1.mix);
    expect(s.timeOverride).toBe(18.5);
    expect(s.glass).toBe(true);
  });

  it('keeps keys it has never heard of', () => {
    const s = migrate(V1, DEFAULTS);
    expect(s.coffeeDay).toBe('2026-10-19');
    expect(s.seasonsSeen).toEqual(['autumn']);
    expect(s.someFutureKey).toEqual({ kept: true });
  });

  it('dedupes achievements but keeps every fish', () => {
    const s = migrate(V1, DEFAULTS);
    expect(s.achievements).toEqual(['arrive', 'angler']);
    expect(s.catches).toEqual(['carp', 'carp', 'boot']);
  });

  it('drops a bad star, not the constellation, and a one-star line entirely', () => {
    const s = migrate(V1, DEFAULTS);
    expect(s.stars).toEqual([{ name: 'Ladle', pts: [57, 12], at: 1760000000000 }]);
  });

  it('adds the 3D state with defaults', () => {
    const s = migrate(V1, DEFAULTS);
    expect(s.mode).toBe('auto');
    expect(s.player).toBeNull();
    expect(s.view).toEqual(DEFAULTS.view);
  });

  it('is idempotent', () => {
    const once = migrate(V1, DEFAULTS);
    expect(migrate(once, DEFAULTS)).toEqual(once);
  });

  it('repairs nonsense instead of trusting it', () => {
    const s = migrate({ coins: -5, volume: 7, mood: 'happy', mix: null, stars: 'lots', mode: 'vr' }, DEFAULTS);
    expect(s.coins).toBe(0);
    expect(s.volume).toBe(1);
    expect(s.mood).toBe(DEFAULTS.mood);
    expect(s.mix).toEqual(DEFAULTS.mix);
    expect(s.stars).toEqual([]);
    expect(s.mode).toBe('auto');
  });

  it('turns garbage into defaults', () => {
    for (const junk of [null, undefined, 42, 'x', []]) {
      expect(migrate(junk, DEFAULTS)).toEqual(DEFAULTS);
    }
  });

  it('never mutates the defaults it was given', () => {
    const before = structuredClone(DEFAULTS);
    const s = migrate(V1, DEFAULTS);
    s.mix.rain = 0.99;
    s.achievements.push('x');
    expect(DEFAULTS).toEqual(before);
  });
});

describe('store (v1 → v2 on disk)', () => {
  it('reads uad.v1, writes uad.v2, and leaves uad.v1 alone', async () => {
    const raw = JSON.stringify(V1);
    const b = fakeBrowser({ 'uad.v1': raw });
    const store = await freshStore();

    expect(store.get('coins')).toBe(312.6);
    expect(store.get('stars')).toHaveLength(1);

    store.set('coins', 400);
    b.flush();

    expect(b.data.get('uad.v1')).toBe(raw);
    const v2 = JSON.parse(b.data.get('uad.v2'));
    expect(v2.v).toBe(2);
    expect(v2.coins).toBe(400);
    expect(v2.coffeeDay).toBe('2026-10-19');
  });

  it('prefers uad.v2 once it exists', async () => {
    fakeBrowser({ 'uad.v1': JSON.stringify({ coins: 1 }), 'uad.v2': JSON.stringify({ v: 2, coins: 2 }) });
    expect((await freshStore()).get('coins')).toBe(2);
  });

  it('boots on corrupt JSON', async () => {
    fakeBrowser({ 'uad.v2': '{nope' });
    const store = await freshStore();
    expect(store.get('coins')).toBe(0);
  });

  it('does not let live state alias the defaults', async () => {
    fakeBrowser();
    const store = await freshStore();
    store.get('achievements').push('leak');
    store.reset();
    expect(store.get('achievements')).toEqual([]);
  });
});
