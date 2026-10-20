# DNA.md — Bahasa Visual "Pixel-Glass"

Spesifikasi **gaya**, bukan arsitektur. Dipakai untuk project baru apa pun — dashboard,
landing page, aplikasi catatan, admin panel, portfolio — supaya punya tampilan sekeluarga
dengan Useless Dashboard tanpa menyalin fiturnya.

Bacanya: §1 memberi identitas, §2–§9 memberi aturan yang bisa dieksekusi, §10 memberi
tingkat adopsi (dari CSS-saja sampai penuh), §11–§12 memberi rem.

---

## §1. Identitas dalam satu paragraf

> Pelat kaca gelap berembun yang mengambang di atas dunia berwarna, semuanya digambar di
> grid piksel yang terlihat. Sudut ter-potong, bukan melengkung. Tipe bitmap yang tidak
> pernah dihaluskan. Warna tidak diam — seluruh chrome mewarisi cahaya lingkungan dan
> bergeser sepanjang hari. Cahaya lembut mekar dari benda yang menyala. Semua bergerak
> pelan dan tidak serempak. Terasa seperti UI dari game RPG cosy yang dibuat orang yang
> sangat peduli, bukan seperti dark mode sebuah SaaS.

**Referensi rasa:** Stardew Valley (langit dilukis), Sea of Stars (pelat UI gelap di atas
dunia terang), Hyper Light Drifter (bloom + palet terbatas), CRT era 16-bit (dither,
scanline).

**Tiga kata kunci:** *chunky, hangat, bernapas.*

**Bukan:** neo-brutalism, glassmorphism Apple, Material, retro-futurism neon, Y2K.
Kalau hasilnya terlihat seperti salah satu dari itu, ada aturan di bawah yang dilanggar.

---

## §2. Prinsip inti

Tujuh kalimat. Kalau satu dilanggar, gayanya runtuh jadi "tema gelap biasa".

1. **Grid piksel terlihat, dan dipatuhi.** Satu satuan dasar (4px). Tidak ada yang mendarat
   di antaranya.
2. **Warna hidup, tidak statis.** Ada satu state ambient yang menyetir seluruh palet UI.
   Tidak ada komponen yang hard-code warna yang seharusnya bernapas.
3. **Sudut ter-notch, tidak pernah melengkung.** Ini penanda tunggal paling kuat.
4. **Tipe bitmap, tanpa antialias, ukuran diskret.**
5. **Cahaya datang dari satu sumber.** Bevel terang di atas, gelap di bawah — konsisten di
   setiap permukaan.
6. **Gerak pelan, kecil, tidak sinkron.** Dan punya satu tombol mati yang benar-benar mati.
7. **Tekstur di atas gradasi.** Dither, scanline, dashed — bukan blur halus.

---

## §3. Warna

### 3.1 Konsep: palet ambient

Ini pembeda terbesarnya dan bagian yang paling sering dilewatkan.

Alih-alih menetapkan `--bg: #1a1a2e` sekali lalu selesai, kamu menetapkan **tujuh peran
warna** yang nilainya ditulis ulang secara berkala dari satu state ambient. Setiap komponen
hanya mengenal peran, tak pernah nilai.

| Peran | Fungsi | Contoh nilai (malam) |
|---|---|---|
| `--amb-deep` | permukaan tergelap — badan panel | `#131a33` |
| `--amb-mid` | nada tengah — border, divider, isi tombol | `#2b3560` |
| `--amb-lift` | nada terangkat — hover, state aktif | `#55689c` |
| `--amb-glow` | **key light** — semua yang menyala meminjam ini | `#ffd479` |
| `--amb-accent` | percikan komplementer — focus, link, meter | `#7fd6c2` |
| `--amb-ink` | teks primer | `#f4f1ff` |
| `--amb-ink-soft` | teks sekunder, label | `#b9b6d6` |
| `--amb-lum` | 0–1, seberapa terang lingkungan saat ini | `0.1` |

`--amb-lum` bukan warna — ia skalar yang boleh dipakai komponen untuk memutuskan hal lain
(kekuatan bloom, apakah menampilkan detail malam, seberapa dalam bayangan).

### 3.2 Apa yang menjadi "ambient" di project-mu

Kamu tidak harus punya siang-malam. Yang dibutuhkan: **satu skalar kontinu** yang punya
makna di domainmu, plus 4–9 keyframe di sepanjangnya.

| Project | Skalar ambient | Efek yang terasa |
|---|---|---|
| Aplikasi catatan/menulis | jam lokal | ruang kerja yang menghangat sore, meredup malam |
| Dashboard sistem | beban / kesehatan | tenang biru → gelisah amber → merah tumpul |
| Pemutar musik | energi track | palet mengikuti lagu |
| Habit tracker | progres hari ini | pagi dingin → sore hangat saat target tercapai |
| Toko | jam buka / musim | etalase berganti cahaya |
| Portfolio | posisi scroll | perjalanan dari fajar ke malam saat halaman turun |

**Kalau benar-benar tidak ada state ambient yang masuk akal:** tetap definisikan 3 keyframe
(pagi/sore/malam by clock) dan pakai jam lokal. Bahkan versi paling malas dari ini sudah
membuat UI terasa hidup, karena orang yang membuka jam 9 pagi dan jam 11 malam melihat
produk yang berbeda.

### 3.3 Cara menyusun keyframe

```js
const KEYS = [
  { at: 0,    sky: ['#070a1c','#0d1330','#1a2049'],   // zenith → tengah → horizon
    glow: '#9db4ff', accent: '#7fd6c2', lum: 0.10,
    ink: '#e6e4ff', inkSoft: '#9a9ac4' },
  { at: 6.1,  sky: ['#2e3a77','#7a5d9e','#f0a08a'],
    glow: '#ff9e7a', accent: '#7fd6c2', lum: 0.42,
    ink: '#fff4ee', inkSoft: '#c9b6c6' },
  { at: 12,   sky: ['#2f7ec8','#63aede','#b8e2f2'],
    glow: '#ffe9a8', accent: '#2fa78e', lum: 1.00,
    ink: '#f4faff', inkSoft: '#bdd0e2' },
  // …
];
```

Aturan menyusunnya:

- **Tiga stop untuk warna latar, bukan dua.** Langit nyata (dan gradien apa pun yang terasa
  mahal) punya sabuk tengah. Dua stop terbaca sebagai gradien CSS.
- **Jarak antar-keyframe tidak seragam.** Rapat di tempat perubahan cepat (fajar, senja),
  renggang di tempat stabil (tengah hari). Distribusi merata terbaca sebagai animasi mesin.
- **Dilukis, bukan dihitung.** Fajar berwarna pink karena fajar *harus* pink, bukan karena
  simulasi hamburan Rayleigh bilang begitu. Yang benar secara fisika itu abu-abu kebiruan
  dan membosankan.
- **Interpolasi pakai `smoothstep`, bukan linear.** Linear terbaca sebagai *wipe*.
  ```js
  const smoothstep = t => t * t * (3 - 2 * t);
  ```

### 3.4 Aturan turunan yang membuatnya tetap terbaca

Ini yang membuat sistem ini tidak berubah jadi kekacauan aksesibilitas.

**Permukaan tetap gelap di setiap state.** Art direction-nya adalah pelat gelap di atas
dunia terang. Jadi kamu membawa **hue** ambient ke chrome tapi **memaksa lightness-nya
turun**:

```js
const INK_BLACK = [8, 8, 16];
const base = pal.sky[1];                          // ambil sabuk TENGAH, bukan zenith —
                                                  // zenith nyaris akromatik di malam,
                                                  // dan tint-nya akan hilang total
const deep = mixRgb(base, INK_BLACK, 0.72);       // 72% ke arah hitam
const deepTinted = mixRgb(deep, pal.glow, 0.06);  // 6% key light: kaca menghangat

r.setProperty('--amb-deep', rgbToHex(deepTinted));
r.setProperty('--amb-mid',  rgbToHex(mixRgb(base, INK_BLACK, 0.42)));
r.setProperty('--amb-lift', rgbToHex(mixRgb(mixRgb(base, INK_BLACK, 0.30), pal.glow, 0.22)));
```

Hasilnya: fajar jadi *peach-gelap*, siang jadi *navy-gelap*, malam jadi *tinta-gelap* —
terlihat jelas berbeda, seragam terbaca.

**Frekuensi tulis: ~4 Hz, bukan per frame.** Menulis custom property meng-invalidate style
seluruh subtree, dan tak ada mata yang bisa mengikuti warna lebih cepat dari itu.

**State sekunder menggradasi, tidak mengganti.** Kalau ada dimensi kedua (status, mode,
cuaca), ia mengubah hasil interpolasi — bukan menukar paletnya:

```js
const GRADE = {
  normal:   { desat: 0,    dark: 1,    cool: null      },
  degraded: { desat: 0.30, dark: 0.86, cool: '#8895ad' },
  critical: { desat: 0.50, dark: 0.62, cool: '#4c5878' },
};
```

Jadi "critical jam 12 siang" dan "critical tengah malam" sama-sama critical, tapi tetap
terbaca sebagai siang dan malam.

> **Peringatan yang sudah dibayar:** nilai yang jujur (`dark: 0.48` untuk state terburuk)
> menghasilkan layar nyaris hitam — benar, dan mati. Selalu tune terhadap **kombinasi
> paling gelap yang mungkin**, dan biarkan drama datang dari aksen, bukan dari mematikan
> lampu.

### 3.5 Kalau kamu hanya mau versi statis

Palet dasar yang berdiri sendiri (pakai ini kalau §3.2 tidak masuk akal untuk project-mu):

```css
:root {
  --amb-deep:     #131a33;
  --amb-mid:      #2b3560;
  --amb-lift:     #55689c;
  --amb-glow:     #ffd479;   /* amber hangat — sumber cahaya  */
  --amb-accent:   #7fd6c2;   /* teal — komplementer dari amber */
  --amb-ink:      #f4f1ff;
  --amb-ink-soft: #b9b6d6;
  --amb-lum:      0.5;
}
```

Pasangan `#ffd479` / `#7fd6c2` (amber hangat + teal dingin) adalah tulang punggung palet
ini. Kalau mau mengganti identitas warna, ganti **pasangan** ini, jangan salah satunya —
ketegangan hangat/dingin itu yang bekerja.

Warna cerah untuk aksen jarang (tag, kategori, kelopak bunga):
`#ff8fa3` · `#ffd479` · `#c89bff` · `#8fe0ff` · `#ffffff`
Semuanya lembut, tidak ada yang jenuh penuh. Tidak ada `#ff0000` di mana pun.

---

## §4. Token — pondasi

Satu file, satu-satunya tempat yang boleh berisi nilai literal.

```css
:root {
  /* ── Warna ambient (lihat §3) ──────────────────────────────────────────── */
  --amb-deep: #131a33; --amb-mid: #2b3560;  --amb-lift: #55689c;
  --amb-glow: #ffd479; --amb-accent: #7fd6c2;
  --amb-ink:  #f4f1ff; --amb-ink-soft: #b9b6d6; --amb-lum: 0.5;

  /* ── Kaca ──────────────────────────────────────────────────────────────── */
  /* 86% adalah LANTAI KETERBACAAN. Di bawahnya, latar beranimasi tembus cukup
     kuat sehingga kontras di bawah teks berubah dari detik ke detik.
     Berembun, bukan transparan. */
  --glass-bg:   color-mix(in oklab, var(--amb-deep) 86%, transparent);
  --glass-hi:   color-mix(in oklab, #ffffff 14%, transparent);   /* bevel atas   */
  --glass-lo:   color-mix(in oklab, #000000 30%, transparent);   /* bevel bawah  */
  --glass-edge: color-mix(in oklab, var(--amb-mid) 88%, #000 12%); /* cincin frame */
  --glass-blur: 18px;

  /* ── Geometri piksel ───────────────────────────────────────────────────── */
  --px:  4px;  --px2: 8px;  --px3: 12px; --px4: 16px;
  --px5: 20px; --px6: 24px; --px8: 32px;

  /* ── Tipe ──────────────────────────────────────────────────────────────── */
  --font-display: 'Press Start 2P', 'Silkscreen', ui-monospace, monospace;
  --font-ui:      'Silkscreen', 'Press Start 2P', ui-monospace, monospace;
  --font-body:    ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace;

  --fs-nano: 10px; --fs-micro: 11px; --fs-small: 13px;
  --fs-base: 15px; --fs-lg:    18px; --fs-xl:    24px;

  /* ── Gerak ─────────────────────────────────────────────────────────────── */
  --motion: 1;                    /* KALIKAN setiap perpindahan dekoratif dengan ini */
  --ease-spring: linear(
    0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%,
    0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001
  );
  --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-snap: cubic-bezier(0.2, 0.9, 0.2, 1.05);
  --dur-fast: 140ms; --dur: 260ms; --dur-slow: 520ms;

  /* ── Elevasi ───────────────────────────────────────────────────────────── */
  /* Perhatikan komponen KERAS di samping yang lembut: itu yang membuat panel
     terasa sebagai objek pipih bertumpuk, bukan kartu Material. */
  --shadow-rest: 0 10px 26px -10px rgb(0 0 0 / .55), 0 2px 0 0 rgb(0 0 0 / .28);
  --shadow-lift: 0 22px 46px -14px rgb(0 0 0 / .62), 0 3px 0 0 rgb(0 0 0 / .30);
  --halo: 0 0 var(--px5) color-mix(in oklab, var(--amb-glow) 38%, transparent);
}

@media (prefers-reduced-motion: reduce) { :root { --motion: 0; } }
:root[data-motion='off'] { --motion: 0; }
:root[data-motion='on']  { --motion: 1; }
```

Dua keputusan struktural di sini:

- **`--glass-*` diturunkan dari `--amb-*` lewat `color-mix`.** Kaca ikut berubah otomatis
  saat ambient bergerak, tanpa satu baris JS tambahan.
- **Preferensi OS adalah default, bukan kunci.** `--motion` tinggal di `:root` supaya toggle
  in-app bisa menimpanya **dua arah**. Media query telanjang tidak bisa dibatalkan pengguna.

---

## §5. Bentuk & permukaan

### 5.1 Frame ter-notch — penanda tunggal paling penting

Frame pixel-art punya sudut **ter-potong**: cincin border berhenti sebelum sudut, sehingga
piksel sudut kosong. `border` akan mitre. `border-radius` akan melengkung. Keduanya salah.

Empat `box-shadow` zero-spread, satu per sisi, meninggalkan sudut kosong — itulah notch-nya.

```css
.panel {
  --frame: var(--glass-edge);
  position: relative;
  padding: var(--px4);
  isolation: isolate;

  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.3);

  box-shadow:
    /* cincin piksel ter-notch */
    0 calc(-1 * var(--px)) 0 0 var(--frame),
    0 var(--px)            0 0 var(--frame),
    calc(-1 * var(--px)) 0 0 0 var(--frame),
    var(--px)            0 0 0 var(--frame),
    /* bevel: cahaya dari atas, bayangan di bawah — logam ter-extrude */
    inset 0 var(--px)            0 0 var(--glass-hi),
    inset 0 calc(-1 * var(--px)) 0 0 var(--glass-lo),
    /* bayangan kontak ambient */
    var(--shadow-rest);
}
```

**Pakai ulang di setiap wadah** — tombol, toast, modal, dropdown, bingkai avatar, input,
tooltip. Konsistensi itu yang membuatnya terbaca sebagai satu sistem, bukan satu efek.

### 5.2 Kilau dalam

Gloss diagonal lambat supaya kaca terbaca sebagai kaca, bukan sebagai persegi berwarna.

```css
.panel::before {
  content: '';
  position: absolute; inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(142deg,
    color-mix(in oklab, #fff 9%, transparent) 0%,
    transparent 34%,
    transparent 66%,
    color-mix(in oklab, var(--amb-glow) 7%, transparent) 100%);
}
```

Sudut 142° dan opasitas 9%/7% — sengaja hampir tak terlihat. Kamu tidak boleh menyadarinya;
kamu hanya menyadari kalau ia dihapus.

### 5.3 Hierarki permukaan

Tiga tingkat, tak lebih:

| Tingkat | Latar | Dipakai untuk |
|---|---|---|
| Panel | `var(--glass-bg)` + blur 18px | wadah utama |
| Kontrol | `color-mix(in oklab, var(--amb-mid) 46%, transparent)` + blur 8px | tombol, chip |
| Sumur (inset) | `color-mix(in oklab, #000 42%, transparent)` | meter, input, area viz |

Sumur dibalik bevelnya — bayangan di atas, cahaya di bawah — supaya terbaca cekung:

```css
.well { box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--amb-mid) 70%, transparent); }
```

### 5.4 Hover & tekan

```css
@media (hover: hover) {           /* jangan lengket di HP setelah tap */
  .panel--interactive:hover {
    transform: translate3d(0, calc(-3px * var(--motion)), 0);
    box-shadow:
      0 calc(-1 * var(--px)) 0 0 var(--amb-lift),
      0 var(--px)            0 0 var(--amb-lift),
      calc(-1 * var(--px)) 0 0 0 var(--amb-lift),
      var(--px)            0 0 0 var(--amb-lift),
      inset 0 var(--px)            0 0 var(--glass-hi),
      inset 0 calc(-1 * var(--px)) 0 0 var(--glass-lo),
      var(--shadow-lift),
      var(--halo);                /* frame menyala warna key light saat ini */
  }
}
```

Hover mengubah **tiga** hal sekaligus: naik 3px, warna cincin naik ke `--amb-lift`, dan
halo bertambah. Satu perubahan saja terasa lemah.

Tombol adalah objek fisik: mereka **turun** saat ditekan, dan bevel-nya terbalik.

```css
.btn:active {
  transform: translateY(1px);
  box-shadow:
    0 calc(-1 * var(--px)) 0 0 var(--glass-edge),
    0 var(--px)            0 0 var(--glass-edge),
    calc(-1 * var(--px)) 0 0 0 var(--glass-edge),
    var(--px)            0 0 0 var(--glass-edge),
    inset 0 2px 0 0 var(--glass-lo);     /* sekarang cekung */
}

/* Nonaktif harus TERLIHAT tak tersedia DAN berhenti merespons — kalau tidak, ia
   tetap terangkat saat hover, menjanjikan aksi yang tak akan dikerjakan. */
.btn:disabled { opacity: .38; cursor: not-allowed; pointer-events: none; }
```

State aktif/terpilih memakai key light sebagai isian, dengan teks gelap:

```css
.btn[aria-pressed='true'] {
  color: #10121f;
  background: var(--amb-glow);
  box-shadow:
    0 calc(-1 * var(--px)) 0 0 var(--amb-glow),
    0 var(--px)            0 0 var(--amb-glow),
    calc(-1 * var(--px)) 0 0 0 var(--amb-glow),
    var(--px)            0 0 0 var(--amb-glow),
    inset 0 2px 0 0 rgb(255 255 255 / .45),
    var(--halo);
}
```

---

## §6. Ruang & ritme

### 6.1 Grid 4px, tanpa pengecualian

Setiap padding, gap, tebal border, offset bayangan, dan ukuran ikon adalah kelipatan `--px`.
Kalau kamu menulis `13px` di mana pun, ada yang salah.

Pengecualian yang diizinkan, dan hanya ini: `2px` untuk detail hairline (divider, bevel
dalam pada kontrol kecil), karena `4px` terlalu berat di sana.

### 6.2 Kerapatan

Gaya ini **padat**, bukan lapang. Panel 16px padding, gap 12–20px. Halaman yang terlalu
lega membuat pelat kaca terlihat mengambang tanpa alasan.

```css
.app {
  display: flex; flex-direction: column;
  gap: var(--px6);
  padding: var(--px5) clamp(var(--px3), 3vw, var(--px8)) var(--px5);
  max-width: 1680px;
  margin-inline: auto;
}
@media (min-width: 2100px) { .app { max-width: 1880px; } }  /* jangan jadi landasan pacu */
```

### 6.3 Grid konten

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: clamp(var(--px3), 1.4vw, var(--px5));
  align-content: start;
}
@media (min-width: 900px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
  .span-2 { grid-column: span 2; }
  .span-4 { grid-column: span 4; }
  .row-2  { grid-row: span 2; }
}
@media (min-width: 1500px) {
  .grid { grid-template-columns: repeat(6, 1fr); }
  .span-4 { grid-column: span 3; }
}
```

**Baris grid meregangkan setiap kartu setinggi yang tertinggi. Jangan lawan itu** — tinggi
kartu yang compang-camping terbaca sebagai bug, bukan sebagai craft. Terima regangannya dan
**pusatkan** isinya secara vertikal:

```css
.panel__body {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; justify-content: center;
}
.panel__body > * { width: 100%; }
```

### 6.4 Anatomi kartu

Selalu tiga bagian, urutannya tetap:

```
┌─ header ─────────────────────────────┐
│ ● JUDUL KECIL UPPERCASE      [alat]  │   spark + label + tools kanan
├──────────────────────────────────────┤
│                                      │
│           isi, terpusat              │
│                                      │
└──────────────────────────────────────┘
```

```css
.panel__head  { display: flex; align-items: center; gap: var(--px2); margin-bottom: var(--px3); }
.panel__title { font-family: var(--font-ui); font-size: var(--fs-micro); font-weight: 700;
                letter-spacing: 0.16em; text-transform: uppercase; color: var(--amb-ink-soft); }
.panel__tools { margin-left: auto; display: flex; gap: var(--px); }

/* Titik berdenyut kecil di depan judul — penanda "hidup" seharga 8px */
.panel__spark {
  width: var(--px2); height: var(--px2); flex: none;
  background: var(--amb-glow);
  box-shadow: 0 0 var(--px3) var(--amb-glow);
  animation: sparkPulse calc(2.4s / max(var(--motion), 0.0001)) ease-in-out infinite;
}
@keyframes sparkPulse {
  0%, 100% { opacity: .55; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.35); }
}
```

---

## §7. Tipografi

### 7.1 Aturan

1. **Dua muka bitmap.** Display (tebal, sempit — angka besar, judul) + UI (lebih terbaca —
   segalanya). Muka ketiga hanya untuk data monospace (timestamp, angka mentah): pakai
   `ui-monospace` sistem, tidak perlu diunduh.
2. **Self-host, subset latin saja.** Pakai `unicode-range` supaya browser hanya mengunduh
   subset yang benar-benar dipakai. Font dari CDN berarti: cold load menembak server orang
   lain, dan saat offline seluruh identitas tipografi runtuh jadi Helvetica.
3. **Jangan pernah anti-alias.**
   ```css
   body {
     -webkit-font-smoothing: none;
     font-smooth: never;
     text-rendering: optimizeSpeed;
   }
   /* Font piksel digambar di grid integer; posisi sub-piksel mengoleskannya. */
   h1, h2, h3, button, .pixel-type { letter-spacing: 0.02em; }
   ```
4. **Tangga ukuran diskret: 10 / 11 / 13 / 15 / 18 / 24.** Muka bitmap dirancang untuk
   ukuran eksak dan melembek di antaranya. **Jangan `clamp()` teks kecil.** `clamp()` hanya
   untuk display besar yang boleh melembek sedikit: `clamp(28px, 5.2vw, 54px)`.
5. **Label kecil = uppercase + letter-spacing lebar.** Di `--fs-nano`, muka bitmap tidak
   terbaca sebagai kalimat — ia terbaca sebagai label. Manfaatkan:
   ```css
   .label { font-size: var(--fs-nano); letter-spacing: 0.14em;
            text-transform: uppercase; color: var(--amb-ink-soft); }
   ```
6. **Angka yang berubah: `tabular-nums` + lebar minimum per digit.** Supaya layout tidak
   berdenyut saat digit berganti lebar.
   ```css
   .digit { display: inline-block; min-width: 0.62em; text-align: center;
            font-variant-numeric: tabular-nums; }
   ```

### 7.2 Bayangan teks — selalu dua

Satu drop piksel keras (offset kelipatan `--px`, jadi tetap on-grid) dan satu bloom lembut
berwarna key light saat ini:

```css
.headline {
  text-shadow:
    0 var(--px) 0 rgb(0 0 0 / .45),
    0 0 var(--px5) color-mix(in oklab, var(--amb-glow) 55%, transparent);
}
```

Ini yang membuat teks terbaca **di atas** dunia, bukan tercetak di dalamnya.

### 7.3 Hierarki kontras

| Peran | Warna | Ukuran |
|---|---|---|
| Angka hero | `--amb-ink` + dua bayangan | display, 28–54px |
| Satuan/detik di sebelah hero | `--amb-glow`, `0.5em` | mengecil, menghangat |
| Judul kartu | `--amb-ink-soft`, uppercase, tracking 0.16em | `--fs-micro` |
| Isi | `--amb-ink`, `line-height: 1.85` | `--fs-small` |
| Meta/label | `--amb-ink-soft` @ 70–80% opacity, uppercase | `--fs-nano` |

`line-height: 1.85` untuk teks isi terasa berlebihan di font biasa; untuk muka bitmap tanpa
descender yang jelas, itu yang membuatnya bisa dibaca berparagraf.

Angka sekunder (detik pada jam, satuan pada nilai) diberi ukuran `0.5em` dan warna
`--amb-glow` — angka paling tidak penting yang diberi bobot setara membuat semuanya
berteriak.

---

## §8. Gerak

### 8.1 Satu rem, dipatuhi mutlak

`--motion` adalah 1 atau 0, dan **mengalikan setiap perpindahan dekoratif**.

```css
transform: translateY(calc(-3px * var(--motion)));
```

Trik durasi: bagi durasi dengan `--motion`, jadi di 0 animasi menjadi tak hingga — efektif
membeku — tanpa menulis ulang aturan di media query. `max()` mencegah pembagian nol.

```css
animation: floatY calc(7s / max(var(--motion), 0.0001)) ease-in-out infinite;
```

**Uji penerimaannya:** dengan reduced motion aktif, **tidak ada satu pun yang bertranslasi**,
tapi UI masih bernapas — opacity masih berdenyut, warna masih bergeser, spark masih berkedip.
Diam bukan berarti mati.

Kalau project-mu punya latar beranimasi (canvas, video, parallax), flag yang sama harus
menjangkau ke sana juga. Toggle CSS menghentikan kartu bergoyang, tapi tidak melakukan
apa pun terhadap gerak area-luas di latar — dan itulah yang sebenarnya menyebabkan masalah
vestibular.

### 8.2 Kurva

| Token | Nilai | Untuk |
|---|---|---|
| `--ease-spring` | `linear(…)` overshoot ~1.7% | entrance, snap, isian meter |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | apa pun yang keluar atau memudar |
| `--ease-snap` | `cubic-bezier(.2,.9,.2,1.05)` | umpan balik tombol |
| `linear` | — | **semua transisi warna** |

Overshoot 1.7% pada `--ease-spring` sangat kecil dan sangat penting: itu yang membuat gerak
terasa mekanis-hidup, bukan seperti transisi CSS default. Warna **selalu** `linear` — warna
yang di-ease terbaca sebagai kedipan.

### 8.3 Durasi

| Rentang | Untuk |
|---|---|
| 140ms | umpan balik tombol, hover kontrol |
| 260ms | hover kartu, perubahan state |
| 520ms | isian meter, transisi besar |
| 620ms | entrance kartu |
| 900ms | perubahan mode full-screen |
| 4–7s | gerak idle (float, denyut) |
| 0.25s tulis, transisi lambat | pergeseran warna ambient |

### 8.4 Entrance bertingkat

```css
.panel {
  animation-name: panelIn;
  animation-duration: 620ms;
  animation-timing-function: var(--ease-spring);
  animation-delay: calc(var(--i, 0) * 55ms);    /* --i di-set saat elemen dibuat */
  animation-fill-mode: both;
}

/* Setiap displacement dikalikan --motion, jadi di 0 ini runtuh menjadi fade
   opacity biasa — bukan dua belas kartu meluncur dan un-blur. */
@keyframes panelIn {
  from {
    opacity: 0;
    transform: translate3d(0, calc(22px * var(--motion)), 0)
               scale(calc(1 - 0.03 * var(--motion)));
    filter: blur(calc(6px * var(--motion)));
  }
  to { opacity: 1; transform: none; filter: blur(0); }
}
```

55ms per item. Lebih cepat tidak terbaca sebagai bertingkat; lebih lambat terasa malas.

### 8.5 Gerak idle — desinkronisasi adalah intinya

Kartu mengambang pelan, dan **tidak ada yang segaris**:

```js
element.style.setProperty('--i',           index);
element.style.setProperty('--float-dur',   `${6.2 + (index % 5) * 0.9}s`);
element.style.setProperty('--float-delay', `${(index % 7) * -0.73}s`);
```

```css
@keyframes floatY {
  0%, 100% { translate: 0 0; }
  50%      { translate: 0 calc(-5px * var(--motion)); }
}
@media (hover: hover) { .panel--float:hover { animation-play-state: paused; } }
```

Sebaran periode "agak prima" (5 dan 7 saling prima) dan offset fase negatif per kartu
sehingga tidak semuanya mulai dari nol. Grid yang mengambang serempak langsung terbaca
salah — benda mengambang nyata tidak tersinkronisasi.

**Matikan float untuk kartu berisi kontrol halus.** Kamu tidak bisa mengenai slider yang
bergerak.

### 8.6 Umpan balik mikro

- **Ripple** dari titik klik, 8px → 220px dalam 520ms, memudar.
- **Digit flip** hanya pada digit yang benar-benar berubah — jam berdetak, bukan berkedip.
  ```css
  @keyframes digitFlip {
    0%   { transform: translateY(calc(-0.16em * var(--motion))) scale(1.08);
           opacity: .25; filter: blur(calc(2px * var(--motion))); }
    100% { transform: none; opacity: 1; filter: none; }
  }
  ```
- **Panah bob** (▼) untuk "tekan untuk lanjut" — pemain RPG membacanya seketika.
- **Kilau berjalan** pada meter terisi (§9.4).

---

## §9. Tekstur & cahaya

Bagian ini yang mengubah "dark UI rapi" jadi "dunia".

### 9.1 Dither, bukan gradasi

Gradasi halus terbaca sebagai CSS. Gradasi terkuantisasi lewat matriks Bayer 4×4 terbaca
sebagai **16-bit**.

```js
export const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

function quant(v, threshold, steps) {
  const step = 255 / steps;
  return Math.min(255, Math.max(0,
    Math.round((v + (threshold - 0.5) * step) / step) * step));
}

/** Gradasi vertikal ter-dither. `steps = 22` adalah titik manisnya: cukup sedikit
    untuk terlihat terkuantisasi, cukup banyak untuk tidak jadi banding. */
export function ditherGradient(w, h, stops, steps = 22) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const ty = y / (h - 1 || 1);
    let i = 0;
    while (i < stops.length - 2 && ty > stops[i + 1].at) i++;
    const s0 = stops[i], s1 = stops[i + 1] || s0;
    const f = Math.min(1, Math.max(0, (ty - s0.at) / (s1.at - s0.at || 1)));
    const r  = s0.color[0] + (s1.color[0] - s0.color[0]) * f;
    const gg = s0.color[1] + (s1.color[1] - s0.color[1]) * f;
    const b  = s0.color[2] + (s1.color[2] - s0.color[2]) * f;

    for (let x = 0; x < w; x++) {
      const th = BAYER4[y & 3][x & 3] / 16;
      const o = (y * w + x) * 4;
      d[o] = quant(r, th, steps); d[o+1] = quant(gg, th, steps);
      d[o+2] = quant(b, th, steps); d[o+3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
```

**Pakai matriks yang sama untuk setiap tepi lembut di project** — masker, fade, overlay,
transisi. Itu yang membuat semua transisi larut dengan satu tekstur yang konsisten.

> **Jebakan:** threshold pada `(x + y * 2) % 3` adalah **kisi periodik**, bukan dither. Di
> atas medan yang mulus, kisi itu tidak larut — ia **mengeras** jadi papan catur 1px.
> Bayer menyebarkan transisi ke sel 4×4 dalam urutan yang paling sulit direkonstruksi mata,
> jadi tepinya *remuk*, bukan berubin.

**Versi tanpa canvas** (untuk aksen, bukan gradasi besar):

```css
.dithered-edge {
  mask-image: repeating-conic-gradient(#000 0% 25%, transparent 0% 50%);
  mask-size: 4px 4px;
}
```

### 9.2 Bloom

Cahaya lembut yang mekar dari benda menyala. Dua cara, pilih sesuai project:

**Cara penuh (ada canvas):** canvas kedua berukuran sama, hanya benda emisif digambar ke
dalamnya, lalu CSS mem-blur dan screen-blend-nya di atas.

```css
.glow-buffer {
  filter: blur(14px) saturate(1.35);
  mix-blend-mode: screen;
  opacity: 0.85;
  will-change: opacity;
}
@media (max-width: 700px) {
  /* Blur adalah operasi piksel paling mahal di GPU mobile. */
  .glow-buffer { filter: blur(9px) saturate(1.25); }
}
```

Buffer glow harus di-**clear**, bukan dicat — piksel transparannya yang membuat latar
tembus lewat screen blend. Dan reaktivitas (denyut mengikuti audio/data) diletakkan di
`opacity` buffer ini: satu properti compositor, tanpa relayout, tanpa repaint.

**Cara ringan (CSS saja):** `box-shadow` dan `drop-shadow` berwarna key light.

```css
.emissive     { box-shadow: 0 0 var(--px3) var(--amb-glow); }
.emissive-img { filter: drop-shadow(0 0 14px color-mix(in oklab, var(--amb-glow) 60%, transparent)); }
```

Aturannya sama di kedua cara: **hanya benda yang secara naratif menyala** yang mendapat
bloom. Kalau semuanya berpendar, tidak ada yang berpendar.

### 9.3 Overlay atmosfer

Dua lapisan tetap di atas latar, keduanya `pointer-events: none`.

```css
/* Sebisik-bisiknya CRT. Di alpha 0.035 kamu tidak MELIHATnya — kamu MERASAKANnya. */
.scanlines {
  position: absolute; inset: 0; pointer-events: none;
  opacity: 0.035;
  background: repeating-linear-gradient(to bottom, #fff 0 1px, transparent 1px 3px);
  mix-blend-mode: overlay;
}

.vignette {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(118% 90% at 50% 42%,
    transparent 42%, rgb(4 4 14 / .32) 78%, rgb(3 3 10 / .62) 100%);
}
```

Vignette bukan lingkaran di tengah: `at 50% 42%` menaruh pusat terangnya sedikit di atas
tengah, mengikuti tempat mata sebenarnya bersandar.

Jangan naikkan opacity scanline. Di 0.08 ia menjadi efek; di 0.035 ia menjadi rasa.

### 9.4 Tekstur di komponen kecil

Ini yang membedakan dari dark theme mana pun: **tidak ada garis solid polos**.

```css
/* Divider putus-putus — garis solid terbaca sebagai border HTML */
.divider {
  height: 2px; margin: var(--px3) 0;
  background: repeating-linear-gradient(90deg,
    color-mix(in oklab, var(--amb-mid) 90%, transparent) 0 4px,
    transparent 4px 8px);
}

/* Meter: sumur gelap + isian gradien + kilau diagonal berjalan */
.meter {
  position: relative; height: var(--px3); overflow: hidden;
  background: color-mix(in oklab, #000 42%, transparent);
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--amb-mid) 70%, transparent);
}
.meter__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--amb-accent),
              color-mix(in oklab, var(--amb-glow) 80%, #fff));
  box-shadow: 0 0 var(--px3) color-mix(in oklab, var(--amb-glow) 60%, transparent);
  transition: width var(--dur-slow) var(--ease-spring);
}
.meter__fill::after {
  content: ''; position: absolute; inset: 0;
  background: repeating-linear-gradient(115deg,
    transparent 0 6px, rgb(255 255 255 / .16) 6px 12px);
  animation: meterSlide calc(1.4s / max(var(--motion), 0.0001)) linear infinite;
}
```

### 9.5 Fokus

Ring fokus **tebal**, karena estetikanya memang chunky. 4px, warna aksen.

```css
:focus-visible {
  outline: var(--px) solid var(--amb-accent);
  outline-offset: var(--px);
  border-radius: 2px;
}
::selection {
  background: color-mix(in oklab, var(--amb-accent) 55%, transparent);
  color: #0b0d1c;
}
```

---

## §10. Ikonografi & ilustrasi

Kebijakan: **nol file aset.** Semuanya digambar di kode.

### 10.1 Ikon fungsional — `clip-path`

Chunky di ukuran mana pun, mewarisi `currentColor`, tak ada file yang diunduh.

```css
.ico { width: 12px; height: 12px; flex: none; background: currentColor; }
.ico[data-ico='sound']  { clip-path: polygon(0 33%,25% 33%,50% 8%,50% 92%,25% 67%,0 67%,0 33%); }
.ico[data-ico='motion'] { clip-path: polygon(8% 42%,33% 42%,33% 17%,92% 50%,33% 83%,33% 58%,8% 58%); }
.ico[data-ico='clock']  { clip-path: polygon(42% 8%,58% 8%,58% 46%,84% 46%,84% 62%,42% 62%); }
```

Gambar poligonnya di grid 12×12 dulu (di kertas atau di editor), baru konversi ke persen.
Sudut miring 45° saja — sudut sembarang merusak kesan piksel.

### 10.2 Ilustrasi — sprite dari ASCII art

```js
export function makeSprite(rows, palette, scale = 1) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w * scale; cv.height = h * scale;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (col) { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); }
    }
  return cv;
}
```

Logo project, digambar di kode, tanpa file:

```js
makeSprite([
  '.....dddd.....',
  '...ddhhhhdd...',
  '..dhh.gg.hhd..',
  '.dh..gGGg..hd.',
  '.dh.gGGGGg.hd.',
  'dh..gGGGGg..hd',
  'dh...gGGg...hd',
  'dh....gg....hd',
  'dh....ss....hd',
  '.dh...ss...hd.',
  '.dh........hd.',
  '..dhh....hhd..',
  '...ddhhhhdd...',
  '.....dddd.....',
], { d:'#2a2a52', h:'#3f3f74', g:'#5fd6a8', G:'#9ff5c8', s:'#3f7a5c' });
```

Keuntungan besarnya: paletnya bisa ditukar per-render, jadi sprite yang **sama** disinari
berbeda mengikuti state ambient. Kanvas sprite selalu `image-rendering: pixelated` saat
ditampilkan.

Favicon juga: SVG inline sebagai data URI di `<link rel="icon">`, digambar dari `<rect>`.

### 10.3 Kebijakan emoji

Emoji **boleh** — sebagai ikon fungsional pada tombol dan penanda kategori (🍃 🧘 📮 ☀️ ☁️).
Emoji **tidak boleh** di dalam kalimat isi. Emoji fungsional mendapat perlakuan yang sama
dengan ikon lain: `drop-shadow` berwarna key light, dan ikut mengambang.

```css
.wx__icon {
  font-size: 44px; line-height: 1;
  filter: drop-shadow(0 0 14px color-mix(in oklab, var(--amb-glow) 60%, transparent));
  animation: floatY calc(4.8s / max(var(--motion), 0.0001)) ease-in-out infinite;
}
```

---

## §11. Nada tulisan

Setengah dari gayanya adalah **suara**. Copy yang salah merusak visual yang benar.

- **Huruf kecil untuk kalimat ambient. Uppercase hanya untuk label struktural.**
- **Amati, jangan instruksikan.** `"dusk. the fireflies clock in."` bukan
  `"It is now evening."`
- **Tanpa tanda seru.** Tanpa "Oops!", tanpa "Great job!".
- **Kalimat pendek. Titik lebih banyak daripada koma.**
- **Sistem boleh mengakui keterbatasannya, dengan tenang dan jujur:**
  `"couldn't find you. this is London's sky, not yours."`
- **Setiap state punya kalimatnya sendiri.** Kosong, loading, error, offline — semuanya
  ditulis tangan. Tak satu pun default.
- **Degradasi bersifat atmosferik, bukan administratif.** Kehilangan jaringan tidak
  memunculkan banner merah — dunia berkabut dan kehilangan sedikit warnanya, di-ease selama
  ~4 detik. Kamu tahu kamu offline dengan cara yang sama kamu tahu hujan mulai turun: dengan
  melihat ke luar. Banner mengumumkan perubahan state; suasana **menyampaikannya**.

---

## §12. Tingkat adopsi

Tidak semua project butuh dunia beranimasi. Tiga tingkat, semuanya terlihat sekeluarga.

### Tingkat 1 — CSS saja (~1 jam)

Cukup untuk landing page, dokumentasi, alat internal.

- Token §4 (versi statis §3.5)
- Frame ter-notch §5.1 + bevel + kilau dalam
- Tipe bitmap §7
- Grid 4px §6
- Entrance bertingkat + hover §8.4
- Scanline + vignette §9.3, dan latar gradien statis

Yang dilepas: warna hidup, bloom, dither, ilustrasi.
Yang tetap terasa: chunky, hangat, jelas bukan template.

### Tingkat 2 — + warna hidup (+ ~3 jam)

Tambahkan §3 lengkap. Satu modul palet, satu timer 4 Hz, tujuh custom property.

Ini **lompatan terbesar per jam kerja di seluruh dokumen ini.** UI yang warnanya bergeser
sepanjang hari langsung terasa dibuat khusus, dan tak ada komponen yang perlu berubah —
mereka sudah memakai token.

Tambahan yang murah di tingkat ini: gerak idle desinkron §8.5, bloom CSS §9.2 (cara ringan),
ikon `clip-path` §10.1.

### Tingkat 3 — + dunia ber-canvas (+ ~2 hari)

Latar bergerak yang benar-benar hidup.

- Canvas di-render ke buffer resolusi rendah (~480×270), di-upscale CSS dengan
  `image-rendering: pixelated` pada faktor **integer**. Upscale pecahan menghasilkan piksel
  beda ukuran (3px vs 4px) dan mata langsung membacanya sebagai "emulator murahan".
  ```js
  const scale = clamp(Math.round(innerHeight / 270), 2, 8);
  const W = Math.ceil(innerWidth / scale), H = Math.ceil(innerHeight / scale);
  ctx.imageSmoothingEnabled = false;     // reset setiap kali ukuran canvas berubah
  ```
- Setiap koordinat gambar dibulatkan. Selalu:
  ```js
  const px = (g,x,y,w,h,c) => { g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1,Math.round(w)), Math.max(1,Math.round(h))); };
  ```
- Dither §9.1 untuk gradasi, buffer bloom §9.2 untuk cahaya, sprite §10.2 untuk isi.
- Efek sampingnya menyenangkan: **biaya fill konstan** — ~140.000 piksel per frame, sama di
  layar 5K maupun di HP. Kamu boleh boros dengan partikel.
- Jangan pakai `fillText` di buffer ini. Ia di-antialias lalu di-upscale menjadi noda
  abu-abu. Gambar teks dengan font bitmap 3×5 buatan sendiri, atau taruh teks di DOM.

---

## §13. Anti-pola

| Jangan | Kenapa |
|---|---|
| `border-radius` di permukaan | Melengkungkan sudut; menghancurkan penanda utama gaya ini |
| `border: 1px solid` | Mitre di sudut, dan 1px bukan kelipatan `--px` |
| Warna hard-code di komponen | Memutus palet hidup; komponen itu mati saat ambient bergeser |
| Skala tipe fluid untuk teks kecil | Muka bitmap melembek di antara ukuran nativenya |
| Bayangan blur murni | Terbaca Material; selalu sertakan komponen keras 2–3px |
| Semua kartu mengambang serempak | Terbaca sebagai boy band; benda mengambang nyata tak sinkron |
| Float pada kartu berisi slider | Kamu tidak bisa mengenai target yang bergerak |
| Reduced-motion hanya di CSS | Gerak area-luas di latar yang bikin mabuk tetap jalan |
| Gradasi halus di area besar | Terbaca sebagai CSS, bukan sebagai 16-bit. Dither. |
| Garis solid sebagai divider | Terbaca sebagai border HTML. Buat putus-putus. |
| Bloom di segala hal | Kalau semuanya berpendar, tidak ada yang berpendar |
| Scanline di atas 0.05 opacity | Berubah dari rasa menjadi efek |
| Panel di bawah 86% opacity | Latar bergerak menghancurkan kontras teks dari detik ke detik |
| Font dari CDN | Offline = identitas runtuh jadi Helvetica |
| Banner error merah | Mengumumkan perubahan state; degradasikan lewat suasana |
| Emoji di kalimat isi | Merusak nada; emoji hanya untuk ikon fungsional |
| `#ff0000` atau warna jenuh penuh | Paletnya lembut; jenuh penuh terlihat seperti bug |

---

## §14. Checklist penerimaan

**Bentuk**
- [ ] Sudut panel ter-notch (kosong), bukan mitre, bukan melengkung
- [ ] Semua border tepat `--px` atau kelipatannya; tak ada `1px` liar
- [ ] Bevel konsisten: terang di atas, gelap di bawah, di setiap permukaan
- [ ] Sumur/inset punya bevel terbalik
- [ ] Zoom browser 200%: piksel tetap kotak tajam

**Warna**
- [ ] `grep -rn '#[0-9a-fA-F]\{3,6\}' src/components src/styles/components.css` → kosong,
      atau hanya di file token
- [ ] Ubah state ambient dari satu ekstrem ke ekstrem lain: **panel, tombol, teks, meter,
      border semua ikut** — bukan hanya latarnya
- [ ] Teks terbaca di state paling terang **dan** paling gelap
- [ ] Tak ada warna jenuh penuh di mana pun

**Tipe**
- [ ] Tak ada anti-alias pada muka bitmap (screenshot, zoom 800%: tak ada piksel abu-abu)
- [ ] Semua ukuran teks kecil dari tangga diskret, bukan `clamp()`
- [ ] Angka yang berubah tidak menggeser layout di sekitarnya
- [ ] Font di-self-host; tab Network kosong dari domain pihak ketiga

**Gerak**
- [ ] Reduced motion aktif: **tak ada yang bertranslasi**, tapi UI masih bernapas
- [ ] Kartu mengambang tidak sinkron satu sama lain
- [ ] Kartu berisi kontrol tidak mengambang
- [ ] Tombol turun saat ditekan
- [ ] Entrance bertingkat, tidak serempak
- [ ] Transisi warna `linear`, bukan eased

**Tekstur**
- [ ] Tak ada gradasi halus di area besar — semua ter-dither atau terkuantisasi
- [ ] Divider putus-putus, bukan solid
- [ ] Scanline ≤ 0.04 opacity
- [ ] Hanya benda yang secara naratif menyala yang mendapat bloom

**Suara**
- [ ] Setiap state kosong/loading/error punya kalimat yang ditulis tangan
- [ ] Tak ada tanda seru
- [ ] Kegagalan didegradasikan lewat suasana, bukan lewat banner
