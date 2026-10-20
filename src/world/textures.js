/* ============================================================================
   textures.js — every surface texture in the world, drawn from ASCII art.

   The same rule as ui/pixel.js: no image files. Each texture is 16×16, made
   once with makeSprite, and sampled NEAREST so a texel is a hard square. The
   texels stay close to white: the material colour and the palette's light do
   the colouring, and these only add grain. (Mid-grey textures darkened every
   surface by a third — the first cabin was a cave at noon.)
   ========================================================================== */

import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { makeSprite } from '../ui/pixel.js';

const ART = {
  // Speckled ground: grass where the vertex colour is green, dirt where it is brown.
  ground: {
    rows: [
      'aabaaaacaaabaaaa', 'aaaaabaaaaaaacaa', 'acaaaaaabaaaaaaa', 'aaaabaaaaacaaaba',
      'aaaaaaacaaaaaaaa', 'abaaaaaaaaabaaac', 'aaaacaaaabaaaaaa', 'aaaaaaaaaaaaabaa',
      'aacaaabaaaacaaaa', 'aaaaaaaaaaaaaaaa', 'abaaaaacaaaabaaa', 'aaaaabaaaaaaaaca',
      'aaacaaaaabaaaaaa', 'aaaaaaaaaaaacaaa', 'acaaaabaaaaaaaab', 'aaaaaaaaacaaaaaa',
    ],
    pal: { a: '#ececec', b: '#ffffff', c: '#d0d0d0' },
  },
  // Planks: horizontal boards with seams and the odd knot.
  wood: {
    rows: [
      'bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa', 'aaaacaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa',
      'dddddddddddddddd', 'bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaacaaaa',
      'aaaaaaaaaaaaaaaa', 'dddddddddddddddd', 'bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa',
      'acaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'dddddddddddddddd',
    ],
    pal: { a: '#f2eae2', b: '#ffffff', c: '#bfae9c', d: '#a8978a' },
  },
  // Rough stone: blocks with dark mortar.
  stone: {
    rows: [
      'aaaaaaadbbbbbbbb', 'abaaaaadbbbcbbbb', 'aaaaacadbbbbbbbb', 'aaaaaaadbbbbbbcb',
      'dddddddddddddddd', 'bbbbdaaaaaaadbbb', 'bbcbdaaaabaadbbb', 'bbbbdaaaaaaadbcb',
      'bbbbdacaaaaadbbb', 'dddddddddddddddd', 'aaaaaaaaadbbbbbb', 'aabaaaaaadbbbcbb',
      'aaaaaacaadbbbbbb', 'aaaaaaaaadbcbbbb', 'aaaaaaaaadbbbbbb', 'dddddddddddddddd',
    ],
    pal: { a: '#e4e4e4', b: '#f2f2f2', c: '#ffffff', d: '#a8a8a8' },
  },
  // Shingles: offset rows.
  roof: {
    rows: [
      'abbbbbbdabbbbbbd', 'abbbbbbdabbbbbbd', 'abbbbbbdabbbbbbd', 'dddddddddddddddd',
      'bbbdabbbbbbdabbb', 'bbbdabbbbbbdabbb', 'bbbdabbbbbbdabbb', 'dddddddddddddddd',
      'abbbbbbdabbbbbbd', 'abbbbbbdabbbbbbd', 'abbbbbbdabbbbbbd', 'dddddddddddddddd',
      'bbbdabbbbbbdabbb', 'bbbdabbbbbbdabbb', 'bbbdabbbbbbdabbb', 'dddddddddddddddd',
    ],
    pal: { a: '#ffffff', b: '#eaeaea', d: '#b0b0b0' },
  },
};

const cache = new Map();

/** A repeating, nearest-sampled texture by name. Shared: do not mutate repeat. */
export function texture(name) {
  if (cache.has(name)) return cache.get(name);
  const { rows, pal } = ART[name];
  const t = new CanvasTexture(makeSprite(rows, pal));
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = false;
  cache.set(name, t);
  return t;
}
