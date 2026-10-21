// Interior (and later, any named set of) viewpoints, for before/after comparisons.
// Usage: node scripts/capture-interior.mjs <label> [url]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] || 'interior';
const url = (process.argv[3] || 'http://localhost:4173') + '/?debug';
const out = 'docs/screens/renovasi-3d';
mkdirSync(out, { recursive: true });

// [name, hour, x, z, yaw, pitch, feet]
const VIEWS = [
  ['wake', 10, null],
  ['room-from-door', 10, 5, 74.2, Math.PI, -0.12, 1.5],
  ['hearth-corner', 16, 7.4, 76.2, -Math.PI / 2 - 0.2, -0.1, 1.5],
  ['kitchen-shelf', 10, 4.5, 78.4, Math.PI * 0.75, -0.15, 1.5],
  ['loft', 10, 6, 80.2, 0.3, -0.35, 99],
  ['room-night', 22, 5, 74.2, Math.PI, -0.12, 1.5],
];

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, hour, ...at] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, geolocation: { latitude: -6.2, longitude: 106.85 }, permissions: ['geolocation'] });
  await ctx.addInitScript((h) => localStorage.setItem('uad.v2', JSON.stringify({ v: 2, mode: '3d', timeOverride: h, hints3d: true })), hour);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.wx__kind.is-active').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  await page.locator('.wx__kind[data-kind="clear"]').dispatchEvent('click').catch(() => {});
  await page.waitForFunction(() => window.__world);
  if (at[0] !== null) await page.evaluate((a) => window.__world.teleport(...a), at);
  await page.waitForTimeout(at[0] === null ? 3200 : 2200);
  await page.screenshot({ path: `${out}/${label}-1366-${name}.png` });
  const s = await page.evaluate(() => window.__world.stats());
  console.log(`${label}-1366-${name}.png  ${s.calls} calls  ${s.triangles} tris`);
  await ctx.close();
}
await browser.close();
