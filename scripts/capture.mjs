// Screenshot the running app at fixed viewports and frozen hours.
// Usage: node scripts/capture.mjs <label> [url] [mode]   (e.g. before, http://localhost:4173, classic)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] || 'shot';
const url = process.argv[3] || 'http://localhost:4173';
const mode = process.argv[4] || 'classic'; // 'classic' | '3d' | 'auto'
const out = 'docs/screens/renovasi-3d';
mkdirSync(out, { recursive: true });

const VIEWPORTS = [[1920, 1080], [1366, 768], [430, 932], [390, 844]];
const HOURS = { noon: 12, midnight: 1 };

const browser = await chromium.launch();
for (const [w, h] of VIEWPORTS) {
  for (const [name, hour] of Object.entries(HOURS)) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      geolocation: { latitude: -6.2, longitude: 106.85 }, // Jakarta, so the sky is the same every run
      permissions: ['geolocation'],
    });
    // Freeze the hour and skip the store's first-visit noise.
    // Seeded as uad.v1 on purpose: every capture also exercises the migration.
    await ctx.addInitScript(([hour, mode]) => {
      localStorage.setItem('uad.v1', JSON.stringify({ timeOverride: hour, visits: 3, firstSeen: 1, mode }));
    }, [hour, mode]);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    // Force clear weather so a real storm in Jakarta doesn't make before/after incomparable.
    // Wait for the real reading first: the widget ignores a force until it has one.
    await page.locator('.wx__kind.is-active').waitFor({ timeout: 15000 }).catch(() => {});
    await page.locator('.wx__kind[data-kind="clear"]').dispatchEvent('click'); // panels bob, so a real click never sees them "stable"
    await page.waitForTimeout(2500); // palette settles at 4 Hz; let the fog/boot veil finish
    await page.screenshot({ path: `${out}/${label}-${w}-${name}.png` });
    await ctx.close();
    console.log(`${label}-${w}-${name}.png`);
  }
}
await browser.close();
