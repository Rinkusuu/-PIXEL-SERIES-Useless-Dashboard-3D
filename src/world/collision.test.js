import { describe, expect, it } from 'vitest';
import { Collision, PLAYER } from './collision.js';

// A flat world with a "lake" for x < -10.
const world = () => new Collision({ ground: () => 0, blocked: (x) => x < -10 });
const at = (x, z, y = 0) => ({ x, y, z });

describe('collision', () => {
  it('walks freely on open ground', () => {
    const p = world().move(at(0, 0), 1, 0);
    expect(p.x).toBeCloseTo(1);
  });

  it('stops at a wall and slides along it', () => {
    const c = world();
    c.addSeg(1, -5, 1, 5); // a wall at x = 1
    const p = c.move(at(0, 0), 2, 1);
    expect(p.x).toBeLessThanOrEqual(1 - PLAYER.radius + 1e-6);
    expect(p.z).toBeCloseTo(1, 1); // the sideways part of the move survives
  });

  it('does not tunnel through a thin wall on a long step', () => {
    const c = world();
    c.addSeg(1, -5, 1, 5);
    const p = c.move(at(0, 0), 10, 0);
    expect(p.x).toBeLessThan(1);
  });

  it('walks through a door once its segment is switched off', () => {
    const c = world();
    const door = c.addSeg(1, -1, 1, 1);
    door.on = false;
    expect(c.move(at(0, 0), 3, 0).x).toBeCloseTo(3);
  });

  it('goes round a tree trunk', () => {
    const c = world();
    c.addCircle(2, 0, 0.4);
    const p = c.move(at(0, 0.1), 4, 0);
    expect(Math.hypot(p.x - 2, p.z)).toBeGreaterThanOrEqual(0.4 + PLAYER.radius - 1e-6);
  });

  it('ignores a wall above your head (walking under the loft)', () => {
    const c = world();
    c.addSeg(1, -5, 1, 5, 3, 4); // a rail at loft height
    expect(c.move(at(0, 0), 2, 0).x).toBeCloseTo(2);
  });

  it('will not walk into water, but slides along the shore', () => {
    const p = world().move(at(-9.8, 0), -1, 1);
    expect(p.x).toBeGreaterThanOrEqual(-10);
    expect(p.z).toBeCloseTo(1, 1);
  });

  it('crosses water on a surface (the dock), standing on top of it', () => {
    const c = world();
    c.addSurface(-20, -1, -9, 1, 0.3);
    const p = c.move(at(-9, 0), -5, 0);
    expect(p.x).toBeCloseTo(-14);
    expect(p.y).toBeCloseTo(0.3);
  });

  it('steps up a step but not a cliff', () => {
    const c = new Collision({ ground: (x) => (x > 5 ? 2 : 0), blocked: () => false });
    c.addSurface(1, -1, 3, 1, 0.3); // a porch step
    expect(c.move(at(0, 0), 2, 0).y).toBeCloseTo(0.3);
    const p = c.move(at(4, 0), 2, 0); // terrain jumps 2 m at x = 5
    expect(p.x).toBeLessThan(5);
  });

  it('walks under a surface that is out of reach overhead', () => {
    const c = world();
    c.addSurface(5, -1, 7, 1, 2.3); // the loft, seen from below
    const p = c.move(at(4, 0), 2, 0);
    expect(p.x).toBeCloseTo(6);
    expect(p.y).toBe(0);
  });

  it('climbs a ramp (the ladder) one step at a time', () => {
    const c = world();
    c.addSurface(0, -0.5, 4, 0.5, (x) => x * 0.8); // 0 → 3.2 m
    const p = at(0, 0);
    for (let i = 0; i < 39; i++) c.move(p, 0.1, 0);
    expect(p.y).toBeCloseTo(3.12, 2);
  });

  it('stands on the loft but walks under it from the floor', () => {
    const c = world();
    c.addSurface(0, -2, 4, 2, 2.3);
    expect(c.groundAt(2, 0, 0).y).toBe(0);
    expect(c.groundAt(2, 0, 2.3).y).toBeCloseTo(2.3);
  });
});
