/* ============================================================================
   world/ — the walkable 3D world. Loaded lazily by main.js, only in 3D mode.

   This file is the world's composition root, as main.js is the page's: it
   builds the pieces, hands each the shared state, and runs them from the one
   ticker. Nothing here decides how anything looks or moves; it only says in
   what order things happen.
   ========================================================================== */

import '../styles/world.css';
import { Box3, Color, Fog, Raycaster, Scene, Vector2, Vector3 } from 'three';

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
import { Photo } from './photo.js';
import { zen } from '../core/zen.js';
import { buildObjects, buildRod } from './objects.js';
import { Ripples } from './ripples.js';
import { orderByBearing, step } from './tabcycle.js';
import { Fishing } from './fishing3d.js';
import { Stones } from './stones3d.js';
import { Stargaze } from './stargaze.js';
import { Leaves } from './leaves3d.js';
import { Traces } from './traces.js';
import { Weather, weatherize, weatherUniforms } from './weather3d.js';
import { Critters } from './critters3d.js';
import { Slime } from './slime.js';
import { voxelMaterial } from './voxel.js';
import { audio } from '../core/audio.js';
import { play } from '../core/play.js';
import { book } from '../core/constellations.js';
import { closePanels, openPanel, openPocket, panelOpen } from '../ui/panels.js';

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
  const terrain = buildTerrain();
  const skirt = buildSkirt();
  world.add(terrain, skirt);
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
  const hud = new Hud(() => input.queueUse(), () => input.queueWatch(), () => input.queuePocket(), () => input.pressUse(), () => input.releaseUse());
  const input = new Input(canvas, hud);
  world.add(player.camera); // the watch hangs off the camera, so the camera must be in the scene
  const watch = new Watch(player.camera, hud);
  bus.on('second', (d) => hud.tickMinute(d));
  bus.on('zen', (z) => (z.active ? watch.lower() : player.stand())); // Esc ends Zen, and you get up
  const photo = new Photo(player, col, canvas);
  bus.on('photo', () => photo.enter());
  // While a panel or the pocket book is open you are reading, not walking: let go of the mouse.
  bus.on('panel', (p) => {
    input.enabled = !p;
    if (p && document.pointerLockElement) document.exitPointerLock();
  });
  addEventListener('keydown', (e) => e.key === 'Escape' && watch.lower());
  // ── The useless things, physically (P4) ─────────────────────────────────
  const ripples = new Ripples(world);
  const traces = new Traces(world);
  const rod = buildRod();
  world.add(rod);
  const fishing = new Fishing(world, rod, player, ripples);
  const stones = new Stones(world, player, ripples);
  const stargaze = new Stargaze(sky);
  const leaves = new Leaves(world);
  // A play mode chosen in the Idle Hands panel can't put a rod in your hand from
  // across the map: it says where to go instead.
  let claimed = null;
  const claim = (mode, start) => () => {
    claimed = mode;
    start();
  };
  const WHERE = {
    fish: 'The rod leans on the last post of the dock.',
    skip: 'The flat stones are piled on the shore, east of the dock.',
    stars: 'Lie on the flat rock up the hill, after dark.',
    leaves: 'Stand under the big tree north of the meadow. They fall on their own.',
  };
  bus.on('play', ({ mode }) => {
    if (mode && mode !== claimed) {
      bus.emit('toast', { icon: '🧭', text: WHERE[mode], ms: 5000 });
      play.set(null);
    }
    if (!mode) {
      claimed = null;
      if (player.seat?.look) player.stand(); // off the rock when the stargazing stops
    }
  });
  addEventListener('keydown', (e) => e.key === 'Escape' && play.mode === 'stars' && play.set(null));

  const objects = buildObjects({ ...props.named, bucket: traces.bucket });
  world.add(objects.group);

  // ── Weather, seasons, inhabitants (P5) ──────────────────────────────────
  const weather = new Weather(world, ripples);
  for (const m of new Set([voxelMaterial, terrain.material, skirt.material, forest.tiles[0].near.pine.material, ...meadow.tiles.flatMap((t) => [t.grass.material, t.flowers.material])])) weatherize(m);
  weatherize(house.roof.material, { sides: true });
  const critters = new Critters(world);
  const slime = new Slime(objects.list.find((o) => o.id === 'slime').object, player);
  audio.enableSpatial({ hearth: lights.hearth.position.toArray() });
  let earClock = 0;
  const fwd = new Vector3();
  const interactables = [
    ...house.interactables,
    ...objects.list.map((o) => ({ object: o.object, label: () => o.label, use: () => openPanel(o.panel) })),
    // Zen on the porch bench.
    { object: house.bench, label: () => 'Sit and breathe', use: () => (player.sit(house.benchSeat), zen.start()) },
    // The hill rock: Zen by day; after dark you lie back and draw on the sky.
    {
      object: props.named.flatRock,
      label: () => (env.state.pal.stars > 0.4 ? 'Lie back and look up' : 'Sit and breathe'),
      use: () => {
        if (env.state.pal.stars <= 0.4) return player.sit(props.named.rockSeat), zen.start();
        player.sit({ ...props.named.rockSeat, look: true, eye: 0.45 });
        player.pitch = 0.95;
        claim('stars', () => play.set('stars'))();
        bus.emit('toast', { icon: '✨', text: 'Centre a star, E to join it to the last. Enter keeps it; Esc gets up.', ms: 6000 });
      },
    },
    { object: rod, label: () => 'Pick up the rod', use: claim('fish', () => fishing.pickUp()) },
    { object: props.named.stones, label: () => 'Pick up a flat stone', use: claim('skip', () => stones.pickUp()) },
  ];
  // Things the centre dot can rest on that are not meshes: a star, a wish, a leaf.
  const STAR = { label: () => (book.drawing.length ? 'Join this star' : 'Start with this star') };
  const WISH = { label: () => 'Make a wish' };
  const LEAF = { label: () => 'Catch the leaf' };
  const ROD = { label: () => fishing.tip() };
  const targets = interactables.map((i) => i.object);
  const gazeTargets = [...targets, house.shell];
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

  let tabSel = null;
  const fogColor = new Color();
  const clear = new Color();
  let gradeClock = 0;

  bus.on('tick', (tick) => {
    const s = env.update(tick);
    const dt = tick.dt;

    // Intent → the player → the camera.
    const intent = input.consume();
    if (intent.photo) photo.active ? photo.exit() : photo.enter();
    if (!photo.update(intent, input.keys, dt)) player.update(intent, dt, s.motion);
    if (player.walked > 4) hud.retireHints();

    // Tab: the next usable thing within reach that you can actually see, left to right.
    if (intent.tab && !player.seat && !photo.active && !(fishing.active || stones.active)) {
      const eye = player.camera.position;
      const seen = interactables
        .map((i) => ({ i, c: new Box3().setFromObject(i.object).getCenter(new Vector3()) }))
        .filter(({ i, c }) => {
          ray.set(eye, c.clone().sub(eye).normalize());
          const first = ray.intersectObjects(gazeTargets, false)[0];
          return first?.object === i.object; // in reach to use, and nothing in the way
        })
        .map(({ i, c }) => ({ i, c, x: c.x, z: c.z }));
      const order = orderByBearing(seen, player.pos, player.yaw);
      const now = order.findIndex((o) => o.i === tabSel);
      const next = order[step(now, order.length, intent.tab === 'back')];
      if (!next) hud.announce('Nothing to use within reach. Walk closer to something.');
      else {
        tabSel = next.i;
        const d = next.c.clone().sub(eye);
        const instant = !s.motion;
        player.lookToward(Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)), instant);
        if (instant) hud.blink(); // reduced motion: a fade, not a turn
        hud.announce(`${next.i.label()}. Press E to use it.`);
      }
    }

    // What are we looking at? Hands that are busy (a rod, a stone) own E.
    const busy = fishing.active || stones.active;
    let target = null;
    let special = null;
    if (busy) {
      if (fishing.tip()) target = ROD;
    } else if (play.mode === 'stars') {
      const i = stargaze.pickStar(player.camera, s.pal);
      if (i >= 0) (target = STAR), (special = () => book.add(i));
    } else if (!player.waking && !photo.active && !player.seat) {
      const leaf = leaves.aimed(player.camera);
      if (stargaze.wishable(player.camera)) (target = WISH), (special = () => stargaze.wish());
      else if (leaf >= 0) (target = LEAF), (special = () => leaves.catch(leaf));
      else {
        ray.setFromCamera(new Vector2(0, 0), player.camera);
        // The cabin's walls are in the test too: the nearest hit must be the thing itself.
        const hit = ray.intersectObjects(gazeTargets, false)[0];
        target = hit && hit.object !== house.shell ? interactables[targets.indexOf(hit.object)] : null;
      }
    } else if (player.seat?.look && stargaze.wishable(player.camera)) {
      (target = WISH), (special = () => stargaze.wish());
    }
    hud.setTarget(target);
    if (intent.use && !busy) (special ?? target?.use)?.();
    fishing.update(intent, s, dt);
    stones.update(intent, s, dt);
    stargaze.update(s, dt);
    leaves.update(s, dt);
    traces.update(s);
    ripples.update(dt, s.motion);
    weather.update(s, player.camera.position, dt, tier.name === 'low' ? 0.35 : tier.name === 'medium' ? 0.65 : 1);
    water.setIndoors(weather.indoors);
    critters.update(s, player.camera.position, dt);
    slime.update(s, dt);
    earClock -= dt;
    if (earClock <= 0) {
      earClock = 0.1;
      player.camera.getWorldDirection(fwd);
      audio.setListener(...player.camera.position.toArray(), fwd.x, fwd.y, fwd.z);
    }
    if (intent.watch) watch.press();
    if (intent.pocket) (panelOpen()?.pocket ? closePanels() : openPocket());
    watch.update(s, dt);

    // The palette, everywhere it lands.
    sky.update(s, dt);
    sky.sync(player.camera);
    lights.update(s, sky, player.camera.position);
    lights.hemi.intensity += weather.flash * 4; // lightning lights the land for a moment
    pipeline.post.post.uniforms.uFlash.value = weather.flash;
    pipeline.post.post.uniforms.uDesat.value = s.offline * 0.37;
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
      outline: target?.object && !panelOpen() ? target.object : null,
      // How thick the air is: a clear noon is nearly clean; fog, weather and losing the network thicken it.
      air: {
        density: 0.004 + s.pal.fogAmount * 0.035 + (s.weather === 'fog' ? 0.03 : 0) + s.offline * 0.03,
        lamps: lights.airLamps(),
      },
    });
    photo.afterRender();

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
      objects: objects.list,
      /** Stand `dist` metres from an object (on the floor you name) and look straight at it. */
      fishing,
      input,
      weather,
      weatherUniforms,
      water,
      lights,
      audio,
      stones,
      stargaze,
      leaves,
      lookAt(id, x, z, feet = 99) {
        const extra = { rod, stones: props.named.stones, rock: props.named.flatRock, bench: house.bench };
        const o = extra[id] ?? objects.list.find((q) => q.id === id).object;
        const c = new Box3().setFromObject(o).getCenter(new Vector3());
        this.teleport(x, z, 0, 0, feet);
        col.move(player.pos, 0, 0); // settle out of any furniture first, then aim from where we really are
        const { x: px, z: pz } = player.pos;
        player.yaw = Math.atan2(-(c.x - px), -(c.z - pz));
        player.pitch = Math.atan2(c.y - (player.pos.y + 1.6), Math.hypot(c.x - px, c.z - pz));
      },
      teleport(x, z, yaw = player.yaw, pitch = 0, feet = 99) {
        player.pos.x = x;
        player.pos.z = z;
        player.target = null; // a pending tap-to-walk would carry you off again
        // feet: the highest floor to consider (99 = the top one; 1.5 = the cabin floor, not the loft)
        player.pos.y = player.pos.groundY = col.groundAt(x, z, feet).y;
        player.yaw = yaw;
        player.pitch = pitch;
        player.wake(false);
      },
      get tier() {
        return tier.name;
      },
      /** Point the eye along a world direction (for aiming at stars and leaves in tests). */
      aimDir(x, y, z) {
        const l = Math.hypot(x, y, z);
        player.yaw = Math.atan2(-x, -z);
        player.pitch = Math.asin(y / l);
      },
      /** Draw calls and triangles per frame (all passes), averaged over 30 frames, and the buffer size. */
      async stats() {
        const info = pipeline.renderer.info;
        info.autoReset = false;
        info.reset();
        for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
        const out = { calls: Math.round(info.render.calls / 30), triangles: Math.round(info.render.triangles / 30), size: `${pipeline.W}×${pipeline.H}` };
        info.autoReset = true;
        return out;
      },
    };
  }
}
