/* ============================================================================
   ripples.js — rings on the water where things touch it: a cast float, a
   skipping stone, a bite. A small pool of flat rings that grow and fade.
   ========================================================================== */

import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { WATER_Y } from './layout.js';

const POOL = 16;
const LIFE = 1.3;

export class Ripples {
  constructor(scene) {
    const geo = new RingGeometry(0.42, 0.5, 24);
    geo.rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: POOL }, () => {
      const m = new Mesh(geo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }));
      m.visible = false;
      m.userData.age = LIFE;
      scene.add(m);
      return m;
    });
    this.next = 0;
  }

  spawn(x, z, strength = 0.6) {
    const m = this.rings[this.next++ % POOL];
    m.position.set(x, WATER_Y + 0.02, z);
    m.userData.age = 0;
    m.userData.size = 0.6 + strength * 1.4;
    m.visible = true;
  }

  update(dt, motion) {
    for (const m of this.rings) {
      if (!m.visible) continue;
      m.userData.age += dt;
      const k = m.userData.age / LIFE;
      if (k >= 1) {
        m.visible = false;
        continue;
      }
      // Reduced motion: rings appear and fade where they are, without spreading.
      const s = motion ? 0.4 + k * m.userData.size * 2 : m.userData.size;
      m.scale.setScalar(s);
      m.material.opacity = (1 - k) * 0.55;
    }
  }
}
