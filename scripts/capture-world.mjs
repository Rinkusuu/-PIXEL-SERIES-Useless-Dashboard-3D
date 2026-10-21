// Screenshot the 3D world from fixed viewpoints and hours.
// Usage: node scripts/capture-world.mjs <label> [url] [widths]   e.g. p2 http://localhost:4173 1366,390
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] || 'world';
const url = (process.argv[3] || 'http://localhost:4173') + '/?debug';
const widths = (process.argv[4] || '1366,390').split(',').map(Number);
const out = 'docs/screens/renovasi-3d';
mkdirSync(out, { recursive: true });

const SIZES = { 1920: [1920, 1080], 1366: [1366, 768], 430: [430, 932], 390: [390, 844] };

// yaw 0 looks north (−z); positive yaw turns west. The first view is the waking spot itself.
const VIEWS = [
  { name: 'cabin', hour: 12 },
  { name: 'door-open', hour: 12, at: [5, 75.4, 0, -0.04], door: true },
  { name: 'meadow-noon', hour: 12.5, at: [20, 45, -0.745, 0.02] },
  { name: 'lake-dusk', hour: 18.7, at: [-40, -9, 0.414, 0.04] },
  { name: 'hill-night', hour: 22.5, at: [78, -17, 1.4, 0.22] },
  { name: 'yard-night', hour: 21.5, at: [14, 56, 2.8, 0.05] },
  { name: 'forest-edge', hour: 10, at: [25, -76, 0, 0.12] },
  { name: 'lake-shore', hour: 9, at: [-14, 8, 0.9, -0.15] },
];

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const w of widths) {
  const [vw, vh] = SIZES[w];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({
      viewport: { width: vw, height: vh },
      geolocation: { latitude: -6.2, longitude: 106.85 },
      permissions: ['geolocation'],
      hasTouch: w < 500,
      isMobile: w < 500,
    });
    await ctx.addInitScript((hour) => {
      localStorage.setItem('uad.v2', JSON.stringify({ v: 2, mode: '3d', timeOverride: hour, hints3d: true, visits: 3, firstSeen: 1 }));
    }, v.hour);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.wx__kind.is-active').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    await page.locator('.wx__kind[data-kind="clear"]').dispatchEvent('click').catch(() => {});
    await page.waitForFunction(() => window.__world, null, { timeout: 15000 });
    if (v.at) await page.evaluate((a) => window.__world.teleport(...a), v.at);
    if (v.door) await page.evaluate(() => window.__world.house.toggleDoor());
    await page.waitForTimeout(v.at ? 2500 : 3200); // the wake-up takes 2.2 s; the sky updates once a second
    await page.screenshot({ path: `${out}/${label}-${w}-${v.name}.png` });
    // Frame times over two seconds of rAF, plus one frame's draw calls.
    const perf = await page.evaluate(async () => {
      const t = [];
      let last = performance.now();
      await new Promise((done) => {
        const step = (now) => {
          t.push(now - last);
          last = now;
          if (t.length < 120) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      t.sort((a, b) => a - b);
      const s = await window.__world.stats();
      return { median: t[t.length >> 1].toFixed(1), p95: t[Math.floor(t.length * 0.95)].toFixed(1), tier: window.__world.tier, ...s };
    });
    console.log(`${label}-${w}-${v.name}.png  median ${perf.median} ms  p95 ${perf.p95} ms  ${perf.tier} ${perf.size}  ${perf.calls} calls  ${perf.triangles} tris${errors.length ? '  ERR ' + errors[0] : ''}`);
    await ctx.close();
  }
}
await browser.close();
