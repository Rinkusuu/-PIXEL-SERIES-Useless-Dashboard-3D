import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { OBJECTS } from './objects.js';

// The widget titles, read from the source: the panels an object can open.
const dir = new URL('../widgets/', import.meta.url);
const titles = readdirSync(dir)
  .filter((f) => f.endsWith('Widget.js') && f !== 'Widget.js')
  .map((f) => readFileSync(new URL(f, dir), 'utf8').match(/title: '([^']+)'/)?.[1])
  .filter(Boolean);

describe('objects → panels', () => {
  it('opens only panels that exist', () => {
    for (const o of OBJECTS) expect(titles, o.id).toContain(o.panel);
  });

  it('gives every panel a place in the world, except Pockets (which is on you)', () => {
    const placed = new Set(OBJECTS.map((o) => o.panel));
    expect(titles.filter((t) => !placed.has(t))).toEqual(['Pockets']);
  });

  it('never maps two objects to the same panel', () => {
    expect(new Set(OBJECTS.map((o) => o.panel)).size).toBe(OBJECTS.length);
  });
});
