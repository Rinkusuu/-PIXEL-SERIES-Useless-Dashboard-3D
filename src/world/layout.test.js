import { describe, expect, it } from 'vitest';
import {
  CABIN, DOCK, BRIDGE, HILL, ISLAND, LAKE, SPOTS, WALK_RADIUS, WATER_Y,
  heightAt, isWater, forestDensity, grassDensity, pathDist, lakeE,
} from './layout.js';

describe('world layout', () => {
  it('puts water in the lake and dry land at the cabin', () => {
    expect(heightAt(LAKE.x, LAKE.z)).toBeLessThan(WATER_Y - 2);
    expect(isWater(LAKE.x, LAKE.z)).toBe(true);
    expect(Math.abs(heightAt(5, 70) - CABIN.groundY)).toBeLessThan(0.15); // the path wears it a little
    expect(isWater(5, 70)).toBe(false);
  });

  it('raises the island out of the lake', () => {
    expect(heightAt(ISLAND.x, ISLAND.z)).toBeGreaterThan(WATER_Y + 1);
  });

  it('makes the hill the highest walkable place', () => {
    const top = heightAt(HILL.x, HILL.z);
    expect(top).toBeGreaterThan(12);
    for (const [x, z] of [[0, 0], [5, 75], [-40, 40], [25, -95]]) expect(heightAt(x, z)).toBeLessThan(top);
  });

  it('runs the dock out over real water', () => {
    expect(isWater(DOCK.x, DOCK.z1)).toBe(true); // the far end is over the lake
    expect(isWater(DOCK.x, DOCK.z0 + 2)).toBe(false); // the near end is on the shore
  });

  it('bridges the stream where the path crosses it', () => {
    expect(isWater(BRIDGE.x, BRIDGE.z)).toBe(true);
    expect(pathDist(BRIDGE.x, BRIDGE.z)).toBeLessThan(0.01);
  });

  it('keeps trees off the path, out of the lake, and clear of the cabin and hilltop', () => {
    expect(forestDensity(12, 52)).toBe(0);
    expect(forestDensity(LAKE.x, LAKE.z)).toBe(0);
    expect(forestDensity(5, 78)).toBe(0);
    expect(forestDensity(HILL.x, HILL.z)).toBe(0);
    expect(forestDensity(-20, -100)).toBeGreaterThan(0.5); // the northern forest exists
  });

  it('grows grass in the meadow but not on the path or in the water', () => {
    expect(grassDensity(30, 50)).toBeGreaterThan(0.2);
    expect(grassDensity(12, 52)).toBe(0);
    expect(grassDensity(LAKE.x, LAKE.z)).toBe(0);
  });

  it('keeps every named spot inside the walkable disc and on dry land', () => {
    for (const [name, s] of Object.entries(SPOTS)) {
      expect(Math.hypot(s.x, s.z), name).toBeLessThan(WALK_RADIUS);
      expect(isWater(s.x, s.z), name).toBe(false);
    }
  });

  it('puts the stones on the shore', () => {
    expect(lakeE(SPOTS.stones.x, SPOTS.stones.z)).toBeGreaterThan(1);
    expect(lakeE(SPOTS.stones.x, SPOTS.stones.z)).toBeLessThan(1.15);
  });
});
