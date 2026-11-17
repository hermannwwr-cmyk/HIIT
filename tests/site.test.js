// The files the published site links to exist and are what browsers and phones expect.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pngSize = file => { const b = fs.readFileSync(file); assert.equal(b.toString('ascii', 1, 4), 'PNG', file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('every icon and the manifest linked from index.html exists', () => {
  const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon|manifest)" href="([^"]+)"/g)].map(m => m[2]);
  assert.ok(links.length >= 4, 'favicon (svg + png), apple-touch-icon and manifest are linked');
  links.forEach(href => assert.ok(fs.existsSync(path.join(root, href)), href + ' exists'));
});

test('home-screen and tab icons have the sizes the platforms ask for', () => {
  assert.deepEqual(pngSize(path.join(root, 'icons/apple-touch-icon.png')), [180, 180]);
  assert.deepEqual(pngSize(path.join(root, 'icons/favicon-32.png')), [32, 32]);
  // iOS fills transparent pixels with black: the home-screen icon is opaque (RGB, colour type 2)
  assert.equal(fs.readFileSync(path.join(root, 'icons/apple-touch-icon.png'))[25], 2);
});

test('the web app manifest is valid and its icons exist at their stated sizes', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Overdrive HIIT');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './'); // works from the GitHub Pages sub-path
  const png = m.icons.filter(i => i.type === 'image/png');
  png.forEach(i => {
    const [w, h] = pngSize(path.join(root, i.src));
    assert.equal(w + 'x' + h, i.sizes, i.src);
  });
  assert.ok(png.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'a maskable icon for Android');
  assert.ok(png.some(i => i.sizes === '192x192'), 'a 192 px icon');
});

test('the Pages workflow publishes the icons and the manifest', () => {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  assert.match(wf, /cp -r[^\n]*\bmanifest\.webmanifest\b/);
  assert.match(wf, /cp -r[^\n]*\bicons\b/);
});
