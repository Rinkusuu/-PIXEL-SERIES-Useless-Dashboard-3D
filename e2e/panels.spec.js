// §10: every panel can be reached from the world — by its object on desktop (E) and
// on a phone (the Use button) — and Pockets from the pocket book. ?debug places the player.
import { expect, test } from '@playwright/test';

// Where to stand for each object: x, z, and the highest floor to consider.
const STAND = {
  clock: [5, 75.6, 1.5], barometer: [6.3, 71.4], telescope: [78, -16.3], mailbox: [-14, 62.3],
  fortune: [5.4, 78.2, 1.5], corkboard: [8.8, 80, 1.5], radio: [4.6, 74.9, 1.5], knobs: [4.75, 74.9, 1.5],
  mirror: [10.1, 75.3, 1.5], kettle: [7.2, 80.6, 1.5], coins: [1.0, 80, 1.5], certificates: [1.2, 75.1, 1.5],
  bucket: [-40.6, -9.4], slime: null, // the slime wanders: found where it is
};

async function boot(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('uad.v2')) localStorage.setItem('uad.v2', JSON.stringify({ v: 2, mode: '3d', timeOverride: 12, hints3d: true }));
  });
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__world);
  await page.waitForTimeout(2400); // the wake-up
}

async function aimAt(page, id) {
  if (STAND[id]) return page.evaluate(([id, s]) => window.__world.lookAt(id, ...s), [id, STAND[id]]);
  return page.evaluate((id) => {
    const p = window.__world.objects.find((o) => o.id === id).object.position;
    window.__world.lookAt(id, p.x, p.z + 1.6);
  }, id);
}

async function everyPanel(page, use, log = () => {}) {
  const objects = await page.evaluate(() => window.__world.objects.map((o) => ({ id: o.id, panel: o.panel, label: o.label })));
  expect(objects.length).toBe(14);
  for (const { id, panel, label } of objects) {
    log(`aim ${id}`);
    await aimAt(page, id);
    // Wait for the world to notice (the target is picked on the next frame).
    await expect(page.locator('.w3d__tip'), id).toContainText(label, { ignoreCase: true, timeout: 3000 });
    log(`use ${id}`);
    await use();
    await expect(page.locator('.grid > .panel[data-focus]'), id).toHaveAttribute('aria-label', panel);
    await expect(page.locator('.grid > .panel[data-focus]'), id).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('html'), id).not.toHaveAttribute('data-overlay', /.*/);
  }
}

test('desktop: every panel opens from its object with E', async ({ page }) => {
  await boot(page);
  await everyPanel(page, () => page.keyboard.press('KeyE'));
  // Pockets is on you: the pocket book.
  await page.keyboard.press('KeyB');
  await expect(page.locator('.grid > .panel[aria-label="Pockets"]')).toBeVisible();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every panel opens from its object with the Use button', async ({ page }) => {
    await boot(page);
    await expect(page.locator('html')).toHaveAttribute('data-mode', '3d');
    // The phone's buttons appear once the first touch says this is a touch screen.
    // (Left half: a thumbstick touch. A tap on the right half would walk you somewhere.)
    await page.touchscreen.tap(60, 700);
    await everyPanel(page, () => page.locator('.w3d__use').tap({ timeout: 5000 }));
    await page.locator('.w3d__pocket').tap();
    await expect(page.locator('.grid > .panel[aria-label="Pockets"]')).toBeVisible();
  });

  test('the watch, from its button', async ({ page }) => {
    await boot(page);
    await page.touchscreen.tap(60, 700);
    await page.locator('.w3d__watch').tap();
    await expect(page.locator('.w3d .sr-only[aria-live="polite"]')).toContainText(/your watch, time/i);
  });
});
