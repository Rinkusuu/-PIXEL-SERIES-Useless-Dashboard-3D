// The P3 path through the world: out of the door, a glance at the watch, the corkboard.
// `?debug` exposes window.__world for placing the player; every action is a real key press.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('uad.v2')) localStorage.setItem('uad.v2', JSON.stringify({ v: 2, mode: '3d', timeOverride: 12, hints3d: true }));
  });
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__world);
  await expect(page.locator('html')).toHaveAttribute('data-mode', '3d');
});

const pos = (page) => page.evaluate(() => ({ ...window.__world.player.pos }));
const tip = (page) => page.locator('.w3d__tip');

test('walk out of the door, glance at the watch, open the corkboard', async ({ page }) => {
  // Stand inside, facing the closed door.
  await page.evaluate(() => window.__world.teleport(5, 74.6, 0, 0, 1.5));
  await expect(page.locator('.w3d')).toHaveAttribute('data-target', '');
  await expect(tip(page)).toContainText(/open the door/i);

  // Open it and walk out onto the porch and into the yard.
  await page.keyboard.press('KeyE');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  expect((await pos(page)).z).toBeLessThan(70); // the north wall is at 73.5

  // Glance at the watch: the arm comes up and the screen reader hears the time.
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.w3d .sr-only[aria-live="polite"]')).toContainText(/your watch, time: \d\d:\d\d/i);
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.w3d .sr-only[aria-live="polite"]')).toContainText(/weather/i);
  await page.keyboard.press('Escape');

  // Back inside to the corkboard (placed, not walked: the walk is above), and open it with E.
  await page.evaluate(() => window.__world.lookAt('corkboard', 8.8, 80, 1.5));
  await expect(tip(page)).toContainText(/corkboard/i);
  await page.keyboard.press('KeyE');
  await expect(page.locator('html')).toHaveAttribute('data-overlay', 'panel');
  const panel = page.locator('.grid > .panel[data-focus]');
  await expect(panel).toHaveAttribute('aria-label', 'Words of Someone');
  await expect(panel).toBeVisible();

  // Esc closes it and gives the world back.
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveAttribute('data-overlay', /.*/);
});

test('the pocket book holds every panel', async ({ page }) => {
  await page.waitForTimeout(2400); // the wake-up
  await page.keyboard.press('KeyB');
  await expect(page.locator('html')).toHaveAttribute('data-overlay', 'pocket');
  await expect(page.locator('.grid > .panel:visible')).toHaveCount(15);
  await page.keyboard.press('KeyB');
  await expect(page.locator('html')).not.toHaveAttribute('data-overlay', /.*/);
});

test('keyboard only: Tab finds the corkboard, E opens it, the screen reader hears it', async ({ page }) => {
  // Stand in the middle of the room on the floor (not the loft), facing the hearth wall.
  await page.evaluate(() => window.__world.teleport(8.5, 79.5, -Math.PI / 2, 0, 1.5));
  const said = page.locator('.w3d .sr-only[aria-live="polite"]');
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450); // the camera eases round
    found = /corkboard/i.test(await said.innerText());
  }
  expect(found).toBe(true);
  await expect(page.locator('.w3d__tip')).toContainText(/corkboard/i);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.grid > .panel[data-focus]')).toHaveAttribute('aria-label', 'Words of Someone');
});
