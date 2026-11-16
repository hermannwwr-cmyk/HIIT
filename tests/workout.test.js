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

test('easy timeline: 30s work / 30s rest, 3 sets, no trailing rest', () => {
  const ids = ['pushup', 'crunch', 'squat', 'lunge', 'twist'];
  const tl = H.buildTimeline(ids, 'easy');
  const segs = tl.segments;
  assert.equal(segs[0].type, 'prep');
  const work = segs.filter(s => s.type === 'work');
  assert.equal(work.length, 15);
  assert.ok(work.every(s => s.duration === 30));
  assert.deepEqual(work.map(s => s.exercise), [...ids, ...ids, ...ids]);
  const rest = segs.filter(s => s.type === 'rest');
  assert.equal(rest.length, 14);
  assert.ok(rest.every(s => s.duration === 30));
  assert.equal(segs.filter(s => s.type === 'jacks').length, 0);
  assert.equal(segs[segs.length - 1].type, 'work');
  // alternate work / rest after prep
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].type, i % 2 ? 'work' : 'rest');
  assert.equal(tl.total, 10 + 15 * 30 + 14 * 30);
  assert.equal(tl.intervals, 15);
});

test('medium timeline: 30s work / 30s jumping jacks, 2 sets', () => {
  const ids = ['pushup', 'crunch', 'squat', 'lunge', 'twist'];
  const tl = H.buildTimeline(ids, 'medium');
  const segs = tl.segments.slice(1);
  assert.equal(segs.length, 20);
  for (let i = 0; i < segs.length; i++) {
    assert.equal(segs[i].type, i % 2 ? 'jacks' : 'work');
    assert.equal(segs[i].duration, 30);
  }
  assert.equal(segs.filter(s => s.type === 'rest').length, 0);
  assert.deepEqual(segs.filter(s => s.type === 'work').map(s => s.exercise), [...ids, ...ids]);
  assert.equal(tl.total, 10 + 20 * 30);
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
  const breaks = tl.segments.filter(s => s.setBreak);
  assert.equal(breaks.length, 1);
});

test('formatTime', () => {
  assert.equal(H.formatTime(0), '0:00');
  assert.equal(H.formatTime(59.6), '1:00');
  assert.equal(H.formatTime(870), '14:30');
});
