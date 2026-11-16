// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/workout.js');

function seeded(seed) {
  // mulberry32
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('catalogue has the 7 requested exercises in 3 groups', () => {
  assert.deepEqual(H.EXERCISES.map(e => e.id),
    ['pushup', 'crunch', 'legraise', 'squat', 'lunge', 'flutter', 'twist']);
  for (const g of ['upper', 'abs', 'legs']) {
    assert.ok(H.EXERCISES.some(e => e.group === g), g);
  }
});

test('default random workout: 5 unique exercises covering the full body', () => {
  for (let s = 1; s <= 2000; s++) {
    const ids = H.randomPick(H.DEFAULT_COUNT, seeded(s));
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    assert.ok(H.coverage(ids).ok, ids.join(','));
    assert.ok(H.validate(ids).ok);
  }
});

test('random pick works for every allowed count and clamps the rest', () => {
  for (let n = H.MIN_EXERCISES; n <= H.MAX_EXERCISES; n++) {
    for (let s = 1; s <= 300; s++) {
      const ids = H.randomPick(n, seeded(s * 31 + n));
      assert.equal(ids.length, n);
      assert.ok(H.coverage(ids).ok);
    }
  }
  assert.equal(H.randomPick(1).length, 3);
  assert.equal(H.randomPick(99).length, 7);
});

test('random picks vary', () => {
  const seen = new Set();
  for (let s = 1; s <= 200; s++) seen.add(H.randomPick(5, seeded(s)).join(','));
  assert.ok(seen.size > 30, `only ${seen.size} distinct workouts`);
});

test('arrange spreads muscle groups when it can', () => {
  const ids = ['crunch', 'legraise', 'pushup', 'squat', 'lunge'];
  for (let s = 1; s <= 100; s++) {
    const a = H.arrange(ids, seeded(s));
    assert.deepEqual([...a].sort(), [...ids].sort());
    assert.equal(H.adjacencyScore(a, true), 0, a.join(','));
  }
});

test('validate rejects workouts that miss a muscle group', () => {
  assert.equal(H.validate(['crunch', 'squat', 'lunge']).ok, false);
  assert.match(H.validate(['crunch', 'squat', 'lunge']).reason, /upper body/);
  assert.match(H.validate(['pushup', 'crunch', 'flutter']).reason, /legs/);
  assert.match(H.validate(['pushup', 'squat']).reason, /at least 3/);
  assert.equal(H.validate(['pushup', 'twist', 'lunge']).ok, true);
  assert.equal(H.validate(['pushup', 'twist', 'lunge', 'bogus', 'twist']).ok, true);
});

test('resize keeps existing picks and restores coverage', () => {
  const r = seeded(7);
  const grown = H.resize(['crunch'], 3, r);
  assert.equal(grown[0], 'crunch');
  assert.ok(H.coverage(grown).ok, grown.join(','));
  const shrunk = H.resize(['pushup', 'crunch', 'legraise', 'flutter', 'squat'], 3, r);
  assert.equal(shrunk.length, 3);
  assert.ok(H.coverage(shrunk).ok, shrunk.join(','));
});

test('easy timeline: 30s work / 30s rest, 3 sets, 5 min between sets, no trailing rest', () => {
  const ids = ['pushup', 'crunch', 'squat', 'lunge', 'twist'];
  const tl = H.buildTimeline(ids, 'easy');
  const segs = tl.segments;
  assert.equal(segs[0].type, 'prep');
  const work = segs.filter(s => s.type === 'work');
  assert.equal(work.length, 15);
  assert.ok(work.every(s => s.duration === 30));
  assert.deepEqual(work.map(s => s.exercise), [...ids, ...ids, ...ids]);
  const rest = segs.filter(s => s.type === 'rest');
  assert.equal(rest.length, 12); // 4 per set
  assert.ok(rest.every(s => s.duration === 30));
  const breaks = segs.filter(s => s.type === 'setrest');
  assert.equal(breaks.length, 2);
  assert.ok(breaks.every(s => s.duration === 300));
  assert.equal(segs.filter(s => s.type === 'jacks').length, 0);
  assert.equal(segs[segs.length - 1].type, 'work');
  // each set break sits right after the last exercise of a set
  for (const b of breaks) {
    const before = segs[b.index - 1], after = segs[b.index + 1];
    assert.equal(before.type, 'work'); assert.equal(before.exercise, 'twist');
    assert.equal(after.type, 'work'); assert.equal(after.exercise, 'pushup'); assert.equal(after.set, b.set + 1);
  }
  assert.equal(tl.total, 10 + 15 * 30 + 12 * 30 + 2 * 300);
  assert.equal(H.formatTime(tl.total), '23:40');
  assert.equal(tl.intervals, 15);
});

test('medium timeline: 30s work / 30s jumping jacks, 2 sets, 5 min between sets', () => {
  const ids = ['pushup', 'crunch', 'squat', 'lunge', 'twist'];
  const tl = H.buildTimeline(ids, 'medium');
  const types = tl.segments.slice(1).map(s => s.type);
  const set = ['work', 'jacks', 'work', 'jacks', 'work', 'jacks', 'work', 'jacks', 'work', 'jacks'];
  assert.deepEqual(types, [...set, 'setrest', ...set]);
  assert.ok(tl.segments.filter(s => s.type !== 'prep' && s.type !== 'setrest').every(s => s.duration === 30));
  assert.equal(tl.segments.filter(s => s.type === 'rest').length, 0);
  assert.deepEqual(tl.segments.filter(s => s.type === 'work').map(s => s.exercise), [...ids, ...ids]);
  assert.equal(tl.total, 10 + 20 * 30 + 300);
  assert.equal(H.formatTime(tl.total), '15:10');
});

test('set break can be turned off', () => {
  const tl = H.buildTimeline(['pushup', 'crunch', 'squat'], 'easy', { setRest: 0 });
  assert.equal(tl.segments.filter(s => s.type === 'setrest').length, 0);
  assert.equal(tl.segments.filter(s => s.type === 'rest').length, 8); // 2 within + 1 between, ×3 sets, minus the last
});

test('nextWorkIndex skips recovery and set breaks', () => {
  const tl = H.buildTimeline(['pushup', 'crunch', 'squat'], 'medium');
  const brk = tl.segments.find(s => s.type === 'setrest');
  const nx = H.nextWorkIndex(tl, brk.index - 1);
  assert.equal(tl.segments[nx].exercise, 'pushup');
  assert.equal(tl.segments[nx].set, 2);
  assert.equal(H.nextWorkIndex(tl, tl.segments.length - 1), -1);
});

test('every exercise has trainer content', () => {
  for (const e of [...H.EXERCISES, H.JACKS]) {
    assert.equal(e.steps.length, 4, e.id);
    assert.ok(e.cues.length >= 3, e.id);
    assert.ok(e.breathe && e.easier && e.harder && e.mistakes.length, e.id);
  }
});

test('segments are contiguous and segmentAt finds them', () => {
  const tl = H.buildTimeline(['pushup', 'crunch', 'squat'], 'easy');
  let t = 0;
  for (const s of tl.segments) { assert.equal(s.start, t); t = s.end; }
  assert.equal(t, tl.total);
  assert.equal(H.segmentAt(tl, 0), 0);
  assert.equal(H.segmentAt(tl, 9.99), 0);
  assert.equal(H.segmentAt(tl, 10), 1);
  assert.equal(H.segmentAt(tl, 39.5), 1);
  assert.equal(H.segmentAt(tl, 40), 2);
  assert.equal(H.segmentAt(tl, tl.total), tl.segments.length);
});

test('next-up pointers and set numbers', () => {
  const tl = H.buildTimeline(['pushup', 'crunch', 'squat'], 'medium');
  const work = tl.segments.filter(s => s.type === 'work');
  assert.deepEqual(work.map(s => s.set), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(work.map(s => s.next), ['crunch', 'squat', 'pushup', 'crunch', 'squat', null]);
  const breaks = tl.segments.filter(s => s.type === 'setrest');
  assert.equal(breaks.length, 1);
  assert.equal(tl.segments[breaks[0].index - 1].type, 'jacks');
});

test('formatTime', () => {
  assert.equal(H.formatTime(0), '0:00');
  assert.equal(H.formatTime(59.6), '1:00');
  assert.equal(H.formatTime(870), '14:30');
});
