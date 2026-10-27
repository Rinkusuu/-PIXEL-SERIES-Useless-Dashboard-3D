// Views of the P7.3 places. Usage: node scripts/capture-places.mjs <label> [url]
import { chromium } from '@playwright/test';
const label = process.argv[2] || 'places';
const url = (process.argv[3] || 'http://localhost:4173') + '/?debug';
// [name, hour, x, z, yaw, pitch] — or [name, hour, x, z, {at: [tx, tz]}, pitch] to face a point.
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const VIEWS = [
  ['yard', 10, 18, 92, 0.75, -0.12],
  ['garden-greenhouse', 10, -1, 71, face(-1, 71, -7, 80), -0.18],
  ['barn', 11, 21, 52, face(21, 52, 26, 65), 0.08],
  ['windmill', 16, 36, 58, -0.45, 0.15],
  ['gazebo-lake', 18.5, 4, 36, 0.9, 0.0],
  ['boathouse', 9, 16, -42, face(16, -42, 6, -31), -0.08],
  ['ruins', 11, 40, -78, 0, 0.0],
  ['signpost', 11, 9, 61, 0.3, 0.0],
  ['meadow-wide', 12, 5, 62, -0.55, -0.05],
];
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, hour, ...at] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, geolocation: { latitude: -6.2, longitude: 106.85 }, permissions: ['geolocation'] });
  await ctx.addInitScript((h) => localStorage.setItem('uad.v2', JSON.stringify({ v: 2, mode: '3d', timeOverride: h, hints3d: true })), hour);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.wx__kind.is-active').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  await page.locator('.wx__kind[data-kind="clear"]').dispatchEvent('click').catch(() => {});
  await page.waitForFunction(() => window.__world);
  await page.evaluate((a) => window.__world.teleport(...a), at);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `docs/screens/renovasi-3d/${label}-1366-${name}.png` });
  const s = await page.evaluate(() => window.__world.stats());
  console.log(`${label}-1366-${name}.png  ${s.calls} calls  ${s.triangles} tris${errors.length ? '  ERR ' + errors[0] : ''}`);
  await ctx.close();
}
await browser.close();
