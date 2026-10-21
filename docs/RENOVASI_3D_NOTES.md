# Catatan kerja — Renovasi 3D

Spec: `docs/spec/RENOVASI_3D.md`. Basis: salinan utuh Useless Dashboard (commit `import:`).

---

## P0.1 — Audit kode

### Peta modul (≈14.7k baris, 1 devDependency: vite)

| Folder | File | Peran | DOM? | Status di 3D |
|---|---|---|---|---|
| `core/` | `bus` | pub/sub 30 baris | tidak | **pakai ulang** |
| | `ticker` | satu rAF, clamp dt, `second`, dial `quality` 0.35–1 | tidak | **pakai ulang** (renderer 3D mendengar `tick`) |
| | `store` | `uad.v1`, debounce 250ms + plafon 1s | localStorage | **pakai ulang + migrasi v2** (P0.2) |
| | `audio` | synth, stasiun, mixer ambience, `energy()` bass/beat | AudioContext | pakai ulang; P5 tambah panner posisional |
| | `motion` | reduced motion, `data-motion` | `<html>` | pakai ulang |
| | `net` | online/offline + SW register | `navigator` | pakai ulang |
| | `zen` | siklus 4-7-8, `zen.breath` | `<html>` | pakai ulang (bangku/bukit memicu `zen.start()`) |
| | `play` | mode fish/skip/stars/leaves | `<html>` | pakai ulang (di 3D mode dipicu benda: joran, batu, bukit, pohon) |
| | `achievements` | 31 pencapaian | tidak | pakai ulang |
| | `util` | math, rng, noise, warna, `el()` | `el/$` saja | pakai ulang |
| `scene/` | `palette` | 9 keyframe + grade cuaca + musim + napas → `getPalette()`; `applyPaletteToDOM()` | `applyPaletteToDOM` saja | **→ `sky/`**, `applyPaletteToDOM` dipisah ke `ui/` agar `sky/` murni |
| | `season` | musim, deklinasi, alt. matahari maks | tidak | **→ `sky/`** |
| | `planets` | Kepler: `planetPositions`, `sunPosition` | tidak | **→ `sky/`** |
| | `horizon` | garis pantai 2D dalam fraksi layar | tidak | **khusus 2D** → `classic/` |
| | `pixel` | Bayer4, sprite ASCII, font 3×5 `pxText` | canvas | → tetap dipakai (tekstur 3D dibuat dari `makeSprite` → `CanvasTexture`) |
| | `Scene`, `Layer`, `layers/*` (15) | renderer 2D | canvas | **khusus 2D** → `classic/` |
| `services/` | `weather` (Open-Meteo + geoloc + `lastWeather`), `iss` (fetch + `reckon`), `quotes` | fetch | **pakai ulang apa adanya** |
| `widgets/` | `Widget` + 15 panel | DOM | **pakai ulang**; `Widget.mount(parent)` bisa menempel ke wadah mana pun |
| `ui/` | `feedback` (toast), `zen-ui`, `command` (⌘K), `postcard` | DOM | pakai ulang; `postcard` butuh sumber kanvas WebGL (mode foto) |
| `styles/` | tokens, panels, widgets, overlays | — | tidak berubah |
| root | `sw-template.js` + plugin di `vite.config.js` | precache **semua** file bundle | — | chunk lazy 3D otomatis ikut ter-precache (`Object.keys(bundle)`) |

### Bus: siapa memancarkan, siapa mendengar

| Event | Emit | Listen |
|---|---|---|
| `tick` | ticker | Scene, Widget (yang punya `tick`), zen, zen-ui |
| `second` | ticker | main (fps, golden hour), achievements, Widget |
| `weather` | **WeatherWidget** | Scene, main, achievements, Widget(`onWeather`), IssWidget |
| `phase` | Scene | main (caption), Widget(`onPhase`), IssWidget |
| `season` | Scene | achievements |
| `season:override` | main | Scene |
| `iss` | **IssWidget** | IssLayer |
| `coins` | Critters, Fishing, Stones, Coffee, Fortune, Inventory, Pet | **IdleWidget** (satu-satunya yang menulis `coins`) |
| `play` | play | Fishing, Stars, Stones, PlayWidget |
| `scene:click` | Scene | Critters, Fishing, Stars, Stones |
| `water:ring`, `splash` | Fishing, Stones | WaterLayer, audio |
| `fish`, `fish:bite`, `skip`, `leaf`, `wish`, `lightning` | layer masing-masing | (tidak ada — dipakai sebagai kait) |
| `constellation` | StarsLayer | PlayWidget |
| `stars:clear/forget/name` | PlayWidget | StarsLayer |
| `pet:fed`, `pet:poked` | PetWidget | PetLayer |
| `music` | audio | MusicWidget |
| `net` | net | main, achievements |
| `net:ok/fail` | weather service | net |
| `zen` | zen | main, Scene, zen-ui |
| `achievement` | achievements | AchievementsWidget |
| `cmd:glass/time/season` | command | main |
| `cmd:coffee/feed/quote/weather` | command | Coffee/Pet/Quote/WeatherWidget |
| `sfx`, `toast` | banyak | audio, feedback |

### Temuan yang menentukan arsitektur 3D

1. **Widget bukan sekadar tampilan — mereka memegang loop data.** `WeatherWidget` memanggil `getWeather()` dan memancarkan `weather`; `IssWidget` mem-poll ISS dan memancarkan `iss`; `IdleWidget` satu-satunya penulis `coins` (semua `bus.emit('coins')` hilang bila ia tidak terpasang); `MoodWidget` menyimpan drift mood; `InventoryWidget` menemukan barang seiring waktu.
   **Keputusan:** di mode 3D ke-15 widget **tetap di-mount** ke satu wadah DOM (buku saku), tersembunyi saat tidak dibuka. Benda di dunia hanya *memfokuskan* panel yang sudah hidup. Nol duplikasi logika, satu store, dan Mode Klasik tidak tersentuh.
2. **Logika permainan menempel di layer 2D, dalam koordinat layar.** Gigitan Poisson (`FishingLayer`, `MEAN_WAIT=9`, `BITE_WINDOW=1.1`), fisika lempar batu (`StonesLayer`, `BITE_ANGLE=0.25`), field bintang (`StarsLayer`, `rng(20260713)`, 190 bintang, urutan draw `size,x,y,base,speed,phase,warm`). Untuk P4, bagian murninya diekstrak (`sky/stars.js`, `core/fishing` dst.) dan dipakai dua renderer.
   **Bintang ke 3D:** bintang *i* mendapat arah di kubah langit dari draw yang sama: `az = x/W · 360°`, `alt = 90° − (y/(0.6H))·90°` (dengan `y = r^1.7`, jadi tetap padat di zenit). Indeks tidak berubah → rasi tersimpan tetap menunjuk bintang yang sama.
3. **`palette.js` hampir murni** — hanya `applyPaletteToDOM` yang menyentuh DOM. Itu satu-satunya yang perlu dipisah agar `sky/` bisa dites tanpa jsdom.
4. **⌘K belum punya perintah "buka panel X".** P3 menambah satu perintah per panel (memakai pemetaan benda → panel yang sama).
5. **SW sudah siap untuk chunk lazy**: precache diambil dari seluruh bundle, jadi `world-*.js` dan three ikut di-cache tanpa ubahan plugin. Yang perlu dicek di P6: ukuran precache naik ±150 KB gz.
6. **Bug kecil di `store`:** `read()` mem-spread `DEFAULTS` secara dangkal, jadi `state.mix`/array berbagi referensi dengan `DEFAULTS`; `reset()` lalu menulis objek yang sama kembali. Aman hari ini karena semua penulis mengganti nilai (bukan mutasi), tetapi migrasi v2 akan memakai `structuredClone(DEFAULTS)`.
7. **Kunci yang tidak ada di DEFAULTS:** `coffeeDay`, `seasonsSeen`. Migrasi harus membawanya.
8. **"Nol file aset" vs font:** ada 6 file `.woff2` (Press Start 2P, Silkscreen) di `src/assets/fonts`. Overlay DOM tetap memakainya; teks di dalam dunia 3D memakai font 3×5 `pxText` (dari kode). Klaim README sudah jujur soal font ini ("plus 17 KB of font").

### Bisa dipakai ulang di 3D vs khusus 2D

- **Ulang langsung:** semua `core/`, `services/`, `widgets/`, `ui/feedback`, `ui/command`, `ui/zen-ui`, `styles/`, `scene/pixel` (untuk tekstur), `sky/*` (setelah dipindah).
- **Ulang setelah ekstraksi logika murni:** Fishing (Poisson), Stones (sudut), Stars (seed + indeks), Critters (populasi musim dari `season.js`), Pet (perilaku menghindar), Weather (akumulasi salju `_settleSnow` di `Scene`), Fog (offline → kabut).
- **Khusus 2D (→ `classic/`):** `Scene`, `Layer`, `horizon`, 15 layer, parallax mouse, lentera kursor, `postcard` versi kanvas 2D.

### Ukuran saat ini (baseline untuk §7)

Diukur di P1 setelah `npm run build` (belum dijalankan agar P0 tidak menyentuh apa pun). README mengklaim ~59 KB JS gz + 17 KB font.

---

## P0.2 — Rencana migrasi store `uad.v1` → `uad.v2`

**Prinsip:** baca `uad.v1` kalau `uad.v2` belum ada, normalisasi, tulis `uad.v2`, **jangan hapus `uad.v1`** (Mode Klasik versi lama yang ter-cache SW masih bisa membacanya; rollback aman). Satu fungsi murni `migrate(raw) → state` agar bisa dites.

```
read():
  v2 = parse(localStorage['uad.v2'])
  if v2  → return migrate(v2)            # idempoten: v2 lewat apa adanya + kunci baru
  v1 = parse(localStorage['uad.v1'])
  if v1  → return migrate(v1)            # tulis ke uad.v2 saat flush pertama
  return structuredClone(DEFAULTS)
```

**Aturan `migrate`:**
- Semua kunci v1 dibawa apa adanya, termasuk yang tidak di DEFAULTS (`coffeeDay`, `seasonsSeen`). Kunci tak dikenal **tidak dibuang**.
- Normalisasi tipe: `coins` → angka ≥ 0; `catches`, `achievements`, `inventory`, `seasonsSeen` → array string unik; `stars` → array `{ name: string, pts: int[] (0–189), at: number }`, entri dengan indeks di luar rentang dibuang satu-satu (bukan seluruh daftar); `mix` → objek 4 kunci 0–1.
- Tambah `v: 2`.
- Tambah blok 3D dengan default:
  - `mode: 'auto'` (`'auto' | 'classic' | '3d'`; auto = 3D bila WebGL2 ada)
  - `player: { x, z, yaw, pitch, area }` — `null` = bangun di pondok
  - `view: { fov: 70, headBob: false, snapTurn: false, pointerLock: false, quality: 'auto' }`

**Contoh — masuk (v1):**
```json
{ "sound": true, "volume": 0.4, "coins": 312.6, "mood": 71,
  "mix": { "rain": 0.5, "wind": 0, "crickets": 0.2, "hearth": 0 },
  "achievements": ["arrive","angler","angler"], "catches": ["carp","boot"],
  "stars": [{ "name": "Ladle", "pts": [57,12,190], "at": 1760000000000 }],
  "coffeeDay": "2026-10-19", "seasonsSeen": ["autumn"], "glass": true }
```
**Keluar (v2):**
```json
{ "v": 2, "sound": true, "volume": 0.4, "coins": 312.6, "mood": 71,
  "mix": { "rain": 0.5, "wind": 0, "crickets": 0.2, "hearth": 0 },
  "achievements": ["arrive","angler"], "catches": ["carp","boot"],
  "stars": [{ "name": "Ladle", "pts": [57,12], "at": 1760000000000 }],
  "coffeeDay": "2026-10-19", "seasonsSeen": ["autumn"], "glass": true,
  "mode": "auto", "player": null,
  "view": { "fov": 70, "headBob": false, "snapTurn": false, "pointerLock": false, "quality": "auto" },
  "...": "semua DEFAULTS lain yang belum ada" }
```
(Indeks 190 di luar 0–189 dibuang; rasi tetap ada karena masih 2 titik. Rasi yang tersisa < 2 titik dibuang.)

**Tes (Vitest, P1):** v1 kosong → DEFAULTS; v1 penuh → tidak ada kunci/nilai yang hilang; idempoten (`migrate(migrate(x)) == migrate(x)`); JSON rusak → DEFAULTS tanpa throw; `uad.v1` tetap ada setelah flush.

---

## P0.3 — Peta dunia

Skala: 1 kolom ≈ 2 m, 1 baris ≈ 10 m. Peta 150 × 150 m, utara ke atas. Pemain bangun di pondok, menghadap jendela ke danau.

```
 N  0    10   20   30   40   50   60   70   80   90  100  110  120  130  140  150 m
  0 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  gunung (background pass)
 10 ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTT^^^^
 20 ^~~~~~~~~~~~~~~~~ DANAU ~~~~~~~~~~~~~~~~~~~~~~TTTTT  TEPI HUTAN  TTTTTTTTTT^^^^
 30 ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~TTTTT   [⑭ pohon daun]  TTTTTT^^^^
 40 ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~TTTT                 . TTTTT^^^^
 50 ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~TT  ,,,,,,,,,,,,,,.  TTTTT ^^^^
 60 ^~~~~~~~~~~~~~~~~~~~~ ⑬batu ~~~~~~~~~~~~~~~~~~~   ,,, PADANG ,,,,.   /\   ^^^^
 70 ^~~~~~~~~~~~~~~~~~~~~~ ..::  ~~~~~~~~~~~~~~~~~~  ,,,,,,,,,,,,,,,,.  /  \  ^^^^
 80 ^~~~~~~~~~~~~~~~~~~~~~~~~ ║ ~~~~~~~~~~~~~~~~~~ ,,,,,,,,,,,,,,,,,, /BUKIT\ ^^^^
 90 ^~~~~~~~~~~~~~~~~~~~~~~~~ ║ DERMAGA ⑫joran ~~~  ,,,,, ⑮slime ,,,, / ⑩ ⑪ \  ^^^
100 ^~~~~~~~~~~~~~~~~~~~~~~~~ ║ ~~~~~~~~~~~~~~~~~~~ ,,,,,,,,,,,,,,,,,. ‾‾‾‾‾‾‾  ^^^
110 ^~~~~~~~~~~~~~~~~~~~~~~~~ ╚═════.............................../          ^^^^
120 ^ ~~~~~~~~~~~~~~~~~~~~~~ ......:   +-----------+ beranda ⑤⑥            TT ^^^^
130 ^     ,,,,,,,,,,,,,,,,, ......:    |  PONDOK   |= ③bangku               TT ^^^^
140 ^^  TT ,,,,,,, HALAMAN ④kotak surat|  (int.)   |                       TT^^^^
150 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^+-----------+^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  kabut + gunung
         ~ air   T pohon   , rumput/bunga   . jalan setapak   ║═ dermaga   ^ batas (gunung/kabut)
```

- **Pondok** (≈12 × 9 m) di selatan-tengah, pintu menghadap utara ke beranda; jendela barat menghadap danau (jendela menyala yang sama dengan versi 2D).
- **Jalur setapak:** beranda → kotak surat (barat) → dermaga (barat laut); beranda → padang → bukit (timur laut, naik ±8 m).
- **Danau** menempati barat-utara (±40% peta), dermaga menjorok 25 m. Air = batas alami barat.
- **Hutan** menutup utara-timur; **bukit** di timur, titik tertinggi, langit terbuka 360°.
- **Batas:** collider melingkar lunak di r ≈ 70 m dari pusat + gunung/kabut. Pemain berhenti, tidak terpental.

### 15 benda dan tempatnya

| # | Panel | Benda | Tempat | Koordinat (x, z m) |
|---|---|---|---|---|
| ① | Local Time | jam tangan (+ jam dinding) | pergelangan; dinding pondok | pemain; (75, 138) |
| ② | Weather | barometer + termometer | samping pintu, beranda | (82, 122) |
| ③ | Mood | cermin (+ cincin di jam tangan) | dinding pondok | (70, 140) |
| ④ | Useless Fact | koran di kotak surat | halaman | (55, 140) |
| ⑤ | Daily Fortune | toples kue keberuntungan | meja pondok | (74, 134) |
| ⑥ | Quote | mading (papan gabus) | dinding pondok | (79, 140) |
| ⑦ | Ambient Loop FM | radio | meja pondok | (76, 134) |
| ⑧ | Ambience | kenop di radio + sumber posisional | radio; perapian, padang, atap | (76, 134) |
| ⑨ | Coffee | ceret dan cangkir | dapur pondok | (84, 136) |
| ⑩ | Overhead (ISS) | teleskop | puncak bukit | (128, 85) |
| ⑪ | Play — Constellations | batu datar untuk berbaring | puncak bukit | (132, 88) |
| ⑫ | Play — Fish | joran bersandar di tiang | ujung dermaga | (50, 88) |
| ⑬ | Play — Skip stones | tumpukan batu pipih | tepi danau | (45, 62) |
| ⑭ | Play — Catch leaves | pohon besar | tepi hutan | (110, 30) |
| ⑮ | Pet | slime (bergerak) | padang, mengikuti pemain | dinamis |
| — | Idle Earnings | toples koin | rak pondok | (71, 136) |
| — | Pockets | saku (dari jam tangan) | pemain | — |
| — | Tiny Achievements | piagam + rak piala | dinding pondok | (86, 140) |

(15 panel → 18 benda: Play dipecah ke 4 tempat fisiknya; Ambience punya kenop + sumber suara.)

Bangku Zen: beranda ③ dan batu datar ⑪. Mode foto dari menu jam tangan.

---

## P0.4 — Capture "before"

Belum dijalankan: spec meminta izin dulu sebelum proses berat (Chrome headless, laptop bising). Rencana: `vite preview` + Playwright, viewport 1920×1080, 1366×768, 430×932, 390×844, jam dikunci ke Noon dan Midnight agar pembanding P1 deterministik, simpan ke `docs/screens/renovasi-3d/before-<w>-<noon|midnight>.png`.

---

## Keputusan terbuka (untuk user)

1. Mode foto/postcard dan teks di dunia memakai font 3×5 dari kode; overlay DOM tetap memakai woff2 yang sudah ada. OK?
2. Repo baru hanya lokal (spec: "jangan push"). Buat repo GitHub privat `-PIXEL-SERIES-Useless-Dashboard-3D` nanti?

---

## Decisions (2026-10-20, from the user)

Notes and commits are in English from here on. The P0 sections above stay in Indonesian.

| Topic | Decision |
|---|---|
| Repo | Public: github.com/Rinkusuu/-PIXEL-SERIES-Useless-Dashboard-3D. **Push after every commit** (this overrides "jangan push" in the spec). No attribution trailers. |
| Stops | As the spec says: end of P0 and P2. P1 runs straight into P2. |
| Captures | "Before" now: 1920/1366/430/390 × Noon/Midnight. |
| Internal resolution | **360 rows** (Classic stays at 270). |
| Style | Low-poly, flat shading, small pixel textures. |
| World size | **250 × 250 m** (the P0.3 map scales up). Extra areas: **a stream from the hill into the lake with a wooden bridge**, **a small island in the lake** (visible, not reachable), **ruins / a fire lookout tower in the forest** (a second viewpoint). |
| Cabin | One room plus a **sleeping loft with a ladder**, so the player needs a climbable volume. |
| First visit | Fade in from black, waking in the loft bed and facing the window. |
| Look | **Pointer lock on click** (Esc releases it). Dragging to look stays as the fallback and on touch. |
| Picking | 1 px centre dot. The object under it gets an outline and a tooltip, E to use. |
| Panel overlay | Centred glass panel. The world stays live behind it, slightly dimmed and blurred. |
| Default mode | Auto 3D when WebGL2 is available, otherwise Classic. Switchable in settings. |
| Time | The real clock, as today (overrides still work through ⌘K). |
| UI language | English. |
| Test device | Mac, Chrome. |
| Bundle budget | No hard cap, but every number gets reported honestly. |

## P0.4 — "Before" captures (done)

`docs/screens/renovasi-3d/before-{1920,1366,430,390}-{noon,midnight}.png`, taken with `node scripts/capture.mjs before` against `vite preview`: geolocation fixed to Jakarta, clear weather forced, hour frozen through `timeOverride`. Clocks and particles stay live, so a later comparison should check layout and colour, not pixel-for-pixel equality.

**Baseline bundle (vite build, pre-renovation):** JS 161.6 KB → **59.4 KB gz** · CSS 41.6 KB → **8.2 KB gz** · fonts 17.3 KB (6 woff2) · index.html 1.6 KB gz.

Housekeeping: `@playwright/test` added as a devDependency (the spec needs it for e2e in P1/P3; Chromium headless shell downloaded to the user cache).

---

## P1 — Foundations

### P1.1 — sky/ and classic/ (done)
- `sky/`: `palette` (pure now), `season`, `planets`, plus the new `stars` (`STAR_COUNT`, part of the save format).
- `classic/`: `Scene`, `Layer`, `horizon`, `layers/` (15 layers, unchanged).
- `ui/pixel.js` (shared: classic layers, widgets, and later the 3D textures) and `ui/palette-dom.js` (`applyPaletteToDOM`, used by both renderers).
- `docs/screens/renovasi-3d/p1-moved-*` matches `before-*` apart from live data (clock, ISS, quote). Bundle unchanged at 59.41 KB gz.

### P1.2 — Vitest, sky tests, store migration (done)
- `vitest@3.2.7` (works with vite 5). `npm test` runs 24 tests in about 0.3 s.
- `src/sky/sky.test.js` turns the README validation table into tests. Computed values: solstice dec **23.43°**, London **61.9° / az 179.9°**, Sydney **32.7° / az 0.1°**, Venus max elongation **47.0°**, Jupiter yearly march **35.9°**.
- `src/core/migrate.js` + `src/core/migrate.test.js`: the store reads `uad.v2`, falls back to `uad.v1`, and writes `uad.v2` only.
- One change from the P0.2 plan: **catches are a log, not a set**. Two carp stay two carp, so they are not deduplicated.
- `view.pointerLock` defaults to `true`, per the review decision.
- The store's DEFAULTS aliasing (P0.1 finding 6) is fixed with `structuredClone`, and a test covers it.

### P1.3 — Mode picker (done)
- `store.mode`: `auto` (3D when WebGL2 exists), `classic`, or `3d`. Asking for `3d` without WebGL2 gives Classic plus a toast. Checked in Chromium with WebGL disabled: auto → classic, 3d → classic with the toast, no page errors.
- Switching is a topbar button ("Walk" / "Classic") and a ⌘K command. It stores the choice and reloads; `pagehide` flushes the store. That is simpler than tearing a renderer down inside a live page.
- `world/index.js` is lazy (`import()` in main.js), a **0.27 KB gz** chunk for now. At this stage it clears a WebGL2 canvas to the palette's `sky[1]`. If the world fails to start, Classic is built in place and the failure is **not** saved as the user's choice.
- **`core/env.js`** now holds the renderer-independent state that used to live in `classic/Scene.js`: weather, hour, season, palette at 4 Hz + `phase`, snow settling, offline easing, bass, breath. Scene keeps only canvas, parallax, pointer, bloom and layers. The 3D world reads the same `env.state`, so there is one clock, one palette and one snow depth.
- 3D mode hides the panel grid until the pocket book exists (P3), but the widgets **stay mounted** because they run the weather/ISS/coin loops (P0.1 finding 1). Glass and Postcard are hidden in 3D until photo mode.
- **Bug fixed along the way:** `Scene._bloom` was never initialised, so `Math.abs(bloom - undefined)` was always `NaN` and the bloom never followed the music's bass, though the README says it does. It now starts at 0.85 (the CSS resting opacity), so the resting look is unchanged.
- Captures: `p1-classic-*` matches `before-*` apart from one extra topbar button (Walk). `p1-3d-*` shows the palette-coloured empty world with the topbar.
- Bundle: shell 165.3 KB → **60.9 KB gz** (+1.5 KB: env, migrate, mode). World chunk 0.27 KB gz.

---

## P2 — A world you can walk through

### Decisions taken in the P2 question round (2026-10-20)
Lighting: **dynamic shadows plus point lights**. Lake: **planar reflection**. Dither: **Bayer 4×4, gentle**. Walking speed: **2.2 m/s**. Textures: **16×16 pixel textures from ASCII**. Grass: **instanced blades with wind in the shader**. HUD: centre dot, the topbar, first-visit hints, fps + tier. Night sky: **a dome with 1 px stars**.

### P2.1 — Renderer, post pass, tiers (done)
- `world/renderer.js`: the frame renders at 240/300/360 rows by tier with an integer CSS upscale, same policy as Classic. Passes: **background** (sky dome, bodies, mountains; own camera, near 1 / far 4000), **world** (near 0.05 / far 320), **emissive** at half res (occluders in black, then layer 1 only), a two-pass **blur**, then **post**.
- `world/post.js`: sRGB → Bayer 4×4 offset → **16³ 3D LUT** built from a palette **derived from the current keyframe**: 20 material swatches × 5 light levels via `pal.lit`, plus the sky stops, fog, glow, accent, sun and the warm lights. It is rebuilt once a second or on a phase change, and costs one texture fetch per pixel. The bloom is screen-blended after the LUT, so it stays smooth like the classic CSS blur.
- `world/quality.js`: tiers set resolution, grass and tree density, fog distance, reflection resolution, shadow map size, bloom and point-light count. Auto tier starts high on desktop and medium on coarse pointers, takes the median frame time over 3 s, steps down if slow, and measures once more after a step. It never steps up.

### P2.2 — The world (done)
- `world/layout.js` is the world's horizon.js: places, paths, stream, `heightAt`, `isWater`, `forestDensity`, `grassDensity`. Pure, with 9 tests.
- **Terrain**: a 2 m flat-shaded grid with face colours (meadow, path, sand, mud, forest floor) and the ground texture. A **skirt** ring past the map edge fades into the fog: from the tower you used to see past the edge of the world.
- **Cabin**: one room, gable roof, **loft with a ladder**, hearth + chimney, table/chairs/lamp/rug, shelf, kitchen counter, bed, porch, bench, four lit windows, and a door that opens with E. The table was moved after the walk test found the chair blocking the doorway.
- **Lake**: Reflector (three addon) with a custom shader. Ripples are measured in reflection texels, and wherever the reflection is empty (the sky lives in the background pass) it shows the palette's sky. Grass is excluded from the reflection camera. Low tier uses flat water. The **stream** is a ribbon down to the lake, crossed by a **bridge** on the path.
- **Forest**: two instanced species, about 2200 trees from seeded rejection sampling, shuffled so lower tiers thin the forest evenly (and switch those trunks' colliders off). The leaf tree and the island pine always stay. Past the walkable disc there is a dense wall of trees.
- **Meadow**: up to 70k four-blade tufts in 25 m tiles (frustum- and distance-culled), plus flowers. Wind is a travelling gust injected into Lambert, so lighting, fog and shadows still work. Reduced motion stills it, as in Classic.
- **Props**: dock, bridge, **fire lookout** (deck 9 m up, 15 m stair), mailbox, telescope, flat rock, skipping stones, boulders.
- **Island** in the lake: visible, not reachable.
- `world/collision.js`: a cylinder player; segments and circles with vertical ranges; walkable surfaces (flat, sloped, or rotated as with the bridge); step 0.45 m; drifting down instead of falling. 12 tests.

### P2.3 — The player (done)
- 2.2 m/s with no running or jumping. Eye height 1.6 m. **Waking**: fade from black while lying in the loft bed, then sitting up and standing (2.2 s). Reduced motion skips straight to standing.
- Desktop: WASD/arrows, **pointer lock on click** (Esc releases), drag-to-look when pointer lock is off, E uses, centre dot + tooltip.
- Touch: thumbstick under the left thumb, right thumb looks, **tap the ground to walk there** (ray march over the height field), and a contextual Use button.
- Comfort (`ui/world-settings.js`, topbar ⚙ World and ⌘K "World settings"): FOV 55–100°, head bob (off by default, never under reduced motion), snap turn (30°), pointer lock, quality (auto/low/medium/high), back to Classic.
- Walk test in headless Chromium: E opens the door; walking out reaches the yard (z 69.3); a closed door stops you at 73.82 (wall + body radius); you can climb the ladder to the loft (y 3.3); you stop at the lake shore and the edge of the water; you can climb the tower to its deck (y 11.6), where the railing stops you. Touch: a tap walks about 4 m toward the tapped point, and the thumbstick walks 4.7 m in 2 s.

### P2.4 — A real sky, the palette as light (done)
- `sky/moon.js` (new): Schlyter lunar theory with the 10 largest perturbations, under a degree of error. Tested: full moon opposite the sun, new moon beside it, rising in the east and setting in the west.
- `sky/stars.js` `starField()` consumes the seed in **exactly** StarsLayer's order, so star #57 is the same star in both renderers (tested). Altitude 6–90°, crowded toward the zenith.
- `world/sky3d.js`: the dome uses the palette's three sky stops plus a sun glow. The sun and moon (with phase and earthshine) sit at their **real alt/az**, and the moon pales by day. Stars twinkle by opacity only; **planets do not twinkle** (no time term in their shader). Classic's three ridges wrap around the world as hazy rings.
- `world/lights.js`: one key light that casts shadows — the sun, or the moon after sunset, scaled by phase — at the body's real direction. A hemisphere light uses half-desaturated sky from above and warm earth from below. With full-strength sky and green land bounce every indoor wall turned khaki. Hearth (always on, flickers), table lamp and porch lantern (after dark).
- The scene fog and the dome's below-horizon colour both use the palette's fog colour, so the edge of the land dissolves.
- **Bug found:** `core/env.js` assumed a default longitude of 0°. Before the weather arrived with a real location, a 22:30 Jakarta clock showed a noon sun over Greenwich in a night palette. The default longitude now comes from the timezone (15° per hour), which also helps Classic's planets.

### P2.5 — Captures and performance (done)
`docs/screens/renovasi-3d/p2-{1366,390}-{cabin,door-open,meadow-noon,lake-dusk,hill-night}.png` via `node scripts/capture-world.mjs p2` (`?debug` exposes `window.__world` for teleporting; it is off without the flag).

Headless Chromium on this Mac (ANGLE/Metal), 120 rAF frames per view:

| View | tier | buffer | median / p95 frame | draw calls | triangles (all passes) |
|---|---|---|---|---|---|
| 1366 cabin | high | 683×384 | 16.7 / 16.8 ms | 1390 | 2.61 M |
| 1366 door open | high | 683×384 | 16.7 / 16.7 ms | 1132 | 2.60 M |
| 1366 meadow noon | high | 683×384 | 16.7 / 16.7 ms | 814 | 2.21 M |
| 1366 lake dusk | high | 683×384 | 16.7 / 16.7 ms | 278 | 1.30 M |
| 1366 hill night | high | 683×384 | 16.7 / 16.8 ms | 782 | 2.32 M |
| 390 cabin | medium | 130×282 | 16.7 / 16.8 ms | 944 | 1.36 M |
| 390 meadow noon | medium | 130×282 | 16.7 / 16.8 ms | 380 | 0.95 M |
| 390 lake dusk | medium | 130×282 | 16.7 / 16.8 ms | 264 | 0.95 M |

Honest caveats:
- Every view is pinned at the 60 Hz vsync, so these numbers show the target is met on this machine but say **nothing about headroom**.
- The 390 runs are desktop GPU emulating a phone, not a real mid-range phone.
- The A/B method from §7 (two checkouts, alternating slots, ≥3 runs) belongs to P6, where there is something to compare.
- **Known cost:** the cabin is about 200 separate meshes × 4 passes (shadow, main, glow occluders, reflection), hence 1390 calls. P6 should merge the static meshes by material.

**Bundle:** shell **62.3 KB gz** (+0.9 KB since P1: world settings, starField, moon). **3D world chunk 166.0 KB gz**, about 140 KB of that three.js. Lazy, so Classic does not pay for it. CSS 8.8 KB gz. Fonts unchanged.

---

## P2.6–P2.7 — Restyle: voxel art + modern lighting (after *Shadows of Doubt*)

**Why:** after trying P2 the user asked for the look of *Shadows of Doubt*: **voxel art** (the developer calls it voxels, built in MagicaVoxel) under **modern lighting** (Unity HDRP: volumetrics, many lamps, AO, grading), at native resolution. Decisions:
- voxel + modern lighting, native resolution
- the LUT + Bayer dither replaced by **smooth colour grading**
- done **before P3**

**This overrides spec §2 for the 3D world:** no low internal resolution and no LUT quantisation. Classic Mode is untouched. "Zero asset files" still holds: every voxel model is generated in code.

### P2.6 — Voxel geometry
- `world/voxel.js`: a VoxelGrid (Uint8 palette indices, a shared palette with 3 shades per colour) with `fillBox` (world corners, carving with 0) and `fill` (a predicate, for slopes, gables, round things). Paints: `grain`, `courses` (log walls, shingles), `planks`, `blocks` (stone). **Greedy mesher** with **per-vertex voxel AO**, which merges only when colour and all four corner AO values agree. 6 tests.
- **Cabin**: one 10 cm grid, one mesh (it used to be about 200 meshes). The roof and gables are voxel terraces, the ladder rails are slanted voxel runs, and the door is its own grid on the hinge. Collision is unchanged.
- **Terrain**: 0.5 m columns, heights in 0.25 m steps (`layout.blockHeight`, 2 tests). Tops merge in runs along x, and walls appear only where neighbours differ: 277k triangles, built in about 0.6 s. Collision, trees, grass and props all stand on `blockHeight`, so feet land on the visible steps.
- **Models** (`world/models.js`): pine and round tree (25 cm voxels near, 50 cm LOD far), boulders, 4 cm grass tufts, flowers, lamp posts. Trees and grass turn in quarter turns only, so they stay aligned with the voxel world.
- **Forest**: 32 m tiles × {near, far} LOD per species, so camera, shadow and reflection culling work per tile. Density prefix and collider switching are unchanged.

### P2.7 — Lighting and frame
- **Native resolution**: DPR capped at 1.5 × tier scale (high 1, medium 0.75, low 0.5). `image-rendering: auto` on the 3D canvas.
- **Grade** (`post.js`): ACES, then lift toward the palette's zenith colour and gain toward its glow, plus exposure raised at night and a vignette, recomputed at 4 Hz.
- **Volumetric light** (`world/volumetric.js`): half res, 8 steps (medium) or 14 (high). Each step samples the key light's PCF shadow map (`sampler2DShadow`), applies Henyey–Greenstein forward scattering, and adds analytic halos around every lit point light. Air density = 0.004 + palette fog + fog weather + offline, so being offline thickens the air too. Blurred, then added before tone mapping.
- **Lamp posts**: 10, placed every 16 m along the paths (`layout.LAMPS`). Six pooled PointLights are re-dealt once a second to the nearest posts and lit after dark. The glass sits on the glow layer.
- **Bloom without the occluder pass**: the glow target **shares the world's depth texture**, so glowing things are hidden by whatever stands in front of them without drawing the world again in black.

### Measurements (headless Chromium, ANGLE/Metal, this Mac)

| View | tier / buffer | frame median / p95 | calls | triangles (all passes) |
|---|---|---|---|---|
| 1366 cabin | high 1366×768 | 16.7 / 16.7 ms | 624 | 8.6 M |
| 1366 meadow noon | high | 16.7 / 16.8 ms | 466 | 7.5 M |
| 1366 lake dusk | high | 16.7 / 16.8 ms | 268 | 3.7 M |
| 1366 hill night | high | 16.7 / 16.8 ms | 554 | 8.8 M |
| 1366 yard night | high | 16.7 / 16.7 ms | 304 | 5.6 M |
| 390 cabin | medium 293×633 | 16.7 / 16.7 ms | 378 | 4.6 M |
| 390 meadow noon | medium | 16.7 / 16.8 ms | 236 | 2.9 M |

How it got there:
- The first voxel pass drew **46 M triangles**: a 2,000-triangle tree × 2,192 trees × every pass, and one bounding sphere for the whole forest, so nothing was ever culled.
- Forest tiles + LOD brought that to 14 M.
- Dropping the occluder pass brought it to 11.6 M.
- Single-colour grass stalks (a gradient per stalk broke the greedy merge: 112 → 40 triangles per tuft) brought it to 8.6 M.
- Still vsync-bound, so headroom is unknown. Still not tested on a real phone.

**Bundle:** shell 62.3 KB gz (unchanged); world chunk **156.7 KB gz** (−9 KB: the textures and LUT code are gone).

Walk + touch tests rerun on the stepped terrain: all pass (door, out to the yard, closed door stops at 73.82, ladder to the loft, shore, tower deck y 11.5, tap-to-walk, thumbstick).

Captures: `p2v-{1366,390}-*` (plus `p2v-1366-yard-night`) next to the low-poly `p2-*`.

---

## P3 — The dashboard inside the world

### Decisions (2026-10-20, P3 question round)
| Topic | Decision |
|---|---|
| Watch (Q) | **Voxel 3D model on the wrist.** The arm rises into view and the face is a pixel canvas showing **time + date, weather + temperature, ISS** (Q again for the next page). It vibrates when the ISS is visible. |
| Opening a panel from an object | The real widget, **centred glass panel**, world dimmed and live behind it (as decided in P0). |
| Outline | **1 px line in the palette's glow colour** (edge-detect on an object mask in the post pass). |
| Pocket book | **B key** (separate from Q); all panels, scrollable, over the live world. |
| Photo mode | **Free camera around the player** (radius ~10 m), then PNG export with the postcard frame. |
| Object detail | **2.5 cm voxels**, very detailed. |
| Zen | **E on the bench (or the hilltop rock) → sit down + Zen**; Esc stands up. |

Implementation note: panels stay mounted in `#grid` (they run the weather/ISS/coin loops). Opening one or the pocket book shows the grid as an overlay, filtered to one panel or showing all. Nothing is moved and no widget changes.

### P3.1 — Wristwatch (done)
Voxel arm + watch (2.5 cm voxels) attached to the camera. Q raises it, Q steps through time / weather / ISS, and Q again or Esc lowers it. The face is a 32×24 canvas in the classic 3×5 font (`:` `°` `/` added to `ui/pixel.js`). It buzzes once when the ISS becomes visible after dark. Reduced motion fades instead of swinging. The screen reader hears each page through `hud.announce`, plus a per-minute `role="timer"`. Touch gets a ⌚ button. `watchPages` is pure and has 5 tests.

### P3.2 — Objects, outline, panels, pocket book (in progress: working, not finished)
Done:
- 14 objects (`world/objects.js`, 2.5 cm voxels): clock, barometer, telescope, mailbox, fortune jar, corkboard, radio, ambience knobs, mirror, kettle, coin jar, certificates, fishing rod, slime. All 14 can be targeted from a natural standing spot (automated check), and E opens the real panel. A test checks that the mapping matches the widget titles.
- **1 px outline** in the palette glow colour: a mask pass that shares the world's depth, edged in the post pass.
- The cabin's walls now block your gaze, so you can't use things through a wall.
- `ui/panels.js`: panels and the **pocket book** (B, 📖 on touch) open as a filtered overlay of `#grid`. Esc or a tap on the backdrop closes them, and walking/pointer lock are released while one is open. ⌘K in 3D has "Open: <panel>" for every panel, plus the pocket book.
- Fixes: the shelf was a solid block (it swallowed the coin jar) and is now an open frame. `teleport` and `lookAt` debug helpers added.

Left for next session: P3.2 captures + perf pass; P3.3 (Zen on the bench/rock, photo mode); P3.4 (Playwright e2e: out the door → glance at the watch → open the corkboard).

### P3.2 — finished
Captures:
- World views: `p3-{1366,390}-{cabin,door-open,meadow-noon,lake-dusk,hill-night,yard-night}`
- Features: `p3-1366-watch`, `p3-1366-outline-coins`, `p3-1366-panel-corkboard`, `p3-1366-pocket-book`

Perf: within a few calls of P2.7, all views vsync-bound at 60 fps.

| View | calls | triangles |
|---|---|---|
| 1366 cabin | 668 | 8.6 M |
| 390 cabin | 410 | 4.7 M |

Bundle: shell **62.7 KB gz**, world **161.7 KB gz** (+5 KB: objects, watch, photo, outline).

### P3.3 — Zen and photo mode (done)
- **Zen:** the porch bench is now its own mesh, as is the flat rock on the hill ("Sit and breathe"). E sits you down (eye 0.75 m above the seat, camera still, HUD hidden, watch lowered) and starts the existing 4-7-8 Zen. Esc ends Zen through `zen-ui`, and you stand up beside the seat. The first lamp post moved to the other side of the path, out of the bench's view.
- **Photo mode** (`world/photo.js`): P, the topbar Postcard button or ⌘K "Photo mode". A free camera tethered within 10 m of the player and kept above the ground; WASD, R/F for up and down, mouse to look. The HUD and page chrome hide. Enter saves the frame through the classic `savePostcard` (caption bar + border), and Esc leaves. Sample: `p3-postcard-export.png`.
- **Bugs fixed along the way (Classic too):**
  - The "Wish You Were Here" achievement was never unlocked anywhere. `savePostcard` now unlocks it.
  - A long caption and a long place name printed over each other on the postcard. The lettering now shrinks to fit.
  - Postcard frame and lettering are now sized from the output height, so a 1× native-resolution 3D postcard wears the same border as the 3× classic one.
  - The season used the default latitude for up to 10 s after the weather arrived (Jakarta read "Autumn" in October). It is now recomputed when a real latitude arrives.
- Known and accepted: the photo camera has no collision and can pass through walls ("kamera bebas").

### P3.4 — E2E (done)
`npm run e2e` (Playwright, builds and serves on :4174):
1. Facing the door: the tooltip says "Open the door" → E → hold W 2.5 s → z < 70 (outside). Q → the screen reader hears "Your watch, time: hh:mm" → Q → weather. At the corkboard: the tooltip says "Corkboard" → E → the "Words of Someone" panel is focused and visible → Esc closes it.
2. B opens the pocket book with all 15 panels visible → B closes it.

Both pass (10 s). Mobile e2e remains for P6, along with the §10 criterion "every panel from the desktop and mobile".

---

## P4 — Useless things, physically

### Decisions (P4 question round)
- **Fishing:** hold E to draw the rod back, release to cast (distance from how long you held). A voxel float on the water; the bite is the same Poisson process; E when the float goes under.
- **Stones:** the look direction is the launch angle (look low over the water for a flat throw); hold E for power. Same angle-of-attack rule as Classic.
- **Constellations:** on the hill rock, **at night you lie back and draw** (centre dot on a star + E, Enter finishes); **by day the rock is Zen**. Naming stays in the Idle Hands panel.
- **Leaves:** voxel leaves spin down from the big tree (more in autumn); look at one + E. Generous aim.
- **Shooting stars:** a glowing voxel streak every 20–40 s after dark; look + E while it passes (±6°). It still grants nothing.
- **Old data in the world:** saved constellations drawn in the sky with their names; a bucket on the dock holding your catches; a marker buoy as far out as your best skip.

### P4.0 — One set of rules for both worlds (done)
The rules moved out of the classic layers into `core/` so the 3D world plays by exactly the same ones:
- `core/fishing.js`: FISH table, `bites(dt)` (Poisson, dt/MEAN_WAIT), `rollCatch(night)`, `landCatch`, `lostCatch`
- `core/stones.js`: `BITE_ANGLE`, `stoneCharacter`, `contact(stone, minForward)`, `finishThrow`. Units are passed in: classic pixels use minForward 30, 3D metres scale from G.
- `core/constellations.js`: the `book` of saved star indices, with add/commit/name/forget/clear plus `wish`. It owns the `stars:*` bus listeners StarsLayer used to have.
- `core/leaves.js`: `catchLeaf`

Classic Fishing/Stones/Stars/Critters layers now call these. Smoke-tested in Classic: a stone skipped 9 times, the best was stored, no errors. 12 new tests in `core/rules.test.js`.

One tiny fix: a constellation name cut at 16 characters could end in a space; it is now trimmed after the cut.

### P4.1 — Fishing on the dock (done)
`world/fishing3d.js`:
- E on the rod (last post of the dock) picks it up; it hangs off the camera in 1.25 cm voxels.
- Hold E to draw back (1.2 s for a full cast of 3–16 m along your heading, `aim.castPoint`), let go to cast. A voxel float flies out over `CAST_TIME` and lands with a ripple.
- `core/fishing.bites` (Poisson, the same as Classic) decides the bite. The float dips (it just sits lower under reduced motion) and the tooltip says "Strike!". E within `BITE_WINDOW` lands the catch via `rollCatch`/`landCatch`; otherwise "It got away". E while waiting reels in, empty.
- Casting at land: "That's not the lake." Walking away or Esc puts the rod back.
- Tested: a cast, a bite seen and struck, and `catches` 0 → 1.

### P4.2 — Skipping stones (done)
`world/stones3d.js`: one voxel pile on the shore (single mesh). E picks a stone; hold E (1 s) for power, 5–18 m/s; the **look direction is the launch direction**. A side-arm throw leaves the hand 0.5 m above your feet. Real metres, G = 9.8. At each touch, `core/stones.contact` uses the classic rule, with the minimum planing speed converted from pixels (30/62 × 9.8 ≈ 4.7 m/s). Ripples on every touch; over land it simply lands. The next stone is in hand 0.8 s later. Tested: **7 skips**, best stored.

### P4.3 — Constellations and shooting stars (done)
`world/stargaze.js`:
- Every saved constellation is drawn as faint lines between the same star indices as Classic (`sky.starDirs` from `starField`), with its name as a 3×5-font sprite under the middle.
- **Hill rock after dark** (pal.stars > 0.4): "Lie back and look up". You lie at 0.45 m and may look around the whole sky (pitch up to the zenith). The centre dot picks a star within 2.5° (`aim.aimPick`), E joins it via `book.add`, Enter commits, Esc gets up (discarding an unfinished line). **By day the same rock is Zen.**
- **Shooting stars** every 20–40 s after dark (never under reduced motion): a 1.5 s streak on the glow layer. Looking within 6° shows "Make a wish"; E → `book.wish()`.
- Tested: stars #4 → #5 → #6 joined and saved as `[4,5,6]`; one wish counted.

### P4.4 — Leaves (done)
`world/leaves3d.js`: up to 40 voxel leaves (autumn colours) spawn in the big tree's crown at `0.4 × season.leafFall × (0.5 + wind)` per second and sway down. Look at one within 8 m (5° cone) + E → `core/leaves.catchLeaf`. Tested in autumn: 2 caught.

### P4.5 — Old data in the world (done)
`world/traces.js`:
- **A bucket on the dock** shows the last 12 catches as coloured voxel fish heaped over the rim, rebuilt in place on `fish`. It is also the object for the **Idle Hands** panel ("Your catches"); the rod is now picked up rather than opening the panel.
- **A buoy** floats 4 + 2.4 m × best skips out from the stone pile toward the lake centre, rebuilt on `skip`.

### Routing and fixes
- Hands that are busy (rod, stone) own E. While stargazing E picks stars. Otherwise a wish beats a leaf, which beats a mesh.
- A mode chosen in the Idle Hands panel can't teleport a rod into your hand: it toasts where to go and switches off again.
- **Input bugs found by the P4 tests:**
  - `useReleased` was never cleared (a pattern replace that silently didn't match), so a draw reset every frame and stones threw themselves.
  - Only walking keys were recorded, so photo mode's R/F never worked.
  - A tap (including the one that picks up the rod or stone) is no longer a cast or throw.

Captures: `p4-1366-{fishing-cast,fishing-bite,stones,constellation,leaves,bucket,best-skip-buoy}.png`. Tests: 84 unit, 2 e2e, all pass.

---

## P5 — Weather, seasons, inhabitants

### Decisions (P5 question round)
- **Rain & snow:** voxel particles in a ~40 m box that follows you, plus a **wet look** (darker ground and roofs) and rain rings on the lake.
- **Lying snow (env.snow):** a white layer on **upward-facing surfaces**, in blocky drifts that grow with env.snow (so it settles and melts as in Classic); grass tips and the cabin roof whiten too.
- **Lightning:** a sky flash plus a brief burst of light, **at most 3 flashes a second**, thunder delayed by distance. Reduced motion: no flash, thunder only.
- **Slime:** **wanders the meadow only** (does not follow), reacts when you come close, still reacts to feeding/poking from its panel.
- **Positional audio:** Web Audio panners on the real sources (hearth, crickets in the meadow, rain on the roof). Still behind the mixer and mute; sound stays opt-in.
- **Inhabitants:** fireflies (summer nights), butterflies (spring/summer days), birds (by day, high up), pollen/petals/blown leaves by season.
- **Offline:** volumetric air thickens **and colour drains** (about 37%, as in Classic).

### P5.1 — Rain, snow, wet ground, lightning (done)
`world/weather3d.js`:
- Rain streaks / snowflakes are instanced (up to 1800, scaled by `precip` and by tier 0.35/0.65/1) in a 40 m box that wraps around the camera; wind drifts them, snow wanders. Rain lands as rings on the lake near you. **Reduced motion: no particles at all**, as in Classic.
- `weatherize(material)` patches every Lambert material in the world (voxels, terrain, skirt, trees, grass, flowers): a shared `uWet` darkens surfaces (more on the tops) while it rains, drying slowly afterwards; a shared `uSnow` (= env.snow, the classic resting level pushed by snowfall) covers upward faces in **half-metre drift cells**, more cells the deeper it is, so it arrives and melts in patches. Deep snow buries the grass and flowers. The cabin roof is its own mesh with **all-sides** snow, because a stepped voxel roof shows its risers from below.
- Lightning: a bolt every 4–13 s in a storm, sometimes with a second flicker 0.35 s later; the flash lifts the hemisphere light and adds a cool wash in the post pass; thunder follows by distance. **Tested: never more than 3 flashes in any second over 10 simulated minutes; none under reduced motion.**
- **Bug found:** env's lying snow was seeded from the default latitude (45°N) before the weather arrived, so Jakarta started at 21% snow in October. It is now re-seeded when the real location arrives.

### P5.2 — Inhabitants (done)
`world/critters3d.js`: populations straight from `season.js`:
- Fireflies at night (pulse, flare on the music's bass, HDR on the glow layer), butterflies by day over the meadow (colour per insect, wing flap), a few birds crossing high in clear or cloudy weather, and the season's drift (pollen, petals, autumn leaves) on the wind.
- Everything lives within 22 m of you and respawns as you walk. Rain, snow and storms keep them in. Under reduced motion only the fireflies stay, pulsing in place.

`world/slime.js`: Blip **wanders its stretch of meadow** east of the path, hopping (it only moves while airborne), pausing 2–7 s. It turns to look at you when you are near and **hops away if you come at it fast**. It sleeps by the porch at night and bounces when fed or poked from its panel. Tested: it wandered 2.6 m in 8 s, and running at it made it hop off to 3.2 m.

### P5.3 — Positional audio (done)
`core/audio.js` gained `enableSpatial`, `setListener`, `setIndoors` (Classic never calls them; everything still runs through the ambience bus, so mixer, volume and mute apply):
- the **hearth** rumble and its crackle come from a HRTF panner at the fireplace, and in the world the fire crackles on its own (the mixer adds to it);
- **crickets** chirp from random spots 6–18 m away in the grass;
- **rain under the roof** turns to a dull drumming (lowpass around 700 Hz).

The listener follows the camera 10× a second. Tested: the context runs, the hearth panner exists, the listener matches the camera, and indoors is detected.

### P5.4 — Offline (done)
Losing the network thickens the volumetric air (already) **and drains colour by 37%** in the grade, as the classic FogLayer does.

Captures: `p5-1366-{rain,storm-lightning,winter-snow,summer-fireflies,spring-butterflies,offline}.png`. Perf (standard views) is unchanged from P3: all vsync-bound; 1366 cabin 626 calls / 8.6 M triangles.

Bundle: shell **63.4 KB gz**, world **173.1 KB gz** (+11 KB for all of P4 and P5). 86 unit tests, 2 e2e: all pass.

---

## P6 — Tidy up

### Decisions (P6 question round)
Merge static meshes by material; **A/B perf measurement deferred** (the user will say when the laptop may be loud); keyboard: **Tab cycles nearby visible objects and turns the camera to them**; README: **a new section with honest numbers, in English**.

### P6.1 — Draw calls (done)
- **A measuring bug first:** `__world.stats()` reset the counters and waited two rAFs, which spans **about two frames** (checked: 288 calls that way against a 30-frame average of 135 for the same view). **Every calls/triangles figure in these notes before this point is roughly 2× too high.** `stats()` now averages over 30 frames.
- Decor that nobody targets (dock, bridge, tower, 6 boulders, 10 lamp posts) is **baked into one mesh**, the 10 lamp glasses into another, and the 5 window panes into one.
- Meadow tiles went from 25 to 40 m and forest tiles from 32 to 48 m. The grass draw radius now adds half a tile's diagonal instead of a whole tile.
- **Shadow map at 20 Hz** (every third frame). The sun and moon move once a second; a swinging door or a hopping slime at 20 Hz is still smooth.
- **Indoors, the lake is flat water.** From inside the cabin it is only a glimpse through the door, so it no longer gets a second render of the whole world.
- Result, averaged per frame at 1366 high: **cabin 120, meadow 135, lake 86 draw calls** (target < 300).

### P6.2 — Keyboard and reduced motion (done)
- **Tab / Shift+Tab** (when focus isn't on a real control such as the topbar) cycles through the usable things **you can see and reach to use** (the same 3.2 m as the centre dot; walls block), ordered **left to right** by bearing (`world/tabcycle.js`, 4 tests). The camera eases round to face the choice (the mouse can interrupt). Under **reduced motion** it turns at once behind a short dip to black instead. The screen reader hears "<thing>. Press E to use it."; with nothing in reach it says to walk closer.
- §8 reduced motion audit in the world: head bob never; Tab turns and the watch fade; no precipitation, critters (fireflies stay, pulsing in place), shooting stars or **falling leaves** (that one was missing until now); lightning never flashes; the grass, water rings, door swing and slime hold still.
- E2E: **keyboard only** — Tab until the corkboard is announced, then E opens "Words of Someone". 3 e2e in total, all pass.
