// The mannequin script: loads without a DOM, has no clashing helpers, and every exercise poses cleanly.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../js/figure.js'), 'utf8');
function load() {
  const ctx = { performance: { now: () => 0 }, Math, Object, Array, Float32Array, JSON, isFinite, parseFloat, parseInt };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return ctx.HIITFigure;
}

test('no two top-level helpers share a name (a later one would silently replace the first)', () => {
  const names = [...src.matchAll(/^ {2}function (\w+)\(/gm)].map(m => m[1]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dup, []);
});

test('every exercise poses with finite joints through its whole loop, without IK clamping', () => {
  const F = load();
  assert.ok(F && F._dev, 'HIITFigure loads outside a browser');
  F._dev.ikClamps();
  F.EXERCISES.forEach(id => {
    for (let k = 0; k <= 24; k++) {
      const J = F._dev.pose(id, k / 24);
      Object.keys(J).forEach(j => J[j].forEach(v => assert.ok(Number.isFinite(v), `${id} ${j} at ${k}/24`)));
    }
  });
  assert.equal(F._dev.ikClamps(), 0);
});

test('every loop is seamless (phase 0 equals phase 1)', () => {
  const F = load();
  F.EXERCISES.forEach(id => {
    const a = F._dev.pose(id, 0), b = F._dev.pose(id, 1);
    Object.keys(a).forEach(j => a[j].forEach((v, i) => assert.ok(Math.abs(v - b[j][i]) < 1e-3, `${id} ${j}`)));
  });
});
