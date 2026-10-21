import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
vi.stubGlobal('addEventListener', () => {});
vi.stubGlobal('document', { hidden: false });
vi.stubGlobal('setTimeout', () => 0); // thunder is not under test

const { Weather } = await import('./weather3d.js');

/** Run a storm for `seconds` and return the times each flash started. */
function storm(seconds, motion = 1) {
  const w = new Weather({ add: () => {} }, { spawn: () => {} });
  const env = { motion };
  const dt = 1 / 120;
  const starts = [];
  let lit = false;
  for (let t = 0; t < seconds; t += dt) {
    w._lightning(true, env, dt);
    const now = w.flash > 0.3;
    if (now && !lit) starts.push(t);
    lit = now;
  }
  return starts;
}

describe('lightning (photosensitivity, spec §8)', () => {
  it('never flashes more than three times in any one second', () => {
    const starts = storm(600);
    expect(starts.length).toBeGreaterThan(20); // it does storm
    for (let i = 0; i < starts.length; i++) {
      expect(starts.filter((s) => s >= starts[i] && s < starts[i] + 1).length).toBeLessThanOrEqual(3);
    }
  });

  it('does not flash at all under reduced motion', () => {
    expect(storm(120, 0)).toEqual([]);
  });
});
