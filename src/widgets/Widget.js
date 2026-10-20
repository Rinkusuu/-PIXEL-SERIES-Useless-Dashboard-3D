/* ============================================================================
   Widget.js — the base class every panel extends.

   It owns the boring, error-prone parts so no widget has to think about them:

     · building the pixel-glass frame and the header
     · giving every panel a DIFFERENT float period and phase (a grid of panels
       bobbing in perfect unison is instantly, cheaply wrong — real floating
       things are not synchronised)
     · registering for the tick ONLY if the subclass actually implements one
     · tearing every listener down on destroy, so nothing leaks

   A subclass implements `body()` and, optionally, `tick(env)` / `second(date)`.
   That's the whole API.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { el } from '../core/util.js';

let seq = 0;

export class Widget {
  /**
   * @param {object} o
   * @param {string} o.title    Header label. Omit for a chrome-less panel.
   * @param {string} o.span     Grid class, e.g. 'span-2'.
   * @param {boolean} o.float   Idle bob. Off for panels with fine controls
   *                            (you cannot reliably hit a slider that's moving).
   * @param {string} o.icon     A single emoji shown before the title.
   */
  constructor({ title = '', span = '', float = true, icon = '', className = '' } = {}) {
    this.title = title;
    this.span = span;
    this.float = float;
    this.icon = icon;
    this.className = className;
    this.index = seq++;
    this._off = []; // unsubscribe functions
  }

  /** Build the panel and attach it. Called once, by main.js. */
  mount(parent) {
    const cls = ['panel', 'panel--interactive', this.span, this.className]
      .filter(Boolean)
      .join(' ');

    this.root = el(`section.${cls.split(' ').join('.')}`, {
      style: {
        '--i': this.index,
        // A prime-ish spread of periods and a phase offset per panel. Nothing
        // here lines up, which is the point.
        '--float-dur': `${6.2 + (this.index % 5) * 0.9}s`,
        '--float-delay': `${(this.index % 7) * -0.73}s`,
      },
      'aria-label': this.title || undefined,
    });

    if (this.float) this.root.classList.add('panel--float');

    if (this.title) {
      this.head = el('header.panel__head', {}, [
        el('span.panel__spark'),
        el('h2.panel__title', { text: this.title }),
      ]);
      this.tools = el('div.panel__tools');
      this.head.append(this.tools);
      this.root.append(this.head);
    }

    this.bodyEl = el('div.panel__body');
    const content = this.body();
    if (content) this.bodyEl.append(content);
    this.root.append(this.bodyEl);

    parent.append(this.root);

    // Only subscribe to what the subclass actually uses. An empty tick handler
    // on twelve widgets is twelve function calls a frame for nothing.
    if (this.tick) this._off.push(bus.on('tick', (e) => this.tick(e)));
    if (this.second) this._off.push(bus.on('second', (d) => this.second(d)));
    if (this.onWeather) this._off.push(bus.on('weather', (w) => this.onWeather(w)));
    if (this.onPhase) this._off.push(bus.on('phase', (p) => this.onPhase(p)));

    this.mounted?.();
    return this.root;
  }

  /** Subclasses override. Return a Node (or nothing and build into this.bodyEl). */
  body() {
    return null;
  }

  /** Add a control to the panel header. */
  addTool(node) {
    this.tools?.append(node);
    return node;
  }

  /** Subscribe to a bus event with automatic teardown. */
  listen(event, fn) {
    this._off.push(bus.on(event, fn));
  }

  destroy() {
    for (const off of this._off) off();
    this._off.length = 0;
    this.root?.remove();
  }
}
