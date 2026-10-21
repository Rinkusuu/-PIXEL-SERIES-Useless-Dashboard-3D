# 🌱 The Useless but Aesthetic Dashboard

A cosy pixel world that tells you the time, the weather, the season, where the International Space Station is, and where Saturn is. None of which you needed to know.

```bash
npm install
npm run dev        # the app
npm test           # 90 unit tests: the sky, the store, the rules, the world's layout
npm run e2e        # 6 browser tests: walking out, the watch, every panel on desktop and phone
```

It also works with the network unplugged. That took some doing, and it's the most interesting thing in here.

**And now you can walk into it.** Where the browser can draw WebGL2, the app opens inside the painting: you wake in the loft of the cabin and can go out of the door, across the meadow, onto the dock and up the hill. The fifteen panels became things in the world. The classic painting is still here, unchanged — it's what you get without WebGL2, and one button away with it.

---

## What it is

A living pixel environment — a dithered sky on a real day/night cycle, parallax ridgelines, a lake that reflects the world standing over it, a meadow whose grass bends in travelling gusts of wind — with fifteen frosted-glass panels floating above it.

Everything in it is real. The weather is your weather. The season is your season (and it flips if you're south of the equator). The sun climbs to the height it actually climbs to at your latitude, today. The moon is in its true phase. When the panel says the space station is 38° above your south-west horizon, it is. And the four bright dots that don't twinkle are Venus, Jupiter, Mars and Saturn, in their true positions, computed from Kepler's laws on your machine.

Nothing on it is productive. That's the point.

---

## The seven decisions that define it

**1 · The world is ~500 pixels wide.** *(the classic painting)*
The scene renders into a buffer around 500×280 and is blown up with `image-rendering: pixelated`. That isn't a compromise, it's the art direction — and it means fill cost is constant regardless of monitor. A 5K display and a phone both rasterise ~140,000 pixels a frame. It's why we can afford hundreds of particles and per-scanline water.

**2 · The lake reflects the actual world.**
Not a wash of "sky colour" — the strip of frame above the shoreline is copied, flipped, squashed and displaced per scanline. Because the water draws eighth of thirteen layers, what lands in it is the real treeline, the real ridges, the real lit cottage window. It's one blit and sixty-odd row draws, and it measures as free. (It also means that when you name a constellation, its name is reflected in the lake. Nobody designed that. It simply follows.)

**3 · Bloom is one blurred canvas.**
A second canvas holds only emissive pixels (stars, planets, the moon, fireflies, the cottage window, lightning, the ISS, a float going under). CSS blurs it and screen-blends it over the scene. Real bloom for the price of one blur on a small image.

**4 · One `requestAnimationFrame` loop.**
Everything — sky, slime, equaliser, breathing ring, a skipping stone — is driven from `core/ticker.js`. One loop gives one place to clamp `dt`, pause when hidden, and shed particle density under load so quality degrades instead of frame rate.

**5 · The palette is the app's colour system.**
`sky/palette.js` interpolates nine hand-painted keyframes around the clock, grades them by the weather, tints them by the season, lifts them with your breath — then pushes the result into CSS custom properties. The glass, the buttons and the text all inherit the sky's mood. Nothing hard-codes a colour that ought to breathe.

**6 · Population is the cheapest storytelling there is.**
`sky/season.js` doesn't change how anything behaves. It changes *who is out*: butterflies in spring, fireflies on summer nights, a blizzard of dead leaves in October, and a winter meadow where nothing flies at all. Same code, four different worlds.

**7 · There are no assets, and no servers either.**
No sprite sheets, no models, no audio files, no logo, no third-party scripts, no fonts fetched from anyone else — and no ephemeris table for the planets. Every voxel in the walkable world is placed by code, and every pixel of the painting is drawn from ASCII art in the source (`ui/pixel.js`, right down to the 3×5 alphabet the constellations are labelled in), every sound is synthesised (`core/audio.js`), and every celestial body is arithmetic (`sky/planets.js`).

**Total shipped weight, gzipped, measured on the build:**

| | JavaScript | |
|---|---|---|
| The shell (every visit: panels, store, sound, sky maths) | **45.6 KB** | + 9.0 KB CSS, 17 KB of font |
| The classic painting | **+16.9 KB** | loaded only in Classic |
| The rules both worlds share (fishing, stones, stars, leaves) | +1.8 KB | |
| The walkable world | **+175.4 KB** | loaded only in 3D; about 140 KB of it is three.js |

The classic dashboard used to be ~59 KB in one file. Splitting the painting out of the shell is why a visit to the world never downloads fifteen 2D layers it won't draw — and why these numbers can be stated separately and honestly. three.js is the one dependency the world was allowed, and it's the bulk of its weight.

---

## Things worth finding

| | |
|---|---|
| **⌘K** | The command palette. Everything, fuzzy-searchable. |
| **🪟 Glass** | The panels go clear and the world comes up through the dashboard. The one under your cursor frosts back over. |
| **Zen** | Hides the entire dashboard. What's left is the world and a 4-7-8 breathing ring — and the world breathes *with* you. Esc to leave. |
| **Idle Hands** | Fish. Skip stones. Join the stars into constellations and name them. Catch falling leaves. None of it helps. |
| **The planets** | Four dots that don't twinkle. They're where they really are. |
| **A shooting star** | Click one before it's gone. Nothing happens. Nothing was ever going to. |
| **Overhead** | The ISS. When it says "look up", go and look up. |
| **Golden hour** | It only says so when the sun is really between −4° and +6°. It will never tell you how long you've got. |
| **Ambience** | Rain, wind, crickets and a hearth, layered over the real weather. Have rain in your ears under a clear sky. |
| **Snow** | Watch it settle. Force snow in July and the summer meadow goes briefly, wrongly white. |
| **Postcard** | Exports the world as a PNG. A postcard from a place that doesn't exist. |
| **The cursor** | Parts the grass. Leaves ripples on the lake. Scatters the fireflies. Lights a lantern at night. The slime notices, and hops away. |
| **The music** | Makes the world pulse. Fireflies flare on the bass, the water glitters harder, the bloom swells. |
| **The hour** | If sound is on, it chimes. Once. Softly. Like a clock in another room. |
| **Unplugging the ethernet** | Try it. |

---

## The world you can walk into

The same place as the painting — the cabin with the lit window, the lake, the meadow, the forest, the hill, the ridges — 250 metres across and walkable. The look is **voxel art under modern lighting**: everything is built from small cubes in code (`world/voxel.js` meshes them greedily, with per-corner ambient occlusion), lit by the real sun or moon with shadows, a hearth and lamps that come on after dark, and light you can see in the air. The palette still decides everything: the sky, the fog, the light, and a colour grade over the frame.

**The dashboard is in the world, not over it.** Each panel is a thing that has a reason to be where it is:

| Panel | Thing | Where |
|---|---|---|
| Local Time | a wall clock, and the watch on your wrist | over the door; you |
| Outside | a barometer and thermometer | by the door, on the porch |
| Overhead | a telescope | the top of the hill |
| Useless Fact | the newspaper in the mailbox | the yard |
| Daily Fortune | a jar of fortune cookies | the table |
| Words of Someone | a corkboard of pinned notes | the east wall |
| Ambient Loop FM / Ambience | a radio, and its knobs | the table |
| Mood | a mirror | the north wall |
| Coffee | a kettle and a cup | the kitchen counter |
| Idle Earnings | a jar of coins | the shelf |
| Tiny Achievements | framed certificates | by the lake window |
| Idle Hands | a bucket of everything you've caught | the end of the dock |
| Pixel Pet | Blip, wandering the meadow | outside |
| Pockets | — it's on you | the pocket book |

Look at one and press **E**: its real panel opens over the world, which carries on behind it. **B** opens the pocket book (all of them at once). **⌘K** opens any of them from anywhere.

### Things worth finding in the world

| | |
|---|---|
| **Q** | Glance at your watch: the time, the weather, the station overhead. It buzzes when the ISS is really up there and lit. |
| **The door** | It opens. The world was outside it the whole time. |
| **The loft** | Where you wake. There's a ladder. |
| **The rod on the dock** | Hold E to draw it back, let go to cast. Then wait. The bite is the same Poisson process as the painting's: it can't be predicted, and you can't get better at it. |
| **The flat stones** | Look low over the water, hold E, throw. Same rule as the painting: shallow skips, steep sinks. A buoy marks your best. |
| **The flat rock on the hill** | By day, sit and breathe. After dark, lie back and join the stars — the same stars, by the same numbers, as the painting's sky. Your constellations are up there, with their names. |
| **The big tree** | Leaves fall from it, more in autumn. Catch one. |
| **A shooting star** | Look at it and press E while it falls. You made a wish. Nothing happens. |
| **The bench on the porch** | Sit. Zen. The world breathes with you. |
| **P** | Photo mode: float the camera, frame it, Enter. A postcard from a place that doesn't exist. |
| **The fire lookout** | A long stair up through the forest to a deck above the trees. |
| **Weather** | It's yours. Rain darkens the ground and rings the lake; snow settles on the roof and buries the grass, and melts back the way it does in the painting. |
| **Unplugging the ethernet** | Still try it. The air thickens and the colour drains out of the world. |

Everything in the painting that was real is real here too: the sun and moon stand at their true altitude and bearing (the moon now has a position of its own, `sky/moon.js`, not just a phase), the planets don't twinkle, the weather is your weather. Nothing became useful. There is still nothing to finish.

---

## The sky

The sky used to be the one place in this app that was cheating. 190 stars from a seed, and nothing else out there. It isn't cheating any more.

### ✨ Constellations, and their names

The star field has been generated from a fixed seed since the first commit, so that *"a sky whose stars reshuffle on every reload never becomes **your** sky"*. Everything below is that decision getting paid back.

Because star #57 is where it was last Tuesday, **a line between two stars can be saved as two integers** and will still point at the same two stars a year from now. You could not build this on a random sky.

And because a line means something, it can be **named**. The name is typed into the dock, and then it hangs in the sky under its own constellation — drawn in a 3×5 bitmap font built from ASCII art in `ui/pixel.js`, because `fillText` at this scale is antialiased and the upscale turns every soft edge into a grey smear. In a world where a star is one hard pixel, a blurry letter reads as a bug. The letters are pixels, like the moon and the cottage and the slime.

Names are held clear of the treeline — the forest draws *after* the stars, and the star field runs down past the shoreline, so a constellation can have its feet in a wood. Where the name is hung is decided from `classic/horizon.js`, the one file allowed to know where the ground is.

Staying nameless is a legitimate answer. The achievement for drawing three of them is called *"Draw three. Name none of them."*

### 🪐 The four wanderers

Venus, Jupiter, Mars and Saturn, from JPL's approximate Keplerian elements — heliocentric position, geocentric difference, ecliptic to equatorial, sidereal time, hour angle, altitude and azimuth. About ninety lines of trigonometry in `sky/planets.js`. **No network, no ephemeris file, no dependency.** It runs offline in a cave and it will still be right in 2049.

It is checked against things that cannot be argued with:

| | expected | computed |
|---|---|---|
| Sun's declination, June solstice | +23.44° | **+23.43°** |
| Midsummer noon, London (51.5°N) | ~62° up, due south | **61.9°, azimuth 179.7°** |
| Sydney's June sun | low, and in the **north** | **32.7°, azimuth 358.7°** |
| Venus's greatest elongation | ≤ 47.8°, always | **47.0°** |
| Jupiter's yearly march | ~30° of sky | **36°** |

And then the detail the whole thing exists for:

> **A planet does not twinkle.**

A star is a point source, and the atmosphere shreds a point into a flicker. A planet is a tiny disc — many points, whose flickers average out — so it burns steadily. It is how you pick one out of the sky with the naked eye from a back garden. Here it means these four dots hold *perfectly* still while all 190 stars around them are breathing. (Measured: sampled over two seconds, Saturn's brightness varies by zero. A star beside it varies by 56.)

Their brightness is real too — Venus outshines everything in the sky but the sun and the moon, and gets a halo to prove it; Saturn is a modest, steady little light and gets almost none. Mars is visibly red.

**You cannot join a planet into a constellation, and that is deliberate.** A constellation is stored as star indices, and the whole argument above rests on stars not moving. A line drawn to a planet would point at empty sky next season. It was tempting. It was wrong.

### 🌠 A wish

A shooting star crosses the world in about three seconds, and appears every twenty to forty. Click one while it's falling and you have made a wish.

Nothing happens. Nothing will ever happen. It cannot be farmed, it cannot be earned, and no amount of skill makes another one come — which makes it the purest thing in the whole dashboard.

---

## The four pointless things

They all want the same resource — a click on the world — so `core/play.js` says which one is listening. Nothing else about them is centralised: **the layer that owns the thing owns what you can do to the thing.** Fishing lives on the water, constellations live in the star field, catching leaves lives with the leaves. A `CatchingLayer` would have needed its own copy of every leaf's position, updated from the real one every frame and wrong the moment it wasn't.

**🎣 Fishing** — the bite is a Poisson process, not a countdown. At every instant there's a fixed small chance of one, which makes the wait *memoryless*: a long wait tells you nothing about how much longer you'll wait, and you cannot get better at predicting it. Real fishing has exactly this property, and it's the only reason it's relaxing rather than infuriating.

**🪨 Skipping stones** — a real projectile with a real height axis. Whether it skips is the angle of attack: steep digs in, shallow glances off. So the game is throw flat, throw far — and nobody has to be told that, because everyone has already thrown a stone at a lake. The little flurry of rapid touches at the end of a good throw isn't animated. It's just what the numbers do.

**✨ Constellations** — see above. Draw them, name them, forget them one at a time or all at once. Forgetting is the only irreversible thing the panel can do, so the button asks twice — and the sky, not the panel, is what does the forgetting. (A panel that emptied the store directly would leave the layer holding the old list in memory, and the next constellation you drew would write every deleted one straight back.)

**🍂 Catching leaves** — they were going to land anyway.

---

## Weather that leaves a mark

Snow falls in this world, and now it *stays*.

`season.snow` used to be the whole story: winter meant a white meadow, spring meant a green one, and actual falling snow changed nothing on the ground. You could stand in a blizzard on a summer lawn.

So that number stopped being the ground's **value** and became its **resting level** — the depth this ground settles to when nothing is happening to it. Snowfall pushes it up from there over a couple of minutes; when the snow stops, it melts back down, slowly in a winter that keeps it and quickly in a spring that doesn't want it.

Which means a July flurry now leaves the meadow briefly, wrongly, beautifully white — and then it's gone, the way a July flurry is.

The meadow already knew how to *wear* snow: it lies in drifts read from a noise field, it buries the grass to different depths, and the blades sample the same field, so tufts poke through exactly where the drift is thin. That's the difference between a winter meadow and a summer meadow that someone has thrown flour over. All of that was already here. It just had no idea how snow arrived.

---

## Golden hour, and the line this app will not cross

The palette has had a `golden hour` phase since the first commit. It fired at **18:36**. Every day. At every latitude. In every season. In Reykjavík in June that is the middle of the afternoon; in Jakarta the sun set half an hour ago. It was a clock pretending to be a light.

Now it's the light: golden hour is the sun sitting between **−4° and +6°**, taken from the same Kepler maths as the planets, for your latitude, today. The colour keyframe still lives at 18:36 — interpolating colours by the clock is what a palette *is* — but the sentence only appears when the gold is genuinely falling on you.

**And it will never count down.** No "20 minutes left", no "golden hour begins at 17:42". That one line is the only thing in this project that would have made the dashboard *useful*, and useful is the one thing it has promised never to be. This tells you to look out of the window, the way the ISS panel tells you to look up. It does not tell you when to.

---

## Glass

Zen hides the dashboard. Idle Hands sweeps it aside while you play. Both answer *"I want to see the world"* by taking the panels away.

**Glass** answers the other version of that wish — the one where you want to see the world *and keep reading the panels*. The frosting drops from 86% to 18%, the blur goes with it, and the meadow and the clouds and the lake come up through the dashboard. The panel under your cursor frosts back over the instant you go near it. Nothing is hidden, and nothing is unusable.

`tokens.css` calls 86% *"the legibility floor"*, and it means it: below that, the grass moving behind the glass changes the contrast under the text from second to second, and copy that is readable now and not in a moment is worse than copy you cannot read at all. Glass goes far below that floor — so it pays for it. Every word gets a 2px hard shadow (no blur; a blurred shadow in a pixel world is a smudge), which holds the text against a bright noon sky and a dark lake equally. That swing is exactly what the floor was protecting us from.

---

## Offline

The app is a static bundle with no backend, and almost all of it never needed a network: the entire world, every sound, every star, every planet, and ten of the fifteen panels are local. But it couldn't be *opened* without one, which made all of that academic.

Now it can.

- **A service worker** precaches the shell (`sw-template.js`, with the real content-hashed asset list injected at build time by a twenty-line plugin in `vite.config.js` — a PWA dependency would have been larger than the feature).
- **The fonts are self-hosted.** A project that boasts about shipping zero assets was fetching two typefaces from Google on every cold load, and rendered in Helvetica without them.
- **The weather is remembered.** Offline you get *your* last real reading, with its age stated plainly: *"offline — Jakarta's sky as it was 3 hours ago."* An honest stale fact beats a freshly invented sunny day, which is what used to be served here.
- **The ISS keeps flying.** It's a 420-tonne object in a near-circular orbit at 7.66 km/s; over a few minutes its future is arithmetic. So the dot dead-reckons from the last real fix rather than freezing — a stationary satellite is just a star — and the panel says the position is estimated.
- **The planets never needed anyone.** They are computed, not fetched. The sky is the one part of this app that has never once been offline.
- **Losing the network is weather.** No red banner, no modal, no retry button. The world quietly fogs over and the colour drains out of it (measured: saturation falls 37%), and lifts again when you're back. You find out you're offline the way you'd find out it had started to rain: by looking outside.

---

## Architecture

```
src/
  core/       ticker · bus · store (+ migrate) · env · audio · motion · zen · net · play · achievements
              fishing · stones · constellations · leaves   (the rules, shared by both worlds)
  sky/        palette · season · planets · moon · stars  (pure: no DOM, no three — tested)
  classic/    Scene · horizon · Layer  +  layers/ (15, back to front)     → its own lazy chunk
  world/      renderer · post · volumetric · voxel · models · layout · collision · terrain · house
              props · forest · meadow · water · sky3d · lights · weather3d · critters3d · slime
              player · input · hud · watch · objects · fishing3d · stones3d · stargaze · leaves3d
              traces · photo · tabcycle                                    → its own lazy chunk
  widgets/    Widget base  +  15 panels  (unchanged; mounted in both worlds)
  services/   weather (Open-Meteo) · iss (wheretheiss.at) · quotes
  ui/         feedback · zen-ui · command · postcard · pixel · palette-dom · panels · world-settings
  styles/     fonts · tokens · base · panels · widgets · overlays · world
sw-template.js   the service worker; vite.config.js fills in the asset list (both lazy chunks included)
```

`core/env.js` is the world's state without a renderer — the hour, the weather, the season, the palette, the snow lying on the ground, how offline we are. The classic scene and the 3D world both read it, so there is one clock, one sky and one snow depth. `world/layout.js` is `horizon.js` for three dimensions: the one file that knows where the lake ends, where the path runs and how high the hill is, so a tree cannot stand in the water.

The widgets were never rewritten for the world. Several of them are what fetch the weather, track the station and count the coins, so they stay mounted in both modes; in the world, an object just shows its panel. The store is `uad.v2` now: an old `uad.v1` is migrated (and kept), so nothing you caught, drew or earned is lost.

Modules talk **only** through `core/bus.js`. The scene never imports a widget; no widget imports another. Weather arrives once and the sky, the weather panel, the season's hemisphere, the ISS tracker and the ambient audio all react independently.

`classic/horizon.js` is worth calling out. The shoreline used to be five magic fractions in five different layers — the water drew itself between 0.558 and 0.68, and the weather layer independently *believed* the lake was between 0.558 and 0.68 so it knew where raindrops should ring. Five copies of one fact. Widen the lake in one of them and the rain starts landing on the grass.

It has since grown a second line: `skyline`, the sky's horizon, which is *not* the water's. It was a bare `0.52` sitting inside `CelestialLayer` until the planets needed to rise from the same line the sun does — which is the exact story that file exists to prevent happening twice.

### One bug worth writing down

`core/store.js` debounces its writes by 250ms. `MoodWidget` drifts your mood back toward contentment continuously — and persisted it **on every single frame**. Every write cancelled the pending flush and scheduled a new one, sixty times a second, forever.

The flush never fired. Not once. The entire store — coins, achievements, fish, your constellations — reached localStorage only via the `pagehide` handler when the tab closed, and a browser crash took the whole session with it. It had been that way for a long time, and it was invisible, because closing the tab is exactly what you do before you check whether anything saved.

The mood now only persists when it has visibly moved. And the debounce grew a **ceiling**: 250ms is how long we're willing to wait for quiet, and one second is how long we're willing to wait at all. The next component that writes every frame will not be able to do this again.

---

## Accessibility

Reduced motion is honoured, and it reaches *into the canvas*, not just the CSS. It parks the clouds, retires every particle that travels across the frame, stills the grass, and disables the full-screen lightning flash (a photosensitivity trigger on its own terms).

What's left still breathes: stars twinkle, fireflies pulse, the sun still crosses the sky over hours — all opacity, no translation. Measured, it takes the scene from **18.8% of pixels changing per 700ms to 0.34%**.

The clock exposes a screen-reader-only `role="timer"` that announces the **minute**, never the second — a clock that reads sixty times a minute is a denial-of-service attack on its user.

Sound is opt-in and off by default, and that includes the hourly chime. An app that makes a noise you did not ask for is an app you close.

**In the world:** the keyboard reaches everything — **Tab** walks through the things you can use from where you stand, left to right, and turns you to face each one, and E uses it; panels are ordinary DOM and the screen reader hears what the watch and the world say. Reduced motion stops the rain, snow, critters, falling leaves and shooting stars, stills the grass and the water, and turns camera moves (waking, Tab, the watch) into fades. Lightning never flashes under reduced motion, and never more than three times a second otherwise — that one is a test. Head bob is off unless you ask for it, and never with reduced motion; field of view, snap turn and quality are in ⚙ World. Positional sound (the hearth, crickets in the grass, rain on the roof) still runs through the same mixer and mute.

---

## A note on what isn't here

There was a YouTube panel. It's gone, deliberately.

YouTube's audio lives in a cross-origin iframe, where a Web Audio `AnalyserNode` is forbidden from listening. Once the *world itself* started reacting to the music — fireflies flaring on the bass, the bloom swelling — a source the world is deaf to would have meant half the dashboard silently dying whenever you played a video. Everything you can play here, the world can hear.

There is no to-do list, no pomodoro, no notifications, and no countdown to anything. There never will be.

---

*Nothing productive happened today, and that's perfectly okay 🌱*
