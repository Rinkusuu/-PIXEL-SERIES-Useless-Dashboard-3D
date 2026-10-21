import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Emit the service worker with the REAL asset list baked in.
 *
 * Vite content-hashes every chunk, so the precache list can only be known after
 * the bundle exists. Writing `index-abc123.js` into sw-template.js by hand would
 * produce a service worker that is correct until the next build and silently
 * wrong forever after — it would serve a 404 from cache and the app would boot
 * to a blank screen offline, which is the exact failure the SW is there to
 * prevent.
 *
 * This is also why there's no PWA plugin in package.json. The whole job is
 * twenty lines, and the dependency list is a feature of this project.
 */
function serviceWorker() {
  return {
    name: 'uad-service-worker',
    apply: 'build',

  /* `order: 'post'` is load-bearing. Vite's own CSS plugin adds the stylesheet to
     the bundle in ITS generateBundle, and plugin hooks run in registration order
     — so a naive hook here reads the bundle before the CSS exists in it and
     precaches everything except the stylesheet. The app would then boot offline
     with no styles at all: all the content, none of the world. */
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
      const assets = Object.keys(bundle).map((f) => `/${f}`);

      // The shell: the entry HTML, every hashed chunk, the manifest, the icon,
      // and the fonts — which are emitted as assets and so are already in
      // `bundle`, but the manifest and icon come from public/ and are not.
      const precache = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', ...assets];

      const version = Date.now().toString(36);

      /* replaceAll, not replace. The template's own doc comment mentions
         `__PRECACHE__` by name, and `String.replace` with a string pattern
         substitutes only the FIRST match — so the asset list was being injected
         into the comment, the real token was left untouched, and the service
         worker shipped with `const PRECACHE = __PRECACHE__` in it. It threw a
         ReferenceError on install, every install, silently, and the app would
         never have booted offline. */
      const sw = readFileSync(resolve(__dirname, 'sw-template.js'), 'utf8')
        .replaceAll('__PRECACHE__', JSON.stringify([...new Set(precache)], null, 2))
        .replaceAll('__VERSION__', version);

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
      },
    },
  };
}

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 0, // fonts must stay as files so the SW can precache them
    chunkSizeWarningLimit: 700, // the lazy 3D world chunk is three.js (~590 kB raw); that is expected, not a mistake
  },
  plugins: [serviceWorker()],
  test: { include: ['src/**/*.test.js'] }, // e2e/ belongs to Playwright, not Vitest
});
