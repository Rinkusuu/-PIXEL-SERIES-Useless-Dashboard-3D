import { describe, expect, it } from 'vitest';
import { VoxelGrid, color, mesh } from './voxel.js';

const quads = (g) => g.attributes.position.count / 6;

describe('voxel mesher', () => {
  it('meshes a lone voxel as six quads', () => {
    const g = new VoxelGrid([0, 0, 0], [1, 1, 1], 1);
    g.set(0, 0, 0, color('#ff0000'));
    expect(quads(mesh(g))).toBe(6);
  });

  it('merges same-colour neighbours and culls the face between them', () => {
    const g = new VoxelGrid([0, 0, 0], [2, 1, 1], 1);
    g.fillBox(0, 0, 0, 2, 1, 1, color('#00ff00'));
    expect(quads(mesh(g))).toBe(6); // a 2×1×1 bar is still one quad per side
  });

  it('does not merge different colours', () => {
    const g = new VoxelGrid([0, 0, 0], [2, 1, 1], 1);
    g.set(0, 0, 0, color('#0000ff'));
    g.set(1, 0, 0, color('#ffff00'));
    expect(quads(mesh(g))).toBe(10); // 2 × 5 outward faces
  });

  it('darkens a vertex tucked into a corner (ambient occlusion)', () => {
    // An L of three voxels on a floor: the floor voxel's top face touches a wall.
    const g = new VoxelGrid([0, 0, 0], [2, 2, 1], 1);
    const c = color('#ffffff');
    g.set(0, 0, 0, c);
    g.set(1, 0, 0, c);
    g.set(0, 1, 0, c);
    const geo = mesh(g);
    const p = geo.attributes.position;
    const col = geo.attributes.color;
    const n = geo.attributes.normal;
    // Top face of voxel (1,0,0): vertices at y = 1. The one at x = 1 (against the wall) is darker than at x = 2.
    let wall = 1, open = 0;
    for (let i = 0; i < p.count; i++) {
      if (n.getY(i) !== 1 || p.getY(i) !== 1) continue;
      if (p.getX(i) === 1) wall = Math.min(wall, col.getX(i));
      if (p.getX(i) === 2) open = Math.max(open, col.getX(i));
    }
    expect(wall).toBeLessThan(open);
  });

  it('carves with paint 0 and snaps boxes to the grid', () => {
    const g = new VoxelGrid([0, 0, 0], [1, 1, 1], 0.1);
    g.fillBox(0, 0, 0, 1, 1, 1, color('#888888'));
    g.fillBox(0.4, 0, 0, 0.6, 0.5, 1, 0); // a doorway
    expect(g.get(4, 2, 5)).toBe(0);
    expect(g.get(3, 2, 5)).not.toBe(0);
    expect(g.dims).toEqual([10, 10, 10]);
  });

  it('gives a box thinner than a voxel one voxel, so a rail never vanishes', () => {
    const g = new VoxelGrid([0, 0, 0], [1, 1, 1], 0.1);
    g.fillBox(0.5, 0.5, 0, 0.53, 0.53, 1, color('#444444'));
    expect(g.get(5, 5, 3)).not.toBe(0);
  });
});
