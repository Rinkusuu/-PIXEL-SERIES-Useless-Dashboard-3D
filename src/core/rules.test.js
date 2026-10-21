import { beforeEach, describe, expect, it, vi } from 'vitest';

// The rules write to the store and the bus; give them a minimal browser.
function fakeBrowser() {
  const data = new Map();
  vi.stubGlobal('localStorage', { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) });
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('document', { hidden: false });
}

let fishing, stones, book, store, bus;
beforeEach(async () => {
  fakeBrowser();
  vi.resetModules();
  fishing = await import('./fishing.js');
  stones = await import('./stones.js');
  book = (await import('./constellations.js')).book;
  store = (await import('./store.js')).store;
  bus = (await import('./bus.js')).bus;
});

describe('fishing', () => {
  it('bites with probability dt / MEAN_WAIT, every frame, with no countdown', () => {
    const dt = 1 / 60;
    expect(fishing.bites(dt, () => dt / fishing.MEAN_WAIT - 1e-9)).toBe(true);
    expect(fishing.bites(dt, () => dt / fishing.MEAN_WAIT + 1e-9)).toBe(false);
  });

  it('never hands you a night fish in daylight', () => {
    for (let r = 0; r < 1; r += 0.01) expect(fishing.rollCatch(false, () => r).night).toBeFalsy();
  });

  it('can, at night, hand you a fallen star', () => {
    const seen = new Set();
    for (let r = 0; r < 1; r += 0.002) seen.add(fishing.rollCatch(true, () => r).id);
    expect(seen.has('star')).toBe(true);
  });

  it('keeps every catch, boots included', () => {
    const coins = [];
    bus.on('coins', (n) => coins.push(n));
    fishing.landCatch(fishing.FISH.find((f) => f.id === 'boot'));
    fishing.landCatch(fishing.FISH.find((f) => f.id === 'boot'));
    expect(store.get('catches')).toEqual(['boot', 'boot']);
    expect(store.get('achievements')).toContain('boot');
    expect(coins).toEqual([1, 1]);
  });
});

describe('skipping stones', () => {
  const stone = (vx, vh) => ({ vx, vy: 0, vh, bounce: 0.5, drag: 0.8, skips: 0 });

  it('digs in when it comes down too steep', () => {
    expect(stones.contact(stone(10, -5), 3)).toBe('sink'); // atan(5/10) ≈ 0.46 rad
  });

  it('sinks when it is too slow to plane, however flat', () => {
    expect(stones.contact(stone(2, -0.1), 3)).toBe('sink');
  });

  it('skips when flat and fast, and every skip costs speed', () => {
    const s = stone(12, -2); // atan(2/12) ≈ 0.165 rad, under BITE_ANGLE
    expect(stones.contact(s, 3)).toBe('skip');
    expect(s.skips).toBe(1);
    expect(s.vh).toBeCloseTo(1); // half the drop comes back as lift
    expect(s.vx).toBeCloseTo(9.6);
  });

  it('records a new best, and only a better throw replaces it', () => {
    stones.finishThrow(4);
    stones.finishThrow(2);
    expect(store.get('skips')).toBe(4);
    expect(store.get('achievements')).toContain('skipper');
    expect(store.get('achievements')).not.toContain('skipper5');
  });
});

describe('the constellation book', () => {
  it('discards a single star: a line needs two', () => {
    book.add(57);
    book.commit();
    expect(store.get('stars')).toEqual([]);
  });

  it('closes a constellation when the last star is picked again, and saves star indices', () => {
    book.add(57);
    book.add(12);
    book.add(12);
    expect(store.get('stars')).toHaveLength(1);
    expect(store.get('stars')[0].pts).toEqual([57, 12]);
  });

  it('names, forgets and clears through the bus, as the panel does', () => {
    book.add(1);
    book.add(2);
    book.commit();
    bus.emit('stars:name', { index: 0, name: '  The Ladle, long name here  ' });
    expect(store.get('stars')[0].name).toBe('The Ladle, long');
    bus.emit('stars:forget', 0);
    expect(store.get('stars')).toEqual([]);
  });

  it('counts wishes, and grants nothing else', () => {
    book.wish();
    book.wish();
    expect(store.get('wishes')).toBe(2);
    expect(store.get('coins')).toBe(0);
  });
});
