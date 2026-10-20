/* ============================================================================
   net.js — whether the world can reach the world.

   `navigator.onLine` is not a network check. It is true whenever the machine has
   *an* interface up — a wifi network with a broken uplink, a captive portal, an
   ethernet cable into a dead switch. It answers "is a cable plugged in", which
   is not the question anyone has ever wanted answered.

   So online means: a request we actually made, actually came back. The services
   tell us when they succeed or fail (`net:ok` / `net:fail`), and this module
   turns that stream into one piece of state the rest of the app can trust.

   Going OFFLINE is believed immediately — the failure already happened, there is
   nothing to confirm. Coming back ONLINE requires a real successful response,
   which is why `navigator.onLine` firing 'online' only triggers a probe here
   rather than a state change: the browser is telling us a cable moved, and we
   are not going to lift the fog off the world on the strength of that.
   ========================================================================== */

import { bus } from './bus.js';

class Net {
  constructor() {
    this.online = true;
    this._probing = false;

    // A failure is only news the first time. The services are chatty.
    bus.on('net:fail', () => this._set(false));
    bus.on('net:ok', () => this._set(true));

    addEventListener('offline', () => this._set(false));

    // The OS thinks we're back. Prove it.
    addEventListener('online', () => this.probe());

    // If the browser is *sure* we're offline at boot, believe that much.
    if (navigator.onLine === false) this.online = false;
  }

  _set(online) {
    if (online === this.online) return;
    this.online = online;
    bus.emit('net', { online });
  }

  /** Ask the cheapest question we can of a host we already depend on. */
  async probe() {
    if (this._probing) return this.online;
    this._probing = true;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      // `no-store`: a probe answered from the HTTP cache proves nothing.
      await fetch('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=is_day', {
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      this._set(true);
    } catch {
      this._set(false);
    } finally {
      this._probing = false;
    }
    return this.online;
  }
}

export const net = new Net();

/**
 * Register the service worker. This is the only reason the app can be OPENED
 * with no network at all — without it, everything else in this file is just a
 * graceful way to fail at something that already failed.
 *
 * Dev has no service worker on purpose: a cache-first worker in front of Vite's
 * HMR is a machine for serving you yesterday's code and making you doubt your
 * own eyes.
 */
export function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Not fatal. The app works, it just won't survive a cold offline boot.
      console.warn('[net] service worker did not register:', err.message);
    });
  });
}
