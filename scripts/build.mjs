// Bundle index.html + css + js into one self-contained HTML file.
//   node scripts/build.mjs [out.html] [--fragment]
// --fragment drops the <html>/<head>/<body> wrapper, for hosts that add their own.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(args.find(a => !a.startsWith('--')) || join(root, 'dist', 'overdrive-hiit.html'));

let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(root, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);

// icons: one file can't carry the PNG set or the manifest; keep the SVG favicon, inlined
html = html.replace(/<link rel="icon" href="(icons\/[^"]+\.svg)" type="image\/svg\+xml">/, (_, href) =>
  `<link rel="icon" href="data:image/svg+xml;base64,${readFileSync(join(root, href)).toString('base64')}" type="image/svg+xml">`);
html = html.replace(/<link rel="(?:icon|apple-touch-icon|manifest)" href="(?!data:)[^"]*"[^>]*>\s*/g, '');

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<body[^>]*>\s*/i, '')
    .replace(/<\/body>\s*/i, '');
  html = html.replace(/(<title>[^<]*<\/title>)/, '$1\n<meta name="claude:viewport-fit-sides" content="cover">');
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
