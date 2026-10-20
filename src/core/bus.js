/* ============================================================================
   bus.js — a 30-line pub/sub. The only way modules talk to each other.

   The scene never imports a widget and no widget imports another. Weather
   arrives → `bus.emit('weather', data)` → the sky, the weather panel and the
   pixel pet all react independently. Adding a listener costs nothing and
   removing a widget can't break anything else.
   ========================================================================== */

const channels = new Map();

export const bus = {
  /** Subscribe. Returns an unsubscribe function — always keep it. */
  on(event, fn) {
    if (!channels.has(event)) channels.set(event, new Set());
    channels.get(event).add(fn);
    return () => bus.off(event, fn);
  },

  off(event, fn) {
    channels.get(event)?.delete(fn);
  },

  /** Fire and forget. A throwing listener must not take down its siblings. */
  emit(event, payload) {
    const set = channels.get(event);
    if (!set) return;
    // Copy: a listener is allowed to unsubscribe itself mid-emit.
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] listener for "${event}" threw:`, err);
      }
    }
  },
};

/* ── The event vocabulary ─────────────────────────────────────────────────────
   'tick'        { t, dt, frame }      every animation frame
   'second'      Date                  once per wall-clock second
   'weather'     WeatherModel          new weather resolved
   'phase'       { key, lum, palette } day/night phase changed
   'sfx'         string                play a named blip
   'toast'       { icon, text }        show a transient message
   'coins'       number                coins were earned (drives the coin rain)
   'achievement' { id, title }         a tiny achievement unlocked
   'motion'      boolean               ambient motion toggled
   -------------------------------------------------------------------------- */
