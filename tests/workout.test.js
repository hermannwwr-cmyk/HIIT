// Run with: npm test   (or: node --test tests/*.test.js)
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

test('catalogue: 8 exercises grouped upper body, abs, legs', () => {
  assert.deepEqual(H.EXERCISES.map(e => e.id),
    ['pushup', 'shouldertap', 'crunch', 'legraise', 'flutter', 'twist', 'squat', 'lunge']);
  // listed upper body, then abs, then legs
  assert.deepEqual([...new Set(H.EXERCISES.map(e => e.group))], ['upper', 'abs', 'legs']);
  assert.equal(H.get('shouldertap').group, 'upper');
  assert.equal(H.MAX_EXERCISES, 8);
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
  assert.equal(H.randomPick(99).length, 8);
});

test('random picks vary', () => {
  const seen = new Set();
  for (let s = 1; s <= 200; s++) seen.add(H.randomPick(5, seeded(s)).join(','));
  assert.ok(seen.size > 30, `only ${seen.size} distinct workouts`);
});

const GI = id => H.GROUP_ORDER.indexOf(H.get(id).group);
const inGroupOrder = ids => ids.every((id, i) => i === 0 || GI(ids[i - 1]) <= GI(id));

test('workouts run upper body, then abs, then legs', () => {
  for (let n = H.MIN_EXERCISES; n <= H.MAX_EXERCISES; n++) {
    for (let s = 1; s <= 300; s++) {
      const ids = H.randomPick(n, seeded(s * 17 + n));
      assert.ok(inGroupOrder(ids), ids.join(','));
    }
  }
  // any selection is run in group order; within a group the picked order is kept
  assert.deepEqual(H.order(['squat', 'twist', 'pushup', 'crunch', 'lunge']), ['pushup', 'twist', 'crunch', 'squat', 'lunge']);
  const tl = H.buildTimeline(['lunge', 'flutter', 'shouldertap', 'squat', 'crunch'], 'easy');
  assert.deepEqual(tl.exercises, ['shouldertap', 'flutter', 'crunch', 'lunge', 'squat']);
  assert.deepEqual(tl.segments.filter(s => s.type === 'work' && s.set === 1).map(s => s.exercise), tl.exercises);
});

test('random picks vary their order within a group', () => {
  const seen = new Set();
  for (let s = 1; s <= 200; s++) {
    const abs = H.randomPick(8, seeded(s)).filter(id => H.get(id).group === 'abs');
    seen.add(abs.join(','));
  }
  assert.ok(seen.size > 10, `only ${seen.size} ab orders`);
});

test('validate rejects workouts that miss a muscle group', () => {
  assert.equal(H.validate(['crunch', 'squat', 'lunge']).ok, false);
  assert.match(H.validate(['crunch', 'squat', 'lunge']).reason, /upper body/);
  assert.match(H.validate(['pushup', 'crunch', 'flutter']).reason, /legs/);
  assert.match(H.validate(['pushup', 'squat']).reason, /at least 3/);
  assert.equal(H.validate(['pushup', 'twist', 'lunge']).ok, true);
  assert.equal(H.validate(['pushup', 'twist', 'lunge', 'bogus', 'twist']).ok, true);
});

test('growing or shrinking the count keeps picks in group order', () => {
  for (let s = 1; s <= 200; s++) {
    const r = seeded(s);
    const start = H.randomPick(3, r);
    const grown = H.resize(start, 6, r);
    assert.deepEqual(grown.filter(id => start.includes(id)), start);
    assert.ok(inGroupOrder(grown), grown.join(','));
    const shrunk = H.resize(grown, 4, r);
    assert.ok(inGroupOrder(shrunk) && H.coverage(shrunk).ok, shrunk.join(','));
  }
});

test('resize keeps existing picks and restores coverage', () => {
  const r = seeded(7);
  const grown = H.resize(['crunch'], 3, r);
  assert.ok(grown.includes('crunch'));
  assert.equal(H.get(grown[0]).group, 'upper');
  assert.ok(H.coverage(grown).ok, grown.join(','));
  const shrunk = H.resize(['pushup', 'crunch', 'legraise', 'flutter', 'squat'], 3, r);
  assert.equal(shrunk.length, 3);
  assert.ok(H.coverage(shrunk).ok, shrunk.join(','));
});

test('easy timeline: 30s work / 30s rest, 3 sets, 5 min between sets, no trailing rest', () => {
  const ids = ['pushup', 'crunch', 'twist', 'squat', 'lunge'];
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
    assert.equal(before.type, 'work'); assert.equal(before.exercise, 'lunge');
    assert.equal(after.type, 'work'); assert.equal(after.exercise, 'pushup'); assert.equal(after.set, b.set + 1);
  }
  assert.equal(tl.total, 10 + 15 * 30 + 12 * 30 + 2 * 300);
  assert.equal(H.formatTime(tl.total), '23:40');
  assert.equal(tl.intervals, 15);
});

test('medium timeline: 30s work / 30s jumping jacks, 2 sets, 5 min between sets', () => {
  const ids = ['pushup', 'crunch', 'twist', 'squat', 'lunge'];
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

test('random picks use both upper-body exercises', () => {
  const uppers = new Set();
  for (let s = 1; s <= 300; s++) H.randomPick(5, seeded(s)).forEach(id => { if (H.get(id).group === 'upper') uppers.add(id); });
  assert.deepEqual([...uppers].sort(), ['pushup', 'shouldertap']);
});

test('warm-up: jog slow/quick ×2, then 5 counts of 4 for each move, then get ready', () => {
  const ids = ['pushup', 'crunch', 'squat'];
  const tl = H.buildTimeline(ids, 'easy', { warmup: true });
  const wu = tl.segments.filter(s => s.type === 'warmup');
  assert.deepEqual(wu.map(s => s.exercise + (s.pace ? ':' + s.pace : '') + (s.side ? ':' + s.side : '')), [
    'jog:slow', 'jog:quick', 'jog:slow', 'jog:quick', 'jacks', 'pecstretch', 'squat',
    'hamstring:left', 'hamstring:right', 'calf:left', 'calf:right']);
  wu.slice(0, 4).forEach(s => assert.equal(s.duration, 10));
  wu.slice(4).forEach(s => { assert.equal(s.counts, 5); assert.equal(s.beats, 4); assert.equal(s.duration, s.counts * s.beats * s.beat); });
  // warm-up comes first, then the usual get-ready, then the first exercise
  assert.equal(tl.segments[0].type, 'warmup');
  assert.equal(tl.segments[wu.length].type, 'prep');
  assert.equal(tl.segments[wu.length + 1].type, 'work');
  assert.equal(tl.warmupEnd, H.WARMUP_SECONDS);
  assert.equal(tl.warmupSeconds, H.WARMUP_SECONDS);
  assert.equal(H.formatTime(H.WARMUP_SECONDS), '2:52');
  const plain = H.buildTimeline(ids, 'easy');
  assert.equal(tl.total, plain.total + H.WARMUP_SECONDS);
  assert.equal(tl.intervals, plain.intervals);
  assert.equal(tl.workSeconds, plain.workSeconds, 'warm-up is not counted as exercise time');
});

test('warm-up moves have trainer content and are not selectable workout exercises', () => {
  for (const k of ['jog', 'pecstretch', 'hamstring', 'calf']) {
    const m = H.WARMUP_MOVES[k];
    assert.equal(m.steps.length, 4, k);
    assert.ok(m.cue && m.breathe && m.cues.length >= 3, k);
  }
  assert.deepEqual(H.sanitize(['jog', 'pecstretch', 'pushup']), ['pushup']);
});
