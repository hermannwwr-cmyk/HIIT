// The mannequin script: loads without a DOM, has no clashing helpers, and every exercise poses cleanly.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../js/figure.js'), 'utf8');
function load() {
  const ctx = { performance: { now: () => 0 }, Math, Object, Array, Float32Array, JSON, isFinite, parseFloat, parseInt,
    setTimeout: () => 0, clearTimeout: () => {} }; // (the frame loop never runs here)
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

// A canvas stand-in good enough for a figure to lay out and draw into (every call a no-op).
function fakeCanvas() {
  const grad = { addColorStop() {} }, noop = () => grad;
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; } });
  return { clientWidth: 240, clientHeight: 240, width: 0, height: 0, style: {}, getContext: () => ctx };
}

test('a clock handed over with a dissolve is kept as given; setTime moves it at once', () => {
  const F = load();
  const f = F.create(fakeCanvas(), { exercise: 'pushup' });
  f._computePose(); // a pose is shown, so the next change dissolves from it
  f.setExercise('squat', { time: 1 });
  assert.ok(f.morphT < 1, 'the change dissolves');
  assert.equal(f.getTime(), 1);
  f.setTime(2.5);
  assert.equal(f.getTime(), 2.5);
  f.destroy();
});

test('a count-in breathes in its start pose, without IK clamping', () => {
  const F = load();
  const f = F.create(fakeCanvas(), { exercise: 'jog-slow' });
  F._dev.ikClamps();
  ['jacks', 'squat', 'pecstretch', 'hamstring-l', 'calf-r', 'jog-slow'].forEach(id => {
    f.setExercise(id, { instant: true, time: -8, ready: 6, period: id === 'jacks' ? 0.6 : 4 });
    const ys = [];
    for (let t = -3.9; t < 0; t += 0.2) { f.setTime(t); f._computePose(); ys.push(f.cur[4 * 3 + 1]); } // left shoulder, screen y
    assert.ok(f.ex._wait.on, `${id} waits`);
    const lift = Math.max(...ys) - Math.min(...ys);
    assert.ok(lift > 0.1 && lift < 3, `${id}: the shoulders rise a little while waiting (${lift.toFixed(2)} px)`);
  });
  assert.equal(F._dev.ikClamps(), 0);
  f.destroy();
});

test('an eased setTime keeps the pose shown continuous and the clock exact', () => {
  const F = load();
  const f = F.create(fakeCanvas(), { exercise: 'squat' });
  f.setExercise('squat', { instant: true, time: 1, period: 2 });
  f._computePose();
  const before = Array.from(f.cur);
  f.setTime(1.1, 0.12);
  assert.equal(f.getTime(), 1.1, 'the clock moves at once');
  f._computePose();
  before.forEach((v, i) => assert.ok(Math.abs(v - f.cur[i]) < 1e-3, 'no pop: the pose shown has not moved yet'));
  f._update(0.3); // the catch-up is over
  const shown = Array.from(f.cur);
  f.setExercise('squat', { instant: true, time: 1.4, period: 2 });
  f._computePose();
  shown.forEach((v, i) => assert.ok(Math.abs(v - f.cur[i]) < 1e-3, 'then exactly on the new clock'));
  f.destroy();
});
