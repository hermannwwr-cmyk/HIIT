/*
 * Workout model: exercise catalogue, intensity levels, random full-body
 * selection and the interval timeline. Pure logic, no DOM, so it can be
 * unit-tested in Node (see tests/workout.test.js).
 */
(function (root) {
  'use strict';

  var GROUPS = {
    upper: { id: 'upper', label: 'Upper body' },
    abs: { id: 'abs', label: 'Abs' },
    legs: { id: 'legs', label: 'Legs' }
  };
  var GROUP_ORDER = ['upper', 'abs', 'legs'];

  var EXERCISES = [
    { id: 'pushup', name: 'Push Ups', group: 'upper', muscles: 'Chest · Shoulders · Triceps',
      cue: 'Body in one straight line. Chest to the floor, then press up hard.' },
    { id: 'crunch', name: 'Crunches', group: 'abs', muscles: 'Upper abs',
      cue: 'Curl your shoulders off the floor. Breathe out on the way up.' },
    { id: 'legraise', name: 'Leg Raises', group: 'abs', muscles: 'Lower abs · Hip flexors',
      cue: 'Lower back stays down. Lower slowly, heels just above the floor.' },
    { id: 'squat', name: 'Squats', group: 'legs', muscles: 'Quads · Glutes · Hamstrings',
      cue: 'Hips back, chest up. Thighs to parallel, drive through the heels.' },
    { id: 'lunge', name: 'Lunges', group: 'legs', muscles: 'Quads · Glutes',
      cue: 'Long step, both knees to 90°. Alternate legs every rep.' },
    { id: 'flutter', name: 'Flutter Kicks', group: 'abs', muscles: 'Lower abs · Hip flexors',
      cue: 'Legs straight and low. Small fast kicks, lower back pressed down.' },
    { id: 'twist', name: 'Russian Twists', group: 'abs', muscles: 'Obliques',
      cue: 'Lean back, feet up. Rotate from the ribs and tap each side.' }
  ];

  var JACKS = { id: 'jacks', name: 'Jumping Jacks', group: 'cardio', muscles: 'Full body · Cardio',
    cue: 'Stay light on your toes. Arms all the way overhead.' };
  var REST = { id: 'rest', name: 'Rest', group: 'rest', muscles: 'Recover',
    cue: 'Breathe deep. Shake out your arms and legs.' };

  var LEVELS = {
    easy: { id: 'easy', name: 'Easy', work: 30, recover: 30, recoverType: 'rest', sets: 3,
      blurb: '30s exercise · 30s rest · 3 sets' },
    medium: { id: 'medium', name: 'Medium', work: 30, recover: 30, recoverType: 'jacks', sets: 2,
      blurb: '30s exercise · 30s jumping jacks · 2 sets' }
  };

  var MIN_EXERCISES = GROUP_ORDER.length; // one per group
  var MAX_EXERCISES = EXERCISES.length;
  var DEFAULT_COUNT = 5;
  var PREP_SECONDS = 10;

  var BY_ID = {};
  EXERCISES.forEach(function (e) { BY_ID[e.id] = e; });
  BY_ID.jacks = JACKS;
  BY_ID.rest = REST;

  function get(id) { return BY_ID[id] || null; }

  function sanitize(ids) {
    var seen = {};
    return (ids || []).filter(function (id) {
      var ex = BY_ID[id];
      if (!ex || ex.group === 'cardio' || ex.group === 'rest' || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  /** Which muscle groups a selection hits. */
  function coverage(ids) {
    var c = { upper: false, abs: false, legs: false };
    sanitize(ids).forEach(function (id) { c[BY_ID[id].group] = true; });
    var missing = GROUP_ORDER.filter(function (g) { return !c[g]; });
    return { upper: c.upper, abs: c.abs, legs: c.legs, missing: missing, ok: missing.length === 0 };
  }

  /** Is this a workout we can start? Returns { ok, reason }. */
  function validate(ids) {
    var list = sanitize(ids);
    var cov = coverage(list);
    if (list.length < MIN_EXERCISES) {
      return { ok: false, reason: 'Pick at least ' + MIN_EXERCISES + ' exercises.' , coverage: cov };
    }
    if (!cov.ok) {
      var names = cov.missing.map(function (g) { return GROUPS[g].label.toLowerCase(); });
      return { ok: false, reason: 'Add ' + joinWords(names) + ' to cover the full body.', coverage: cov };
    }
    return { ok: true, reason: '', coverage: cov };
  }

  function joinWords(words) {
    if (words.length <= 1) return words.join('');
    return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function clampCount(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = DEFAULT_COUNT;
    return Math.max(MIN_EXERCISES, Math.min(MAX_EXERCISES, n));
  }

  /**
   * Count of back-to-back exercises that hit the same group. When the
   * workout loops for several sets, the last → first transition counts too.
   */
  function adjacencyScore(ids, wrap) {
    var s = 0;
    for (var i = 1; i < ids.length; i++) {
      if (BY_ID[ids[i]].group === BY_ID[ids[i - 1]].group) s++;
    }
    if (wrap && ids.length > 2 && BY_ID[ids[0]].group === BY_ID[ids[ids.length - 1]].group) s++;
    return s;
  }

  /** Random order that spreads muscle groups out as much as possible. */
  function arrange(ids, rng, wrap) {
    rng = rng || Math.random;
    var best = null, bestScore = Infinity;
    for (var k = 0; k < 160; k++) {
      var cand = shuffle(ids, rng);
      var sc = adjacencyScore(cand, wrap !== false);
      if (sc < bestScore) { best = cand; bestScore = sc; if (sc === 0) break; }
    }
    return best || ids.slice();
  }

  /** N random exercises that always include upper body, abs and legs. */
  function randomPick(count, rng) {
    rng = rng || Math.random;
    var n = clampCount(count);
    var picked = GROUP_ORDER.map(function (g) {
      var pool = EXERCISES.filter(function (e) { return e.group === g; });
      return pool[Math.floor(rng() * pool.length)].id;
    });
    var rest = shuffle(EXERCISES.filter(function (e) { return picked.indexOf(e.id) < 0; }), rng);
    while (picked.length < n && rest.length) picked.push(rest.shift().id);
    return arrange(picked, rng);
  }

  /**
   * Grow or shrink a selection to `count`, keeping the user's existing
   * choices and full-body coverage wherever possible.
   */
  function resize(ids, count, rng) {
    rng = rng || Math.random;
    var list = sanitize(ids);
    var n = clampCount(count);
    while (list.length < n) {
      var cov = coverage(list);
      var pool = EXERCISES.filter(function (e) {
        return list.indexOf(e.id) < 0 && (cov.ok || cov.missing.indexOf(e.group) >= 0);
      });
      if (!pool.length) pool = EXERCISES.filter(function (e) { return list.indexOf(e.id) < 0; });
      if (!pool.length) break;
      list.push(pool[Math.floor(rng() * pool.length)].id);
    }
    while (list.length > n) {
      // Prefer removing from the group with the most picks, newest first.
      var counts = {};
      list.forEach(function (id) { var g = BY_ID[id].group; counts[g] = (counts[g] || 0) + 1; });
      var victim = -1, most = 0;
      for (var i = list.length - 1; i >= 0; i--) {
        var g = BY_ID[list[i]].group;
        if (counts[g] > most) { most = counts[g]; victim = i; }
      }
      list.splice(victim, 1);
    }
    return list;
  }

  /**
   * Expand a workout into timed segments.
   *   prep → [work, recover] × exercises × sets
   * Easy drops the final rest (nothing to recover for). Medium keeps the
   * final jumping jacks, because they are part of the work.
   */
  function buildTimeline(ids, levelId, opts) {
    opts = opts || {};
    var level = LEVELS[levelId] || LEVELS.easy;
    var list = sanitize(ids);
    var prep = opts.prep == null ? PREP_SECONDS : opts.prep;
    var segs = [];
    var t = 0;
    function push(seg) { seg.start = t; t += seg.duration; seg.end = t; seg.index = segs.length; segs.push(seg); }

    if (prep > 0 && list.length) {
      push({ type: 'prep', duration: prep, exercise: list[0], set: 1, slot: 0, next: list[0] });
    }
    for (var s = 1; s <= level.sets; s++) {
      for (var i = 0; i < list.length; i++) {
        var isLastOverall = s === level.sets && i === list.length - 1;
        var nextId = i < list.length - 1 ? list[i + 1] : (s < level.sets ? list[0] : null);
        push({ type: 'work', duration: level.work, exercise: list[i], set: s, slot: i, next: nextId });
        if (level.recoverType === 'rest' && isLastOverall) continue;
        push({
          type: level.recoverType, duration: level.recover,
          exercise: level.recoverType === 'jacks' ? 'jacks' : 'rest',
          set: s, slot: i, next: nextId,
          setBreak: i === list.length - 1 && s < level.sets
        });
      }
    }
    return {
      level: level,
      exercises: list,
      segments: segs,
      total: t,
      workSeconds: segs.reduce(function (a, g) { return a + (g.type === 'work' || g.type === 'jacks' ? g.duration : 0); }, 0),
      intervals: segs.filter(function (g) { return g.type === 'work'; }).length
    };
  }

  /** Segment index at time t (seconds into the session). */
  function segmentAt(timeline, t) {
    var segs = timeline.segments;
    if (!segs.length) return -1;
    if (t <= 0) return 0;
    if (t >= timeline.total) return segs.length; // finished
    var lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (segs[mid].start <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var api = {
    GROUPS: GROUPS, GROUP_ORDER: GROUP_ORDER, EXERCISES: EXERCISES, JACKS: JACKS, REST: REST,
    LEVELS: LEVELS, MIN_EXERCISES: MIN_EXERCISES, MAX_EXERCISES: MAX_EXERCISES,
    DEFAULT_COUNT: DEFAULT_COUNT, PREP_SECONDS: PREP_SECONDS,
    get: get, sanitize: sanitize, coverage: coverage, validate: validate,
    randomPick: randomPick, resize: resize, arrange: arrange, adjacencyScore: adjacencyScore,
    buildTimeline: buildTimeline, segmentAt: segmentAt, formatTime: formatTime, clampCount: clampCount
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HIIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
