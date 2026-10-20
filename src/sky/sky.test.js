// The README's validation table, as tests. If one of these fails, the sky is lying.
import { describe, expect, it } from 'vitest';
import { sunPosition, planetPositions } from './planets.js';
import { declination, getSeason, maxSolarAltitude } from './season.js';
import { getPalette, PHASE_KEYS } from './palette.js';
import { moonPosition, moonPhase } from './moon.js';

const RAD = Math.PI / 180;

/** The day's highest sun, sampled every minute of a UTC day. */
function noonSun(y, m, d, lat, lon) {
  let best = { alt: -90 };
  for (let min = 0; min < 1440; min++) {
    const s = sunPosition(new Date(Date.UTC(y, m - 1, d, 0, min)), lat, lon);
    if (s.alt > best.alt) best = s;
  }
  return best;
}

/** Angle between two RA/dec directions, in degrees. */
function separation(a, b) {
  const c =
    Math.sin(a.dec * RAD) * Math.sin(b.dec * RAD) +
    Math.cos(a.dec * RAD) * Math.cos(b.dec * RAD) * Math.cos((a.ra - b.ra) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, c))) / RAD;
}

describe('the README validation table', () => {
  it("puts the sun's declination at +23.44° on the June solstice", () => {
    // 2026 solstice: 21 June, 08:24 UTC.
    const sun = sunPosition(new Date(Date.UTC(2026, 5, 21, 8, 24)), 0, 0);
    expect(sun.dec).toBeCloseTo(23.43, 1);
    expect(declination(172)).toBeCloseTo(23.44, 1);
  });

  it('puts the midsummer noon sun in London ~62° up, due south', () => {
    const s = noonSun(2026, 6, 21, 51.5, 0);
    expect(s.alt).toBeGreaterThan(61.5);
    expect(s.alt).toBeLessThan(62.3);
    expect(s.az).toBeGreaterThan(178.5);
    expect(s.az).toBeLessThan(181.5);
  });

  it("keeps Sydney's June sun low and in the NORTH", () => {
    const s = noonSun(2026, 6, 21, -33.87, 151.21);
    expect(s.alt).toBeGreaterThan(32.2);
    expect(s.alt).toBeLessThan(33.2);
    expect(Math.min(s.az, 360 - s.az)).toBeLessThan(2); // within 2° of due north
  });

  it('never lets Venus stray more than 47.8° from the sun', () => {
    let max = 0;
    // One synodic period and change, daily.
    for (let day = 0; day < 600; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day));
      const venus = planetPositions(date, 0, 0).find((p) => p.key === 'venus');
      max = Math.max(max, separation(venus, sunPosition(date, 0, 0)));
    }
    expect(max).toBeLessThanOrEqual(47.8);
    expect(max).toBeGreaterThan(45); // and it really does get out there
  });

  it('marches Jupiter roughly 30° across the sky in a year', () => {
    const ra = (date) => planetPositions(date, 0, 0).find((p) => p.key === 'jupiter').ra;
    const march = (ra(new Date(Date.UTC(2027, 0, 1))) - ra(new Date(Date.UTC(2026, 0, 1))) + 360) % 360;
    expect(march).toBeGreaterThan(25);
    expect(march).toBeLessThan(42);
  });
});

describe('seasons', () => {
  it('flips the season south of the equator', () => {
    const july = new Date(2026, 6, 15);
    expect(getSeason(july, 51.5).key).toBe('summer');
    expect(getSeason(july, -33.9).key).toBe('winter');
  });

  it('honours an override', () => {
    expect(getSeason(new Date(2026, 6, 15), 51.5, 'autumn').key).toBe('autumn');
  });

  it('lets a winter sun at 55°N barely clear the horizon', () => {
    expect(maxSolarAltitude(55, 355)).toBeLessThan(12);
  });
});

describe('palette', () => {
  it('is pure: it computes without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const pal = getPalette(12, 'clear');
    expect(pal.sky).toHaveLength(3);
    expect(pal.lum).toBeGreaterThan(0.8);
  });

  it('is darker at midnight than at noon, and in a storm than in clear weather', () => {
    expect(getPalette(0, 'clear').lum).toBeLessThan(getPalette(12, 'clear').lum);
    const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];
    expect(sum(getPalette(12, 'storm').sky[1])).toBeLessThan(sum(getPalette(12, 'clear').sky[1]));
  });

  it('exposes every phase key', () => {
    expect(PHASE_KEYS.length).toBe(9);
  });
});

describe('moon', () => {
  const sunMoon = (date) => separation(moonPosition(date, 0, 0), sunPosition(date, 0, 0));

  it('stands opposite the sun at full moon (3 Jan 2026, 10:03 UTC)', () => {
    const full = new Date(Date.UTC(2026, 0, 3, 10, 3));
    expect(sunMoon(full)).toBeGreaterThan(174);
    expect(moonPhase(full)).toBeCloseTo(0.5, 1);
  });

  it('sits beside the sun at new moon (18 Jan 2026, 19:52 UTC)', () => {
    const fresh = new Date(Date.UTC(2026, 0, 18, 19, 52));
    expect(sunMoon(fresh)).toBeLessThan(6); // its orbit is tilted 5°
    expect(Math.min(moonPhase(fresh), 1 - moonPhase(fresh))).toBeLessThan(0.03);
  });

  it('rises in the east and sets in the west', () => {
    // A full moon is up all night: low in the east at dusk, low in the west at dawn (Jakarta).
    const dusk = moonPosition(new Date(Date.UTC(2026, 0, 3, 11, 0)), -6.2, 106.85);
    const dawn = moonPosition(new Date(Date.UTC(2026, 0, 3, 22, 30)), -6.2, 106.85);
    expect(dusk.az).toBeGreaterThan(45);
    expect(dusk.az).toBeLessThan(135);
    expect(dawn.az).toBeGreaterThan(225);
    expect(dawn.az).toBeLessThan(315);
  });
});
