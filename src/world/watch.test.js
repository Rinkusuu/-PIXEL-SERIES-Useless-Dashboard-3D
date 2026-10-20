import { describe, expect, it } from 'vitest';
import { watchPages } from './watch.js';

const date = new Date(2026, 9, 20, 7, 5);

describe('watch pages', () => {
  it('shows the time, day and month first, padded', () => {
    expect(watchPages(date, null, null)[0]).toEqual(['07:05', 'TUE 20', 'OCT']);
  });

  it('shows the temperature and the first word of the weather', () => {
    expect(watchPages(date, { tempC: 31.4, label: 'Partly cloudy', kind: 'cloudy' }, null)[1]).toEqual(['31°', 'Partly', '']);
  });

  it('says plainly when there is no reading yet', () => {
    expect(watchPages(date, null, null)[1]).toEqual(['--°', 'NO SKY', 'YET']);
    expect(watchPages(date, null, null)[2][1]).toBe('NO FIX');
  });

  it('tells you to look up only when the station is up AND lit', () => {
    expect(watchPages(date, null, { up: true, visible: true, elevation: 38.4, compass: 'SW' })[2]).toEqual(['ISS', '38° SW', 'LOOK UP']);
    expect(watchPages(date, null, { up: true, visible: false, elevation: 10, compass: 'N' })[2][2]).toBe('IN SHADE');
    expect(watchPages(date, null, { up: false, compass: 'E' })[2]).toEqual(['ISS', 'BELOW', 'E']);
  });

  it('keeps every line within the 32 px face (8 characters)', () => {
    const pages = watchPages(date, { tempC: -12, label: 'Thunderstorm with heavy hail', offline: true }, { up: true, visible: true, elevation: 88, compass: 'NW' });
    for (const p of pages) for (const line of p) expect(line.length).toBeLessThanOrEqual(8);
  });
});
