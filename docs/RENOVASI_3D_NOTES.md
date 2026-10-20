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
