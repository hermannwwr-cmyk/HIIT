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

const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
const published = workflow.match(/cp -r ([^\n]*) _site\//)[1].split(/\s+/); // the files and directories copied to the site
const isPublished = file => published.includes(file.split('/')[0]);
const isRelative = file => !/^([a-z]+:|\/)/i.test(file);

test('the Pages workflow publishes the icons and the manifest', () => {
  assert.ok(published.includes('manifest.webmanifest'));
  assert.ok(published.includes('icons'));
});

// ---- font: self-hosted, so no third party stands between the visitor and first paint
test('Geist is self-hosted: one woff2, declared and preloaded in index.html, with its licence', () => {
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  const face = html.match(/@font-face\s*\{[^}]*\}/)[0];
  const file = face.match(/url\(([^)]+)\)/)[1];
  assert.equal(fs.readFileSync(path.join(root, file)).toString('ascii', 0, 4), 'wOF2', file + ' is a woff2');
  assert.match(face, /font-family:\s*'Geist'/);
  assert.match(face, /font-weight:\s*200 700/); // the variable file covers every weight the CSS uses
  assert.match(face, /font-display:\s*swap/);
  assert.match(face, /unicode-range:\s*U\+0000-00FF/);
  const preload = html.match(/<link rel="preload"[^>]*>/)[0];
  assert.ok(preload.includes('href="' + file + '"') && /as="font"/.test(preload) && /type="font\/woff2"/.test(preload) && /\bcrossorigin\b/.test(preload), preload);
  assert.match(html, /if \(location\.protocol !== 'file:'\) document\.head\.insertAdjacentHTML\('beforeend', '<link rel="preload"/); // file:// refuses a preload
  assert.match(fs.readFileSync(path.join(root, 'fonts/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.ok(isPublished(file), 'the workflow publishes ' + file);
});

// ---- offline: the service worker
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const swCode = sw.replace(/\/\/.*$/gm, ''); // without its comments
const shell = [...sw.match(/var SHELL = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('the service worker precaches exactly what index.html loads, and all of it is published', () => {
  shell.forEach(file => {
    assert.ok(isRelative(file), file + ' is a relative URL (the site lives under /HIIT/)');
    assert.ok(fs.existsSync(path.join(root, file)), file + ' exists');
    assert.ok(isPublished(file), 'the workflow publishes ' + file);
  });
  const loads = ['index.html']
    .concat([...html.matchAll(/<link rel="(?:stylesheet|icon|apple-touch-icon|manifest|preload)"[^>]*href="([^"]+)"/g)].map(m => m[1]))
    .concat([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]))
    .concat([...html.matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => m[1]));
  assert.ok(loads.length >= 12, 'found the files the page loads');
  loads.forEach(file => assert.ok(isRelative(file), file + ' is local: nothing third-party to go missing offline'));
  assert.deepEqual([...new Set(loads)].sort(), shell.slice().sort());
  assert.ok(published.includes('sw.js'), 'the workflow publishes sw.js');
});

test('each deploy gets its own cache: the workflow stamps the worker\'s version', () => {
  const lines = sw.split('\n').filter(l => /^var VERSION = /.test(l));
  assert.equal(lines.length, 1);
  // the workflow's own sed expression, applied here to the repo's sw.js
  const sed = workflow.match(/sed -i "s\|([^|]+)\|([^|]+)\|" _site\/sw\.js/);
  assert.ok(sed, 'the workflow rewrites _site/sw.js');
  assert.ok(workflow.indexOf('sed -i') > workflow.indexOf('cp -r'), 'after the copy');
  const stamped = lines[0].replace(new RegExp(sed[1]), sed[2].replace('${GITHUB_SHA}', 'abc123'));
  assert.equal(stamped, "var VERSION = 'abc123';");
  assert.match(swCode, /CACHE = PREFIX \+ VERSION/);
});

test('a new worker never takes over a running session', () => {
  assert.doesNotMatch(swCode, /clients\.claim/);
  // skipWaiting only when the page asks for it, and the page asks only on the setup screen, as it opens
  assert.equal((swCode.match(/skipWaiting/g) || []).length, 1);
  assert.match(swCode, /event\.data === 'activate-now'\) self\.skipWaiting\(\)/);
  const reg = html.match(/<script id="swReg">([\s\S]*?)<\/script>/)[1];
  // the page asks only where a reload costs nothing (the setup screen), and never on a first install
  assert.match(reg, /if \(!reg\.waiting \|\| !navigator\.serviceWorker\.controller \|\| !idle\(\)\) return;/);
  assert.match(reg, /return document\.body\.getAttribute\('data-screen'\) === 'setup'/);
  assert.match(reg, /if \(asked && idle\(\)\) location\.reload\(\)/);
  assert.equal((reg.match(/postMessage\('activate-now'\)/g) || []).length, 1);
  assert.match(swCode, /caches\.delete/); // older versions are removed on activate
});

test('the worker is registered only over https or on localhost, and not by the one-file build', () => {
  const reg = html.match(/<script id="swReg">([\s\S]*?)<\/script>/)[1];
  assert.match(reg, /location\.protocol !== 'https:' && host !== 'localhost' && host !== '127\.0\.0\.1'\) return;/);
  assert.match(reg, /register\('sw\.js'\)/); // relative: the scope is the site's sub-path
  assert.ok(html.indexOf('<script id="swReg">') > html.lastIndexOf('<script src='), 'after the app\'s scripts');

  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiit-build-'));
  try {
    [[], ['--fragment']].forEach(flags => {
      const out = path.join(dir, 'out' + flags.length + '.html');
      execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), out].concat(flags), { stdio: 'pipe' });
      const built = fs.readFileSync(out, 'utf8');
      assert.doesNotMatch(built, /serviceWorker|sw\.js/, 'no worker in the one-file build');
      assert.match(built, /url\(data:font\/woff2;base64,[A-Za-z0-9+\/=]+\)/, 'the font is inlined');
      assert.doesNotMatch(built, /rel="preload"/, 'and not preloaded');
      assert.doesNotMatch(built, /(?:href|src)="(?:css|js|fonts|icons)\/|url\(fonts\//, 'nothing left to fetch');
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
