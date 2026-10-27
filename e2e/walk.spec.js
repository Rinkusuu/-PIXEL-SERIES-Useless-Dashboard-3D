// The walk: can you actually get everywhere the world says you can? Real key presses;
// ?debug only places you at the start of each leg.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uad.v2', JSON.stringify({ v: 2, mode: '3d', timeOverride: 12, hints3d: true })));
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__world);
  await page.waitForTimeout(2400); // the wake-up
});

const pos = (page) => page.evaluate(() => ({ ...window.__world.player.pos }));
const walk = async (page, ms) => {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
};

test('out through the door, which stops you when it is shut', async ({ page }) => {
  await page.evaluate(() => window.__world.teleport(5, 74.6, 0, 0, 1.5));
  await expect(page.locator('.w3d__tip')).toContainText(/open the door/i); // the door is picked on the next frame
  await page.keyboard.press('KeyE');
  await walk(page, 2500);
  expect((await pos(page)).z).toBeLessThan(70);

  await page.evaluate(() => { window.__world.teleport(5, 74.6, 0, 0, 1.5); window.__world.house.toggleDoor(); });
  await walk(page, 1500);
  expect((await pos(page)).z).toBeGreaterThan(73.5); // the wall's line
});

test('up the ladder to the loft', async ({ page }) => {
  await page.evaluate(() => window.__world.teleport(9.2, 75.6, Math.PI, 0, 1.5));
  await walk(page, 2500);
  expect((await pos(page)).y).toBeCloseTo(3.3, 1);
});

test('the lake stops you at its shore', async ({ page }) => {
  await page.evaluate(() => window.__world.teleport(-30, 14, Math.PI / 2, 0));
  await walk(page, 4000);
  const p = await pos(page);
  expect(p.x).toBeGreaterThan(-45);
  expect(p.y).toBeGreaterThan(-0.2);
});

test('up the fire lookout to its deck', async ({ page }) => {
  await page.evaluate(() => window.__world.teleport(25, -77, 0, 0));
  await walk(page, 9000);
  expect((await pos(page)).y).toBeGreaterThan(10);
});
