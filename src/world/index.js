/* ============================================================================
   world/ — the walkable 3D world. Loaded lazily by main.js, only in 3D mode.

   This file is the world's composition root, as main.js is the page's: it
   builds the pieces, hands each the shared state, and runs them from the one
   ticker. Nothing here decides how anything looks or moves; it only says in
   what order things happen.
   ========================================================================== */

import '../styles/world.css';
import { Color, Fog, Raycaster, Scene, Vector2 } from 'three';

import { bus } from '../core/bus.js';
import { env } from '../core/env.js';
import { store } from '../core/store.js';
import { motion } from '../core/motion.js';
import { mixRgb } from '../core/util.js';

import { Pipeline, linear } from './renderer.js';
import { TIERS, initialTier, nextTier } from './quality.js';
import { Collision } from './collision.js';
import { blockHeight, isWater, WALK_RADIUS } from './layout.js';
import { Sky } from './sky3d.js';
import { Lights } from './lights.js';
import { buildTerrain, buildSkirt } from './terrain.js';
import { Water } from './water.js';
import { House } from './house.js';
import { buildProps, updateLamps } from './props.js';
import { Forest } from './forest.js';
import { Meadow, LAYER_GRASS } from './meadow.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Watch } from './watch.js';

const REACH = 3.2; // metres: how far away a thing can be and still be used

export function startWorld(canvas) {
  const pipeline = new Pipeline(canvas);
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ── The world ───────────────────────────────────────────────────────────
  const col = new Collision({
    ground: blockHeight, // the visible column tops, so feet land on the steps you see
    blocked: (x, z) => isWater(x, z) || Math.hypot(x, z) > WALK_RADIUS,
  });
  const world = new Scene();
  world.fog = new Fog(0x000000, 40, 230);

  const sky = new Sky();
  const lights = new Lights();
  lights.addTo(world);
  world.add(buildTerrain(), buildSkirt());
  const water = new Water(pipeline);
  water.addTo(world);
  const house = new House(col);
  world.add(house.group);
  const props = buildProps(col);
  world.add(props.group);
  const forest = new Forest(col);
  forest.addTo(world);
  const meadow = new Meadow();
  meadow.addTo(world);

  const player = new Player(col);
  water.watch(player.camera, LAYER_GRASS);
  const hud = new Hud(() => input.queueUse(), () => input.queueWatch());
  const input = new Input(canvas, hud);
  world.add(player.camera); // the watch hangs off the camera, so the camera must be in the scene
  const watch = new Watch(player.camera, hud);
  bus.on('second', (d) => hud.tickMinute(d));
  addEventListener('keydown', (e) => e.key === 'Escape' && watch.lower());
  const interactables = [...house.interactables];
  const targets = interactables.map((i) => i.object);
  const ray = new Raycaster();
  ray.far = REACH;
  ray.layers.enableAll();

  // ── Quality ─────────────────────────────────────────────────────────────
  let tier = null;
  const applyTier = (name) => {
    tier = TIERS[name];
    pipeline.resize(tier.scale);
    pipeline.bloom = tier.bloom;
    pipeline.steps = tier.steps;
    const recompile = pipeline.setShadows(tier.shadows);
    lights.setShadowSize(tier.shadows);
    lights.setPoints(tier.points);
    water.setReflect(tier.reflect);
    forest.setDensity(tier.trees);
    meadow.setDensity(tier.grass);
    world.fog.far = tier.fogFar;
    world.fog.near = tier.fogFar * 0.2;
    if (recompile) world.traverse((o) => o.material && (o.material.needsUpdate = true));
    player.setAspect(pipeline.W / pipeline.H);
    bus.emit('world:tier', name);
  };
  applyTier(initialTier(store.get('view').quality, coarse));

  // Auto tier: measure three seconds, step down if slow, measure once more.
  let probe = store.get('view').quality === 'auto' ? { left: 3, samples: [], rounds: 2 } : null;

  addEventListener('resize', () => {
    pipeline.resize(tier.scale);
    water.resize();
    player.setAspect(pipeline.W / pipeline.H);
  });

  bus.on('view', (v) => {
    player.setFov(v.fov);
    if (TIERS[v.quality] && v.quality !== tier.name) applyTier(v.quality);
    probe = null;
  });
  player.setFov(store.get('view').fov);

  // ── Morning ─────────────────────────────────────────────────────────────
  player.wake(motion.enabled);
  hud.wakeUp();

  const fogColor = new Color();
  const clear = new Color();
  let gradeClock = 0;

  bus.on('tick', (tick) => {
    const s = env.update(tick);
    const dt = tick.dt;

    // Intent → the player → the camera.
    const intent = input.consume();
    player.update(intent, dt, s.motion);
    if (player.walked > 4) hud.retireHints();

    // What are we looking at?
    ray.setFromCamera(new Vector2(0, 0), player.camera);
    const hit = player.waking ? null : ray.intersectObjects(targets, false)[0];
    const target = hit ? interactables[targets.indexOf(hit.object)] : null;
    hud.setTarget(target);
    if (intent.use && target) target.use();
    if (intent.watch) watch.press();
    watch.update(s, dt);

    // The palette, everywhere it lands.
    sky.update(s, dt);
    sky.sync(player.camera);
    lights.update(s, sky, player.camera.position);
    water.update(s);
    house.update(s, dt);
    updateLamps(props, lights.dark);
    meadow.update(s, player.camera.position, tier.fogFar);
    forest.update(player.camera.position, tier.fogFar);
    linear(mixRgb(s.pal.sky[2], s.pal.fog, 0.5), fogColor);
    world.fog.color.copy(fogColor);
    linear(s.pal.sky[2], clear);

    // The grade follows the palette four times a second, like the DOM does.
    gradeClock -= dt;
    if (gradeClock <= 0) {
      gradeClock = 0.25;
      pipeline.post.setPalette(s.pal);
    }

    pipeline.render({
      bg: sky.scene,
      world,
      bgCamera: sky.camera,
      camera: player.camera,
      clear,
      bloomStrength: 0.85 + s.bass * 0.3 + (s.zen ? (s.breath - 0.5) * 0.25 : 0),
      key: lights.key,
      // How thick the air is: a clear noon is nearly clean; fog, weather and losing the network thicken it.
      air: {
        density: 0.004 + s.pal.fogAmount * 0.035 + (s.weather === 'fog' ? 0.03 : 0) + s.offline * 0.03,
        lamps: lights.airLamps(),
      },
    });

    // Tier probe: median of the raw frame times.
    if (probe) {
      probe.samples.push(dt);
      probe.left -= dt;
      if (probe.left <= 0) {
        const sorted = probe.samples.sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1] * 1000;
        const prev = tier.name;
        const next = nextTier(prev, median, coarse);
        if (next !== prev) applyTier(next);
        // Stepped down? Measure the new tier once more. Held? Done.
        probe = --probe.rounds > 0 && next !== prev ? { left: 3, samples: [], rounds: probe.rounds } : null;
      }
    }
  });

  // A handle for the capture script and the e2e test, only when asked for.
  if (/[?&]debug\b/.test(location.search)) {
    window.__world = {
      player,
      house,
      pipeline,
      scene: world,
      sky,
      teleport(x, z, yaw = player.yaw, pitch = 0) {
        player.pos.x = x;
        player.pos.z = z;
        player.pos.y = player.pos.groundY = col.groundAt(x, z, 99).y;
        player.yaw = yaw;
        player.pitch = pitch;
        player.wake(false);
      },
      get tier() {
        return tier.name;
      },
      /** Draw calls and triangles for one whole frame (all passes), and the internal size. */
      async stats() {
        const info = pipeline.renderer.info;
        info.autoReset = false;
        info.reset();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const out = { calls: info.render.calls, triangles: info.render.triangles, size: `${pipeline.W}×${pipeline.H}` };
        info.autoReset = true;
        return out;
      },
    };
  }
}
