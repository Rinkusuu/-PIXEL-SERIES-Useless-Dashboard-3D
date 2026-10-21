import { describe, expect, it } from 'vitest';
import { orderByBearing, step } from './tabcycle.js';

// Facing north (yaw 0 looks along −z). West is your left.
const pos = { x: 0, z: 0 };
const left = { id: 'left', x: -3, z: -3 };
const ahead = { id: 'ahead', x: 0, z: -4 };
const right = { id: 'right', x: 3, z: -3 };
const far = { id: 'far', x: 0, z: -30 };

describe('Tab order', () => {
  it('runs from your left to your right', () => {
    expect(orderByBearing([right, ahead, left], pos, 0).map((i) => i.id)).toEqual(['left', 'ahead', 'right']);
  });

  it('leaves out what is out of reach', () => {
    expect(orderByBearing([far, ahead], pos, 0).map((i) => i.id)).toEqual(['ahead']);
  });

  it('turns with you', () => {
    // Facing west (yaw +π/2): what was on the left (north-west) is now ahead-right… and north is on your right.
    const ids = orderByBearing([left, right], pos, Math.PI / 2).map((i) => i.id);
    expect(ids).toEqual(['left', 'right']);
  });

  it('wraps forwards and backwards', () => {
    expect(step(-1, 3, false)).toBe(0);
    expect(step(-1, 3, true)).toBe(2);
    expect(step(2, 3, false)).toBe(0);
    expect(step(0, 3, true)).toBe(2);
    expect(step(-1, 0, false)).toBe(-1);
  });
});
