import { describe, expect, it } from 'vitest';
import { aimPick, castPoint } from './aim.js';

const n = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

describe('aimPick', () => {
  const forward = n(0, 0, -1);
  it('picks the direction nearest the centre dot', () => {
    expect(aimPick(forward, [n(0.05, 0, -1), n(0.01, 0, -1)], 5)).toBe(1);
  });
  it('picks nothing outside the cone', () => {
    expect(aimPick(forward, [n(0.2, 0, -1)], 5)).toBe(-1); // ~11°
  });
  it('lets a veto skip a candidate', () => {
    expect(aimPick(forward, [n(0.01, 0, -1), n(0.03, 0, -1)], 5, (i) => i !== 0)).toBe(1);
  });
});

describe('castPoint', () => {
  it('casts north along yaw 0, further with more charge', () => {
    const soft = castPoint(0, 0, 0, 0);
    const hard = castPoint(0, 0, 0, 1);
    expect(soft.z).toBeCloseTo(-3);
    expect(hard.z).toBeCloseTo(-16);
    expect(hard.x).toBeCloseTo(0);
  });
  it('turns west with positive yaw', () => {
    expect(castPoint(0, 0, Math.PI / 2, 1).x).toBeCloseTo(-16);
  });
});
