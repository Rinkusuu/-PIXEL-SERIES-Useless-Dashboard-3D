/* ============================================================================
   objects.js — the dashboard's panels, as things that have a reason to be
   where they are.

   A wall clock, a corkboard of pinned quotes, a radio on the table and its
   knob for the ambience beds, a jar of fortune cookies, a mirror, a kettle,
   a jar of coins on the shelf, framed certificates, a barometer by the door,
   the newspaper in the mailbox, the telescope on the hill, a fishing rod on
   the dock, and the slime. Each is a small model of 2.5 cm voxels; looking at
   one and pressing E opens its real panel (ui/panels.js). The mapping is a
   plain table, OBJECTS, so ⌘K and the tests read the same list.
   ========================================================================== */

import { Group } from 'three';
import { CABIN, DOCK, blockHeight } from './layout.js';
import { VoxelGrid, color, grain, planks, voxelMesh } from './voxel.js';

const V = 0.025;
const f = CABIN.floorY;

/** Object → the panel it opens (by the panel's title), and what the tooltip says. */
export const OBJECTS = [
  { id: 'clock', panel: 'Local Time', label: 'Wall clock' },
  { id: 'barometer', panel: 'Outside', label: 'Barometer' },
  { id: 'telescope', panel: 'Overhead', label: 'Telescope' },
  { id: 'mailbox', panel: 'Useless Fact', label: 'Read the paper' },
  { id: 'fortune', panel: 'Daily Fortune', label: 'Fortune cookies' },
  { id: 'corkboard', panel: 'Words of Someone', label: 'Corkboard' },
  { id: 'radio', panel: 'Ambient Loop FM', label: 'Radio' },
  { id: 'knobs', panel: 'Ambience', label: 'Ambience knobs' },
  { id: 'mirror', panel: 'Mood', label: 'Mirror' },
  { id: 'kettle', panel: 'Coffee', label: 'Kettle' },
  { id: 'coins', panel: 'Idle Earnings', label: 'Coin jar' },
  { id: 'certificates', panel: 'Tiny Achievements', label: 'Certificates' },
  { id: 'rod', panel: 'Idle Hands', label: 'Fishing rod' },
  { id: 'slime', panel: 'Pixel Pet', label: 'Blip' },
];
// Pockets has no object: it is on you. ⌘K and the pocket book (B) open it.

/** A model built in its own little grid around [x, y, z] (the base centre). */
function model(x, y, z, w, h, d, build) {
  const g = new VoxelGrid([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2], V);
  build(g, x, y, z);
  return voxelMesh(g);
}

const BUILD = {
  // On the north wall, above the door, facing into the room.
  clock: () => model(CABIN.door.x, f + 2.3, CABIN.z0 + 0.15, 0.5, 0.5, 0.1, (g, x, y, z) => {
    g.fill([x - 0.25, y, z - 0.05], [x + 0.25, y + 0.5, z + 0.05], (px, py) => Math.hypot(px - x, py - y - 0.25) < 0.24, grain('#5e4030', 0.3));
    g.fill([x - 0.25, y, z], [x + 0.25, y + 0.5, z + 0.05], (px, py) => Math.hypot(px - x, py - y - 0.25) < 0.19, color('#efe6d2'));
    g.fillBox(x - 0.0125, y + 0.25, z + 0.025, x + 0.0125, y + 0.42, z + 0.05, color('#222228')); // minute hand
    g.fillBox(x, y + 0.2375, z + 0.025, x + 0.12, y + 0.2625, z + 0.05, color('#222228')); // hour hand
  }),

  // Outside, on the porch wall east of the door: a barometer dial over a thermometer.
  barometer: () => model(6.3, f + 1.2, CABIN.z0 - 0.15, 0.3, 0.8, 0.1, (g, x, y, z) => {
    g.fillBox(x - 0.15, y, z - 0.05, x + 0.15, y + 0.8, z + 0.025, planks('#7a5030', 0, 2));
    g.fill([x - 0.15, y + 0.45, z - 0.075], [x + 0.15, y + 0.75, z], (px, py) => Math.hypot(px - x, py - y - 0.6) < 0.12, color('#d8c070'));
    g.fill([x - 0.15, y + 0.45, z - 0.1], [x + 0.15, y + 0.75, z - 0.05], (px, py) => Math.hypot(px - x, py - y - 0.6) < 0.09, color('#f4efe4'));
    g.fillBox(x - 0.0125, y + 0.08, z - 0.075, x + 0.0125, y + 0.4, z - 0.05, color('#e8e8f0'));
    g.fillBox(x - 0.0125, y + 0.08, z - 0.1, x + 0.0125, y + 0.25, z - 0.075, color('#d0503c')); // the mercury
  }),

  // A jar of fortune cookies on the table.
  fortune: () => model(5.45, f + 0.78, 76.85, 0.25, 0.3, 0.25, (g, x, y, z) => {
    g.fill([x - 0.12, y, z - 0.12], [x + 0.12, y + 0.25, z + 0.12], (px, py, pz) => Math.hypot(px - x, pz - z) < 0.11, color('#bfe0e8'));
    g.fill([x - 0.12, y + 0.025, z - 0.12], [x + 0.12, y + 0.15, z + 0.12], (px, py, pz) => Math.hypot(px - x, pz - z) < 0.09, grain('#e8b050', 0.8));
    g.fill([x - 0.12, y + 0.25, z - 0.12], [x + 0.12, y + 0.3, z + 0.12], (px, py, pz) => Math.hypot(px - x, pz - z) < 0.08, color('#a85a4a'));
  }),

  // A corkboard with pinned scraps of paper, on the east wall south of the hearth.
  corkboard: () => model(CABIN.x1 - 0.13, f + 0.9, 80.0, 0.1, 0.9, 1.4, (g, x, y, z) => {
    g.fillBox(x, y, z - 0.7, x + 0.05, y + 0.9, z + 0.7, grain('#5e4030', 0.3));
    g.fillBox(x - 0.025, y + 0.05, z - 0.65, x, y + 0.85, z + 0.65, grain('#c08a5a', 0.9));
    const papers = [[-0.45, 0.45, 0.3, 0.3, '#f4efe4'], [-0.05, 0.5, 0.25, 0.28, '#f0d070'], [0.3, 0.42, 0.28, 0.35, '#f4efe4'], [-0.3, 0.1, 0.35, 0.25, '#c8a0d8'], [0.15, 0.08, 0.3, 0.25, '#f4efe4']];
    for (const [dz, dy, w, h, hex] of papers) {
      g.fillBox(x - 0.05, y + dy, z + dz, x - 0.025, y + dy + h, z + dz + w, grain(hex, 0.15));
      g.fillBox(x - 0.075, y + dy + h - 0.05, z + dz + w / 2 - 0.0125, x - 0.05, y + dy + h - 0.025, z + dz + w / 2 + 0.0125, color('#d0503c')); // the pin
    }
  }),

  // A boxy wooden radio on the table, its speaker grille facing the door.
  radio: () => model(4.6, f + 0.78, 76.35, 0.4, 0.3, 0.2, (g, x, y, z) => {
    g.fillBox(x - 0.2, y, z - 0.1, x + 0.2, y + 0.25, z + 0.1, planks('#9a6a44', 0, 2));
    for (let i = 0; i < 5; i++) g.fillBox(x - 0.17, y + 0.04 + i * 0.04, z - 0.125, x + 0.05, y + 0.06 + i * 0.04, z - 0.1, color('#3a2a20')); // grille
    g.fillBox(x - 0.15, y + 0.25, z - 0.025, x + 0.15, y + 0.3, z + 0.025, color('#3a2a20')); // handle
  }),
  knobs: () => model(4.75, f + 0.82, 76.22, 0.15, 0.2, 0.05, (g, x, y, z) => {
    g.fillBox(x - 0.07, y, z - 0.025, x + 0.07, y + 0.17, z, color('#d8c070'));
    for (const dy of [0.04, 0.11]) g.fillBox(x - 0.025, y + dy, z - 0.05, x + 0.025, y + dy + 0.05, z - 0.025, color('#2a2a30'));
  }),

  // A mirror on the north wall, east of the window.
  mirror: () => model(10.1, f + 1.0, CABIN.z0 + 0.13, 0.9, 1.0, 0.08, (g, x, y, z) => {
    g.fillBox(x - 0.4, y, z - 0.025, x + 0.4, y + 1.0, z + 0.025, grain('#5e4030', 0.3));
    g.fillBox(x - 0.325, y + 0.075, z + 0.025, x + 0.325, y + 0.925, z + 0.05, color('#a8c4d8'));
    g.fillBox(x - 0.25, y + 0.6, z + 0.05, x - 0.1, y + 0.85, z + 0.05, color('#d8eaf4')); // a glint
  }),

  // Kettle and a cup on the kitchen counter.
  kettle: () => model(7.2, f + 0.96, CABIN.z1 - 0.4, 0.6, 0.35, 0.3, (g, x, y, z) => {
    g.fill([x - 0.3, y, z - 0.15], [x, y + 0.28, z + 0.15], (px, py, pz) => Math.hypot(px - x + 0.15, pz - z) < 0.12 - (py - y) * 0.15, grain('#3a4a6a', 0.2));
    g.fillBox(x - 0.19, y + 0.26, z - 0.025, x - 0.11, y + 0.31, z + 0.025, color('#2a2a30')); // lid knob
    g.fillBox(x - 0.04, y + 0.12, z - 0.0125, x + 0.02, y + 0.15, z + 0.0125, grain('#3a4a6a', 0.2)); // spout
    g.fill([x + 0.1, y, z - 0.06], [x + 0.22, y + 0.11, z + 0.06], (px, py, pz) => Math.hypot(px - x - 0.16, pz - z) < 0.05, color('#f4efe4')); // the cup
  }),

  // A jar of coins on the middle shelf.
  coins: () => model(CABIN.x0 + 0.32, f + 1.15, 80.0, 0.25, 0.3, 0.25, (g, x, y, z) => {
    g.fill([x - 0.12, y, z - 0.12], [x + 0.12, y + 0.24, z + 0.12], (px, py, pz) => Math.hypot(px - x, pz - z) < 0.1, color('#c8e0e8'));
    g.fill([x - 0.12, y + 0.025, z - 0.12], [x + 0.12, y + 0.16, z + 0.12], (px, py, pz) => Math.hypot(px - x, pz - z) < 0.08, grain('#e8c050', 1));
    g.fillBox(x - 0.075, y + 0.24, z - 0.075, x + 0.075, y + 0.28, z + 0.075, color('#7a5030'));
  }),

  // Two framed certificates and a tiny trophy shelf, west wall by the lake window.
  certificates: () => model(CABIN.x0 + 0.13, f + 1.0, 75.1, 0.12, 1.1, 1.3, (g, x, y, z) => {
    g.fillBox(x - 0.025, y + 0.2, z - 0.62, x, y + 1.05, z + 0.62, grain('#5e4030', 0.3)); // a plaque behind it all: no gap to miss
    for (const [dz, dy] of [[-0.55, 0.45], [0.05, 0.6]]) {
      g.fillBox(x - 0.025, y + dy, z + dz, x + 0.025, y + dy + 0.4, z + dz + 0.5, color('#c8a040'));
      g.fillBox(x, y + dy + 0.05, z + dz + 0.05, x + 0.05, y + dy + 0.35, z + dz + 0.45, color('#f4efe4'));
      g.fillBox(x + 0.05, y + dy + 0.12, z + dz + 0.2, x + 0.075, y + dy + 0.16, z + dz + 0.3, color('#d0503c')); // a seal
    }
    g.fillBox(x - 0.05, y + 0.25, z - 0.6, x + 0.1, y + 0.275, z + 0.6, grain('#5e4030', 0.3));
    for (const dz of [-0.4, -0.05, 0.3]) g.fillBox(x, y + 0.275, z + dz, x + 0.075, y + 0.4, z + dz + 0.075, color('#e8c050'));
  }),

  // A fishing rod leaning on the last post of the dock.
  rod: () => {
    const x = DOCK.x + DOCK.w / 2 - 0.15;
    const z = DOCK.z1 + 0.5;
    return model(x, DOCK.y, z, 0.3, 2.2, 1.0, (g) => {
      g.fill([x - 0.15, DOCK.y, z - 0.5], [x + 0.15, DOCK.y + 2.2, z + 0.5], (px, py, pz) => {
        const t = (py - DOCK.y) / 2.2;
        return Math.hypot(px - x, pz - (z + 0.4 - t * 0.8)) < 0.02 + (1 - t) * 0.015;
      }, grain('#7a5030', 0.3));
      g.fillBox(x - 0.05, DOCK.y + 0.3, z + 0.2, x + 0.05, DOCK.y + 0.4, z + 0.3, color('#3a3a44')); // the reel
    });
  },

  // Blip, the slime, sitting in the grass near the porch (it learns to follow you in P5).
  slime: () => {
    const x = 13;
    const z = 66;
    const y = blockHeight(x, z);
    return model(x, y, z, 0.6, 0.45, 0.6, (g) => {
      g.fill([x - 0.3, y, z - 0.3], [x + 0.3, y + 0.42, z + 0.3], (px, py, pz) => Math.hypot(px - x, (py - y) * 1.35, pz - z) < 0.29, grain('#6fd07a', 0.25));
      for (const dx of [-0.08, 0.08]) g.fillBox(x + dx - 0.025, y + 0.18, z + 0.24, x + dx + 0.025, y + 0.25, z + 0.29, color('#1a2a20')); // eyes
    });
  },
};

/**
 * Build every object; mailbox and telescope already exist in props.js and are
 * passed in, so they become interactable without being built twice.
 * Returns { group, list: [{ object, label, panel }] }.
 */
export function buildObjects(existing) {
  const group = new Group();
  const list = OBJECTS.map((o) => {
    const object = existing[o.id] ?? BUILD[o.id]();
    if (!existing[o.id]) group.add(object);
    return { ...o, object };
  });
  return { group, list };
}

