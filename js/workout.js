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

  // Coaching content: steps are the order you perform the movement in;
  // cues are short lines the trainer repeats mid-interval.
  var EXERCISES = [
    { id: 'pushup', name: 'Push Ups', group: 'upper', muscles: 'Chest · Shoulders · Triceps',
      cue: 'Body in one straight line. Chest to the floor, then press up hard.',
      steps: ['Hands just wider than your shoulders, body straight from head to heels.',
        'Brace your core and squeeze your glutes.',
        'Lower until your chest is a fist above the floor, elbows at about 45°.',
        'Press the floor away until your arms are straight.'],
      cues: ['Keep your hips in line with your shoulders.', 'Elbows at 45 degrees, not flared out.', 'Full range. Chest all the way down.'],
      breathe: 'Breathe in on the way down, out as you push up.',
      mistakes: ['Hips sagging or piking up', 'Elbows flared straight out', 'Half reps'],
      easier: 'Knees on the floor, or hands on a bench or sofa.',
      harder: 'Lower for 3 slow seconds, or raise your feet.' },
    { id: 'shouldertap', name: 'Shoulder Taps', group: 'upper', muscles: 'Shoulders · Chest · Core',
      cue: 'Plank on straight arms. Tap the opposite shoulder, hips stay still.',
      steps: ['Start in a high plank, hands under your shoulders, feet hip-width apart.',
        'Brace your core and squeeze your glutes so your body is one straight line.',
        'Lift one hand and tap the opposite shoulder.',
        'Put the hand back down and switch sides. Keep your hips level.'],
      cues: ['Hips stay level, no rocking.', 'Push the floor away with the supporting arm.', 'Slow, controlled taps.'],
      breathe: 'Breathe steadily, out on each tap.',
      mistakes: ['Hips swaying side to side', 'Lower back sagging', 'Rushing the taps'],
      easier: 'Do them from your knees, or set your feet wider.',
      harder: 'Bring your feet together, or add a push up after every 4 taps.' },
    { id: 'crunch', name: 'Crunches', group: 'abs', muscles: 'Upper abs',
      cue: 'Curl your shoulders off the floor. Breathe out on the way up.',
      steps: ['Lie on your back, knees bent, feet flat and hip-width apart.',
        'Fingertips lightly at your temples, elbows wide.',
        'Curl your shoulder blades off the floor using your abs.',
        'Pause at the top, then lower with control.'],
      cues: ["Don't pull on your neck.", 'Breathe out as you curl up.', 'Slow on the way down.'],
      breathe: 'Breathe out as you curl up, in as you lower.',
      mistakes: ['Yanking your head forward', 'Swinging with momentum', 'Lower back lifting off the floor'],
      easier: 'Cross your arms on your chest and use a smaller range.',
      harder: 'Hold one second at the top, or lift your feet off the floor.' },
    { id: 'legraise', name: 'Leg Raises', group: 'abs', muscles: 'Lower abs · Hip flexors',
      cue: 'Lower back stays down. Lower slowly, heels just above the floor.',
      steps: ['Lie flat, legs straight and together, hands under your hips or by your sides.',
        'Press your lower back into the floor.',
        'Raise your straight legs until they point at the ceiling.',
        'Lower slowly until your heels hover just above the floor.'],
      cues: ['Lower back pressed into the floor.', 'Control the way down.', "Don't let your heels touch."],
      breathe: 'Breathe out as you lift, in as you lower.',
      mistakes: ['Arching your lower back', 'Dropping your legs fast', 'Bending your knees to cheat'],
      easier: 'Bend your knees to 90° as you lift.',
      harder: 'Pause for 2 seconds with your heels hovering.' },
    { id: 'flutter', name: 'Flutter Kicks', group: 'abs', muscles: 'Lower abs · Hip flexors',
      cue: 'Legs straight and low. Small fast kicks, lower back pressed down.',
      steps: ['Lie on your back with your hands under your hips.',
        'Lift your straight legs a few inches off the floor.',
        'Kick up and down in small, fast, alternating movements.',
        'Keep your lower back pressed down the whole time.'],
      cues: ['Small, quick kicks.', 'Keep your legs straight.', 'Lower back stays down.'],
      breathe: "Short, steady breaths. Don't hold your breath.",
      mistakes: ['Arching your lower back', 'Big, slow kicks', 'Holding your breath'],
      easier: 'Kick a little higher, or bend your knees slightly.',
      harder: 'Lift your head and shoulders off the floor.' },
    { id: 'twist', name: 'Russian Twists', group: 'abs', muscles: 'Obliques',
      cue: 'Lean back, feet up. Rotate from the ribs and tap each side.',
      steps: ['Sit with knees bent and lean back about 45°, back straight.',
        'Lift your feet off the floor, or keep your heels down.',
        'Clasp your hands and rotate your torso to one side.',
        'Rotate to the other side. Each side counts as one rep.'],
      cues: ['Rotate from your ribs, not just your arms.', 'Chest up, back straight.', 'Touch the floor on each side.'],
      breathe: 'Breathe out on every twist.',
      mistakes: ['Rounding your back', 'Only moving your arms', 'Rushing the reps'],
      easier: 'Keep your heels on the floor.',
      harder: 'Hold a water bottle or a weight.' },
    { id: 'squat', name: 'Squats', group: 'legs', muscles: 'Quads · Glutes · Hamstrings',
      cue: 'Hips back, chest up. Thighs to parallel, drive through the heels.',
      steps: ['Feet shoulder-width apart, toes turned out slightly.',
        'Push your hips back and bend your knees, chest up, arms forward.',
        'Lower until your thighs are parallel to the floor.',
        'Drive through your heels to stand tall and squeeze your glutes.'],
      cues: ['Chest up, back flat.', 'Knees track over your toes.', 'Weight in your heels.'],
      breathe: 'Breathe in on the way down, out as you stand.',
      mistakes: ['Knees caving inward', 'Heels lifting off the floor', 'Rounding your back'],
      easier: 'Squat down to a chair, or go less deep.',
      harder: 'Add a jump at the top, or pause at the bottom.' },
    { id: 'lunge', name: 'Lunges', group: 'legs', muscles: 'Quads · Glutes',
      cue: 'Long step, both knees to 90°. Alternate legs every rep.',
      steps: ['Stand tall, feet hip-width apart.',
        'Take a long step forward.',
        'Lower until both knees bend to about 90°, back knee just above the floor.',
        'Push through your front heel to step back, then switch legs.'],
      cues: ['Torso upright.', 'Front knee stays over your ankle.', 'Alternate legs every rep.'],
      breathe: 'Breathe in as you lower, out as you push back.',
      mistakes: ['Front knee shooting past your toes', 'Leaning forward', 'Steps that are too short'],
      easier: 'Use a shorter range, or hold a wall for balance.',
      harder: 'Jump to switch legs.' }
  ];

  var JACKS = { id: 'jacks', name: 'Jumping Jacks', group: 'cardio', muscles: 'Full body · Cardio',
    cue: 'Stay light on your toes. Arms all the way overhead.',
    steps: ['Stand tall, feet together, arms by your sides.',
      'Jump your feet out wide as you swing your arms overhead.',
      'Jump back to the start.',
      'Stay light on the balls of your feet and keep a steady rhythm.'],
    cues: ['Light on your toes.', 'Arms all the way up.', 'Keep the pace up.'],
    breathe: 'Breathe in a steady rhythm with your jumps.',
    mistakes: ['Landing flat-footed', 'Half arm swings', 'Locking your knees'],
    easier: 'Step side to side instead of jumping.',
    harder: 'Go faster, or sink into a squat each time you land wide.' };
  var REST = { id: 'rest', name: 'Rest', group: 'rest', muscles: 'Recover',
    cue: 'Breathe deep. Shake out your arms and legs.',
    steps: [], cues: [], breathe: 'In through your nose, out through your mouth.', mistakes: [], easier: '', harder: '' };

  // ---- Warm-up (SAF-style): timed jogging, then moves done in "5 counts of 4" ----
  var WARMUP_MOVES = {
    jog: { id: 'jog', name: 'Jog on the Spot', group: 'warmup', muscles: 'Heart rate · Legs',
      cue: 'Light on the balls of your feet, arms swinging from the shoulders.',
      steps: ['Stand tall, feet hip-width apart.', 'Jog on the spot, landing softly on the balls of your feet.',
        'Swing your arms with elbows bent at about 90°.', 'Slow jog: easy knee lift. Quick jog: drive the knees up and speed up.'],
      cues: ['Land softly.', 'Relax your shoulders.', 'Breathe easily.'],
      breathe: 'Breathe in rhythm with your steps.',
      mistakes: ['Landing on your heels', 'Tense shoulders', 'Holding your breath'],
      easier: 'March on the spot instead of jogging.', harder: 'High knees on the quick jog.' },
    pecstretch: { id: 'pecstretch', name: 'Pectoral Stretch', group: 'warmup', muscles: 'Chest · Front shoulders',
      cue: 'Hands clasped behind you, chest up, squeeze your shoulder blades.',
      steps: ['Stand tall, feet shoulder-width apart.', 'Clasp your hands behind your lower back, arms straight.',
        'Squeeze your shoulder blades together and lift your chest.', 'Gently raise your hands a little, then lower on the count.'],
      cues: ['Chest up, chin level.', 'Squeeze the shoulder blades.', 'Gentle, no bouncing.'],
      breathe: 'Breathe slowly and deeply.',
      mistakes: ['Leaning forward', 'Shrugging your shoulders', 'Forcing the stretch'],
      easier: 'Hold a towel between your hands if they don\u2019t meet.', harder: 'Raise the clasped hands higher.' },
    hamstring: { id: 'hamstring', name: 'Hamstring Stretch', group: 'warmup', muscles: 'Back of the thigh',
      cue: 'Front heel down, toes up, hinge forward with a flat back.',
      steps: ['Step one foot forward, heel on the floor and toes pointing up.', 'Keep that knee straight and bend the back knee slightly.',
        'Hinge forward from your hips with a flat back, hands on the bent thigh.', 'Feel the stretch behind the straight leg. Switch sides when told.'],
      cues: ['Flat back, hinge at the hips.', 'Toes up on the front foot.', 'Ease in, don\u2019t bounce.'],
      breathe: 'Breathe out as you ease into the stretch.',
      mistakes: ['Rounding your back', 'Locking the back knee', 'Bouncing'],
      easier: 'Hinge less; keep the stretch mild.', harder: 'Hinge further while keeping your back flat.' },
    calf: { id: 'calf', name: 'Calf Stretch', group: 'warmup', muscles: 'Calves · Achilles',
      cue: 'Back leg straight, back heel pressed into the floor.',
      steps: ['Take a long step forward into a staggered stance.', 'Bend the front knee; keep the back leg straight.',
        'Press the back heel into the floor, toes pointing forward.', 'Lean forward gently until you feel the calf stretch. Switch sides when told.'],
      cues: ['Back heel down.', 'Toes pointing forward.', 'Hips square.'],
      breathe: 'Slow, steady breaths.',
      mistakes: ['Back heel lifting', 'Toes turned out', 'Bending the back knee'],
      easier: 'Shorten your stance.', harder: 'Lengthen your stance or lean further.' }
  };

  // The routine, in order. Timed steps have a duration; counted steps run
  // `counts` × `beats` beats of `beat` seconds (SAF "5 counts of 4").
  // lead: seconds of "get ready" before the move starts: time for the coach to
  // name it ("Next warm-up: squats. Chest up, sit back."), a breath, then a
  // spoken "5, 4, 3, 2, 1, begin", and only then the count. A leg switch
  // counts down from 3 (countdown: 3); jog pace changes run straight on. The
  // first lead fits "Let's warm up. First, jogging on the spot, nice and easy."
  // (the welcome is in the brief, before the warm-up starts).
  var WARMUP_STEPS = [
    { move: 'jog', pace: 'slow', duration: 10, lead: 10 },
    { move: 'jog', pace: 'quick', duration: 10 },
    { move: 'jog', pace: 'slow', duration: 10 },
    { move: 'jog', pace: 'quick', duration: 10 },
    { move: 'jacks', counts: 5, beats: 4, beat: 0.6, lead: 11 },
    { move: 'pecstretch', counts: 5, beats: 4, beat: 1, lead: 11 },
    { move: 'squat', counts: 5, beats: 4, beat: 1, lead: 11 },
    { move: 'hamstring', side: 'left', counts: 5, beats: 4, beat: 1, lead: 12 },
    { move: 'hamstring', side: 'right', counts: 5, beats: 4, beat: 1, lead: 7.5, countdown: 3 },
    { move: 'calf', side: 'left', counts: 5, beats: 4, beat: 1, lead: 12 },
    { move: 'calf', side: 'right', counts: 5, beats: 4, beat: 1, lead: 7.5, countdown: 3 }
  ];
  /** The moving part of a step (without its lead-in). */
  function warmupMoveDuration(st) { return st.duration || Math.round(st.counts * st.beats * st.beat * 1000) / 1000; }
  function warmupStepDuration(st) { return (st.lead || 0) + warmupMoveDuration(st); }
  var WARMUP_SECONDS = WARMUP_STEPS.reduce(function (a, st) { return a + warmupStepDuration(st); }, 0);

  /** Things the trainer says during the long break between sets. */
  var SET_BREAK_TIPS = [
    'Grab a drink of water.',
    'Walk around and keep your legs loose.',
    'Breathe in for 4 seconds, out for 6. Bring your heart rate down.',
    'Shake out your arms and roll your shoulders.',
    'Stretch your hip flexors and hamstrings gently.'
  ];

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
  var SET_REST_SECONDS = 300; // 5 minute break between sets

  var BY_ID = {};
  EXERCISES.forEach(function (e) { BY_ID[e.id] = e; });
  BY_ID.jacks = JACKS;
  BY_ID.rest = REST;
  Object.keys(WARMUP_MOVES).forEach(function (k) { BY_ID[k] = WARMUP_MOVES[k]; });

  function get(id) { return BY_ID[id] || null; }

  function sanitize(ids) {
    var seen = {};
    return (ids || []).filter(function (id) {
      var ex = BY_ID[id];
      if (!ex || ex.group === 'cardio' || ex.group === 'rest' || ex.group === 'warmup' || seen[id]) return false;
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
   * Workouts run top to bottom: upper body, then abs, then legs. Within a
   * group the existing order is kept (the order the user picked them in).
   */
  function order(ids) {
    return sanitize(ids)
      .map(function (id, i) { return { id: id, g: GROUP_ORDER.indexOf(BY_ID[id].group), i: i }; })
      .sort(function (a, b) { return a.g - b.g || a.i - b.i; })
      .map(function (x) { return x.id; });
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
    return order(shuffle(picked, rng));
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
    return order(list);
  }

  /**
   * Expand a workout into timed segments (exercises run upper body → abs → legs):
   *   prep → per set: [work, recover] × exercises → 5 min set break → next set
   * Easy recovers with 30s rest; the set break replaces the rest after the
   * last exercise of a set, and the very last rest is dropped. Medium follows
   * every exercise with 30s of jumping jacks (including the last one), then
   * takes the set break.
   */
  function buildTimeline(ids, levelId, opts) {
    opts = opts || {};
    var level = LEVELS[levelId] || LEVELS.easy;
    var list = order(ids);
    var prep = opts.prep == null ? PREP_SECONDS : opts.prep;
    var setRest = opts.setRest == null ? SET_REST_SECONDS : opts.setRest;
    var segs = [];
    var t = 0;
    function push(seg) { seg.start = t; t += seg.duration; seg.end = t; seg.index = segs.length; segs.push(seg); }

    if (opts.warmup && list.length) {
      WARMUP_STEPS.forEach(function (st, i) {
        push({ type: 'warmup', duration: warmupStepDuration(st), lead: st.lead || 0, countdown: st.lead ? st.countdown || 5 : 0,
          exercise: st.move, move: st.move,
          pace: st.pace || null, side: st.side || null, counts: st.counts || 0, beats: st.beats || 0, beat: st.beat || 0,
          step: i + 1, steps: WARMUP_STEPS.length, set: 0, slot: 0, next: list[0] });
      });
    }
    if (prep > 0 && list.length) {
      push({ type: 'prep', duration: prep, exercise: list[0], set: 1, slot: 0, next: list[0] });
    }
    for (var s = 1; s <= level.sets; s++) {
      for (var i = 0; i < list.length; i++) {
        var lastInSet = i === list.length - 1;
        var lastSet = s === level.sets;
        var nextId = !lastInSet ? list[i + 1] : (!lastSet ? list[0] : null);
        var breakAfter = lastInSet && !lastSet && setRest > 0;
        push({ type: 'work', duration: level.work, exercise: list[i], set: s, slot: i, next: nextId });
        if (level.recoverType === 'jacks') {
          push({ type: 'jacks', duration: level.recover, exercise: 'jacks', set: s, slot: i, next: nextId,
            setBreak: lastInSet && !lastSet });
        } else if (!breakAfter && !(lastInSet && lastSet)) {
          push({ type: 'rest', duration: level.recover, exercise: 'rest', set: s, slot: i, next: nextId,
            setBreak: lastInSet && !lastSet });
        }
        if (breakAfter) {
          push({ type: 'setrest', duration: setRest, exercise: 'rest', set: s, slot: i, next: nextId, setBreak: true });
        }
      }
    }
    return {
      level: level,
      exercises: list,
      segments: segs,
      total: t,
      workSeconds: segs.reduce(function (a, g) { return a + (g.type === 'work' || g.type === 'jacks' ? g.duration : 0); }, 0),
      intervals: segs.filter(function (g) { return g.type === 'work'; }).length,
      warmupSeconds: segs.reduce(function (a, g) { return a + (g.type === 'warmup' ? g.duration : 0); }, 0),
      warmupEnd: segs.reduce(function (a, g) { return g.type === 'warmup' ? g.end : a; }, 0),
      setRest: setRest
    };
  }

  /** Index of the next exercise interval after segment `idx`, or -1. */
  function nextWorkIndex(timeline, idx) {
    var segs = timeline.segments;
    for (var i = idx + 1; i < segs.length; i++) if (segs[i].type === 'work') return i;
    return -1;
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

  // ---- The coach's brief: what today's session holds, read aloud before it starts ----
  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  /** 28 → "twenty-eight": words every speech voice reads the same way (digits from 100 up). */
  function numWord(n) {
    n = Math.round(n);
    if (n < 0 || n > 99) return String(n);
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  }
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  /** How the coach says an exercise mid-sentence: "push ups", "Russian twists". */
  function sayName(id) {
    var e = BY_ID[id];
    return e ? e.name.toLowerCase().replace(/\brussian\b/, 'Russian') : '';
  }
  /** "five-minute", "forty-five-second": a length used as an adjective (rounded to minutes from 60 s). */
  function lengthAdj(sec) {
    return sec < 60 ? numWord(sec) + '-second' : numWord(Math.round(sec / 60)) + '-minute';
  }
  /** "thirty seconds", "a minute", "two minutes". */
  function lengthNoun(sec) {
    if (sec === 60) return 'a minute';
    if (sec > 60 && sec % 60 === 0) return numWord(sec / 60) + ' minutes';
    return numWord(sec) + ' seconds';
  }

  /**
   * The coach's brief for a timeline from buildTimeline(): the plan for the
   * screen, and the spoken lines in order. Each line says which part of the
   * screen to highlight while it is spoken (`show`): 'intro', 'warmup',
   * 'exercises', 'ex:<id>', 'intervals', 'sets', 'setbreak', 'total', 'ready'.
   * Spoken text says "hit", never the letters H-I-I-T, and numbers as words.
   */
  function brief(tl) {
    var level = tl.level || LEVELS.easy;
    var ids = tl.exercises || [];
    var n = ids.length;
    var sets = level.sets;
    var warm = tl.warmupSeconds || 0;
    var setBreak = sets > 1 && tl.setRest > 0 ? tl.setRest : 0;
    var exercises = ids.map(function (id) { return { id: id, name: BY_ID[id].name, group: BY_ID[id].group }; });
    var groups = GROUP_ORDER.map(function (g) {
      return { group: g, label: GROUPS[g].label, ids: ids.filter(function (id) { return BY_ID[id].group === g; }) };
    }).filter(function (g) { return g.ids.length; });

    var lines = [];
    function say(text, show) { lines.push({ say: text, show: show }); }
    var nWord = numWord(n);

    // name the level once; with the longest list skip "Here's the plan" to keep it brisk
    say('Welcome to today\u2019s hit session, ' + level.name.toLowerCase() + ' level.' +
      (n < MAX_EXERCISES ? ' Here\u2019s the plan.' : ''), 'intro');
    if (warm) say('We start with a ' + lengthAdj(warm) + ' warm-up.', 'warmup');
    say(warm ? 'After that, ' + nWord + ' exercises.' : capFirst(nWord) + ' exercises today.', 'exercises');
    // one line per exercise, so the screen can follow along. Each line is its own utterance, so
    // each ends on a full stop (a comma leaves the voice hanging): "Then abs: crunches." "And Russian twists."
    groups.forEach(function (g, gi) {
      g.ids.forEach(function (id, i) {
        var nm = sayName(id);
        var head = gi > 0 ? 'Then ' + g.label.toLowerCase() : g.label;
        say((i === 0 ? head + ': ' + nm : i === g.ids.length - 1 ? 'And ' + nm : capFirst(nm)) + '.', 'ex:' + id);
      });
    });
    // Easy says "Push hard" next, so its first sentence doesn't repeat "hard"
    say('Each exercise is ' + lengthNoun(level.work) + (level.recoverType === 'jacks' ? ' of hard work, then ' : ' of work, then ') + lengthNoun(level.recover) +
      (level.recoverType === 'jacks' ? ' of jumping jacks to keep your heart rate up. No standing still!' :
        ' of rest. Push hard, but keep your form clean.'), 'intervals');
    var all = n === 2 ? 'both' : 'all ' + nWord;
    if (sets === 1) say('We\u2019ll do ' + all + ' just once.', 'sets');
    else say('One round of ' + all + ' is a set. We\u2019ll do ' + numWord(sets) + ' sets' +
      (setBreak ? '.' : ', back to back.'), 'sets');
    if (setBreak) say('Between sets, you get a ' + lengthAdj(setBreak) + ' break.', 'setbreak');
    var mins = Math.max(1, Math.round(tl.total / 60));
    say('That\u2019s ' + (tl.total % 60 ? 'about ' : '') + (mins === 1 ? 'a minute' : numWord(mins) + ' minutes') +
      ' in all' + (warm ? ', warm-up included.' : '.'), 'total');
    say('Grab some water, and let\u2019s make it count. When you\u2019re ready, tap Start ' +
      (warm ? 'warm-up.' : 'workout.'), 'ready');

    return {
      exercises: exercises,
      groups: groups,
      level: { id: level.id, name: level.name, work: level.work, recover: level.recover,
        recoverType: level.recoverType, sets: sets },
      setBreak: setBreak,
      warmup: warm,
      total: tl.total,
      lines: lines
    };
  }

  var api = {
    GROUPS: GROUPS, GROUP_ORDER: GROUP_ORDER, EXERCISES: EXERCISES, JACKS: JACKS, REST: REST,
    SET_BREAK_TIPS: SET_BREAK_TIPS,
    LEVELS: LEVELS, MIN_EXERCISES: MIN_EXERCISES, MAX_EXERCISES: MAX_EXERCISES,
    DEFAULT_COUNT: DEFAULT_COUNT, PREP_SECONDS: PREP_SECONDS, SET_REST_SECONDS: SET_REST_SECONDS,
    nextWorkIndex: nextWorkIndex,
    WARMUP_MOVES: WARMUP_MOVES, WARMUP_STEPS: WARMUP_STEPS, WARMUP_SECONDS: WARMUP_SECONDS,
    get: get, sanitize: sanitize, coverage: coverage, validate: validate,
    randomPick: randomPick, resize: resize, order: order,
    buildTimeline: buildTimeline, brief: brief, segmentAt: segmentAt, formatTime: formatTime, clampCount: clampCount
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HIIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
