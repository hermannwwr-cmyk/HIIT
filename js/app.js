/*
 * App controller: setup screen, workout engine, personal-trainer coaching,
 * ring timer, particles and screen transitions. Depends on workout.js (HIIT),
 * bg.js (HIITBackdrop), audio.js (HIITAudio) and figure.js (HIITFigure).
 */
(function () {
  'use strict';

  var H = window.HIIT;
  var A = window.HIITAudio;
  var $ = function (id) { return document.getElementById(id); };
  var TAU = Math.PI * 2;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var PHASE = {
    setup: { colors: ['#9b5cff', '#22e5ff'], energy: 0.22, chip: '', flash: '' },
    prep: { colors: ['#b9a8ff', '#5a6bff'], energy: 0.45, chip: 'Get ready', flash: 'READY' },
    work: { colors: ['#ff2bd6', '#ff8a1f'], energy: 1.0, chip: 'Work', flash: 'GO!' },
    rest: { colors: ['#22e5ff', '#4a6bff'], energy: 0.18, chip: 'Rest', flash: 'REST' },
    jacks: { colors: ['#c6ff1a', '#ffe14a'], energy: 0.8, chip: 'Cardio', flash: 'JACKS!' },
    warmup: { colors: ['#95d26b', '#7cba5c'], energy: 0.5, chip: 'Warm-up', flash: 'WARM UP' },
    setrest: { colors: ['#36ffc0', '#9b5cff'], energy: 0.1, chip: 'Set break', flash: 'BREAK' },
    done: { colors: ['#ffd23f', '#ff2bd6'], energy: 0.55, chip: '', flash: '' }
  };
  var GROUP_COLORS = {
    upper: ['#ff4fd8', '#ff8a1f'],
    abs: ['#2ee6ff', '#4a6bff'],
    legs: ['#ffb21f', '#ff4f6a'],
    cardio: ['#c6ff1a', '#ffe14a'],
    rest: ['#22e5ff', '#4a6bff']
  };

  // ---------------------------------------------------------------- looks
  // Each look swaps the colour palette (and energy) used by the backdrop,
  // ring and figures; CSS handles the rest via html[data-look][data-scheme].
  var LOOKS = {
    'studio-dark': {
      style: 'studio', scheme: 'dark', meta: '#151516', fps: 30,
      phase: {
        setup: [['#ff5a36', '#4f7dff'], 0.15], prep: [['#c3c9d4', '#8790a3'], 0.3], work: [['#ff5a36', '#ff3b30'], 0.7],
        rest: [['#2fb8ff', '#3b82f6'], 0.2], jacks: [['#ffc23d', '#ff9f0a'], 0.6], setrest: [['#34d399', '#14b8a6'], 0.1],
        warmup: [['#95d26b', '#7cba5c'], 0.4],
        done: [['#ff5a36', '#ffb020'], 0.5]
      },
      group: { upper: ['#ff7a59', '#ff5a36'], abs: ['#38bdf8', '#3b82f6'], legs: ['#fbbf24', '#f59e0b'], cardio: ['#ffc23d', '#ff9f0a'], rest: ['#2fb8ff', '#3b82f6'], warmup: ['#95d26b', '#7cba5c'] }
    },
    'studio-light': {
      style: 'studio', scheme: 'light', meta: '#f4f3ef', fps: 30,
      phase: {
        setup: [['#f0441f', '#3d6bff'], 0.15], prep: [['#64748b', '#3f4a5c'], 0.3], work: [['#f0441f', '#d92d20'], 0.7],
        rest: [['#0a84ff', '#2563eb'], 0.2], jacks: [['#bd6b00', '#b45309'], 0.6], setrest: [['#059669', '#0f766e'], 0.1],
        warmup: [['#3f7d2a', '#2f6420'], 0.4],
        done: [['#d4380f', '#c76a0a'], 0.5]
      },
      group: { upper: ['#ea580c', '#d4380f'], abs: ['#0284c7', '#2563eb'], legs: ['#c76a0a', '#b45309'], cardio: ['#bd6b00', '#b45309'], rest: ['#0a84ff', '#2563eb'], warmup: ['#3f7d2a', '#2f6420'] }
    }
  };
  var htmlEl = document.documentElement;
  // lookPref is what the user picked ('auto' unless they chose one); look is what's on screen.
  var LOOK_PREF_RE = /^(auto|studio-dark|studio-light)$/;
  var lookPref = LOOK_PREF_RE.test(htmlEl.getAttribute('data-look-pref')) ? htmlEl.getAttribute('data-look-pref') : 'auto';
  var schemeMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function systemScheme() {
    var t = htmlEl.getAttribute('data-theme'); // a host page may pin light/dark explicitly
    if (t === 'dark' || t === 'light') return t;
    return schemeMQ && schemeMQ.matches ? 'dark' : 'light';
  }
  function resolveLook(pref) { return pref === 'auto' ? 'studio-' + systemScheme() : pref; }
  var look = 'studio-' + (htmlEl.getAttribute('data-scheme') === 'light' ? 'light' : 'dark');
  // Dark-scheme directions: Charcoal+ (default) and Graphite+ (?dark=graphite): palette + mannequin material.
  var DARK_VARIANTS = {
    graphite: { material: 'titanium', meta: '#151516' },
    charcoal: {
      material: 'stone', meta: '#1a1918',
      phase: { setup: ['#d8c8b8', '#c9b8a6'], prep: ['#c9bfb2', '#8f867b'], work: ['#ff6b3d', '#f04a2a'], rest: ['#5fb3e8', '#6b8fd6'],
        jacks: ['#f2b544', '#e8873a'], setrest: ['#5fcf9f', '#3fb3a0'], done: ['#ff6b3d', '#f2b544'], warmup: ['#a2d280', '#84bf6a'] }
    }
  };
  var darkVariant = DARK_VARIANTS[htmlEl.getAttribute('data-dark')] ? htmlEl.getAttribute('data-dark') : 'charcoal';
  function figMaterial() {
    return LOOKS[look].scheme === 'dark' ? DARK_VARIANTS[darkVariant].material : 'graphite';
  }
  function applyPalette() {
    var L = LOOKS[look];
    Object.keys(L.phase).forEach(function (k) { PHASE[k].colors = L.phase[k][0]; PHASE[k].energy = L.phase[k][1]; });
    Object.keys(L.group).forEach(function (k) { GROUP_COLORS[k] = L.group[k]; });
    var V = DARK_VARIANTS[darkVariant];
    if (look === 'studio-dark' && V.phase) {
      Object.keys(V.phase).forEach(function (k) { PHASE[k].colors = V.phase[k]; });
      GROUP_COLORS.cardio = V.phase.jacks; GROUP_COLORS.rest = V.phase.rest;
      if (V.phase.warmup) GROUP_COLORS.warmup = V.phase.warmup;
    }
  }
  applyPalette();

  // ---------------------------------------------------------------- storage
  var STORE_KEY = 'overdrive-hiit:v1';
  function loadPrefs() {
    try { return JSON.parse(window.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function savePrefs() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        level: state.level, sfx: A.get('sfx'), voice: A.get('voice'), lookPref: savedLookPref, warmup: state.warmup,
        swipeTip: state.swipeTip, dragTip: state.dragTip,
        completed: state.hist.completed, seconds: state.hist.seconds,
        streak: state.hist.streak, lastDay: state.hist.lastDay
      }));
    } catch (e) { /* storage unavailable: fine */ }
  }

  var prefs = loadPrefs();
  // Only an explicit menu choice is remembered (a ?look= link doesn't stick).
  var savedLookPref = LOOK_PREF_RE.test(prefs.lookPref) ? prefs.lookPref : 'auto';
  var state = {
    level: Object.prototype.hasOwnProperty.call(H.LEVELS, prefs.level) ? prefs.level : 'easy',
    ids: H.randomPick(H.DEFAULT_COUNT),
    warmup: prefs.warmup !== false,
    swipeTip: !!prefs.swipeTip, // the "swipe to skip" tip has been shown once
    dragTip: !!prefs.dragTip,   // "during exercise, drag from the controls" has been shown once
    hist: {
      completed: Number(prefs.completed) || 0,
      seconds: Number(prefs.seconds) || 0,
      streak: Number(prefs.streak) || 0,
      lastDay: typeof prefs.lastDay === 'string' ? prefs.lastDay : ''
    }
  };
  if (prefs.sfx === false) A.set('sfx', false);
  if (prefs.voice === false) A.set('voice', false);

  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayKey() { var d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
  /** Streak only counts if the last workout was today or yesterday. */
  function liveStreak() {
    var h = state.hist;
    return h.lastDay === dayKey(new Date()) || h.lastDay === yesterdayKey() ? h.streak : 0;
  }
  function recordWorkout(seconds) {
    var h = state.hist, today = dayKey(new Date());
    if (h.lastDay !== today) h.streak = h.lastDay === yesterdayKey() ? h.streak + 1 : 1;
    h.lastDay = today;
    h.completed += 1;
    h.seconds += Math.round(seconds);
    savePrefs();
  }

  // ---------------------------------------------------------------- figures
  var stubFig = { setExercise: noop, getTime: function () { return 0; }, setColors: noop, setPlaying: noop, setEnergy: noop, pulse: noop, destroy: noop, setSuspended: noop, setStyle: noop };
  function noop() {}
  var figs = [];
  function makeFig(canvas, opts) {
    opts.style = LOOKS[look].style;
    opts.scheme = LOOKS[look].scheme;
    opts.material = figMaterial();
    var f;
    try { f = (window.HIITFigure && window.HIITFigure.create(canvas, opts)) || stubFig; } catch (e) { f = stubFig; }
    if (f !== stubFig) figs.push(f);
    return f;
  }

  // ---------------------------------------------------------------- backdrop
  var bg;
  try { bg = new window.HIITBackdrop($('bg')); } catch (e) {
    bg = { setMood: noop, setFocus: noop, beatNow: noop, flashNow: noop, setRunning: noop, setFrameRate: noop, setStyle: noop };
  }

  function focusOn(el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    var W = window.innerWidth, Hh = window.innerHeight, m = Math.min(W, Hh);
    if (!r.width) return;
    var fx = ((r.left + r.width / 2) - W / 2) / m;
    var fy = -((r.top + r.height / 2) - Hh / 2) / m;
    bg.setFocus(Math.max(-1.2, Math.min(1.2, fx)), Math.max(-1.2, Math.min(1.2, fy)));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
  }

  // ================================================================ SETUP
  var thumbs = {};
  var cards = {};
  var heroFig = makeFig($('heroFig'), { exercise: state.ids[0], primary: GROUP_COLORS.upper[0], secondary: GROUP_COLORS.upper[1], quality: 'high', fit: 'fill', fps: 30, energy: 0.7 });
  var hero = { hover: null, shown: null };

  var groupLists = {};
  function buildGrid() {
    var wrap = $('exGrid');
    H.GROUP_ORDER.forEach(function (g) {
      var sec = document.createElement('section');
      sec.className = 'ex-sec';
      sec.dataset.group = g;
      sec.setAttribute('aria-labelledby', 'exsec-' + g);
      sec.innerHTML = '<h3 class="ex-sec-h" id="exsec-' + g + '"><span class="ex-sec-dot" aria-hidden="true"></span>' +
        '<span class="ex-sec-name"></span><span class="ex-sec-n" id="exsec-n-' + g + '"></span></h3><ul class="ex-grid"></ul>';
      sec.querySelector('.ex-sec-name').textContent = H.GROUPS[g].label;
      wrap.appendChild(sec);
      groupLists[g] = sec.querySelector('ul');
    });
    H.EXERCISES.forEach(function (ex) {
      var grid = groupLists[ex.group];
      var li = document.createElement('li');
      li.className = 'ex-item';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ex';
      btn.id = 'ex-' + ex.id;
      btn.dataset.id = ex.id;
      btn.dataset.group = ex.group;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML =
        '<span class="ex-thumb"><canvas aria-hidden="true"></canvas></span>' +
        '<span class="ex-text"><span class="ex-name"></span><span class="ex-group"></span></span>' +
        '<span class="ex-badge" aria-hidden="true"></span>';
      btn.querySelector('.ex-name').textContent = ex.name;
      btn.querySelector('.ex-group').textContent = H.GROUPS[ex.group].label;
      btn.addEventListener('click', function () { toggleExercise(ex.id); });
      btn.addEventListener('mouseenter', function () { heroPeek(ex.id); });
      btn.addEventListener('mouseleave', function () { heroPeek(null); });
      btn.addEventListener('focus', function () { heroPeek(ex.id); });
      btn.addEventListener('blur', function () { heroPeek(null); });

      var info = document.createElement('button');
      info.type = 'button';
      info.className = 'ex-info';
      info.dataset.group = ex.group;
      info.setAttribute('aria-label', 'How to do ' + ex.name);
      info.innerHTML = '<svg aria-hidden="true"><use href="#i-info"/></svg>';
      info.addEventListener('click', function () { openGuide(ex.id, 'setup', info); });

      li.appendChild(btn);
      li.appendChild(info);
      grid.appendChild(li);
      cards[ex.id] = btn;
      var gc = GROUP_COLORS[ex.group];
      // the ⓘ button (.ex-info, 26-28 px, from 22 px inside the corner) sits on the thumbnail's
      // bottom-right corner: keep the figure out from under it
      thumbs[ex.id] = makeFig(btn.querySelector('canvas'), { exercise: ex.id, primary: gc[0], secondary: gc[1], quality: 'low', energy: 0.6, clear: [9, 9, 15] });
    });
  }

  function toggleExercise(id) {
    var i = state.ids.indexOf(id);
    if (i >= 0) state.ids.splice(i, 1);
    else if (state.ids.length < H.MAX_EXERCISES) state.ids = H.order(state.ids.concat([id]));
    A.play('click');
    if (i < 0) { hero.hover = null; showHero(id); }
    renderSetup();
  }

  function setCount(n) {
    state.ids = H.resize(state.ids, n);
    A.play('click');
    renderSetup();
  }

  function renderMe() {
    $('me').hidden = state.hist.completed === 0;
    $('meCount').textContent = String(state.hist.completed);
    $('meMinutes').textContent = String(Math.round(state.hist.seconds / 60));
    $('meStreak').textContent = String(liveStreak());
  }

  function renderSetup() {
    var ids = state.ids;
    var v = H.validate(ids);
    var level = H.LEVELS[state.level];

    document.querySelectorAll('.level').forEach(function (el) {
      var on = el.dataset.level === state.level;
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      el.tabIndex = on ? 0 : -1;
    });

    H.EXERCISES.forEach(function (ex) {
      var pos = ids.indexOf(ex.id);
      var btn = cards[ex.id];
      btn.setAttribute('aria-pressed', pos >= 0 ? 'true' : 'false');
      btn.querySelector('.ex-badge').textContent = pos >= 0 ? String(pos + 1) : '';
      btn.setAttribute('aria-label', ex.name + ', ' + H.GROUPS[ex.group].label + (pos >= 0 ? ', number ' + (pos + 1) + ' in order' : ', not included'));
      thumbs[ex.id].setPlaying(pos >= 0);
      thumbs[ex.id].setEnergy(pos >= 0 ? 0.7 : 0.15);
    });

    H.GROUP_ORDER.forEach(function (g) {
      var total = H.EXERCISES.filter(function (e) { return e.group === g; }).length;
      var picked = ids.filter(function (id) { return H.get(id).group === g; }).length;
      var n = $('exsec-n-' + g);
      n.textContent = picked ? picked + ' of ' + total + ' picked' : 'none picked';
      n.classList.toggle('none', !picked);
    });
    $('count').textContent = String(ids.length);
    $('minus').disabled = ids.length <= H.MIN_EXERCISES;
    $('plus').disabled = ids.length >= H.MAX_EXERCISES;

    document.querySelectorAll('.cov').forEach(function (el) {
      var on = v.coverage[el.dataset.g];
      el.classList.toggle('on', on);
      el.classList.toggle('missing', !on);
    });

    var hint = $('hint');
    hint.classList.toggle('warn', !v.ok);
    if (!v.ok) hint.textContent = v.reason;
    else if (!hint.querySelector('svg')) {
      hint.innerHTML = 'Add or remove exercises. They run in the numbered order: upper body, abs, then legs. <svg aria-hidden="true" class="inline-ico"><use href="#i-info"/></svg> opens the trainer’s guide.';
    }

    $('start').disabled = !v.ok;
    $('startError').textContent = v.ok ? '' : v.reason;

    var tl = H.buildTimeline(ids, state.level, { warmup: state.warmup });
    var total = v.ok ? H.formatTime(tl.total) : '--:--';
    $('sumLevel').textContent = level.name + ' · ' + level.sets + ' sets';
    $('sumTotal').textContent = total;
    $('sumWork').textContent = v.ok ? H.formatTime(tl.workSeconds) : '--:--';
    $('sumIntervals').textContent = v.ok ? String(tl.intervals) : '--';
    $('heroTime').textContent = total;
    $('startTime').textContent = total;

    var strip = $('strip');
    strip.textContent = '';
    if (v.ok) {
      tl.segments.forEach(function (s) {
        var i = document.createElement('i');
        i.className = 's-' + s.type;
        i.style.flex = s.duration + ' 1 0';
        strip.appendChild(i);
      });
    }
    $('legendRecover').innerHTML = level.recoverType === 'jacks' ? '<i class="k-jacks"></i>Jumping jacks' : '<i class="k-rest"></i>Rest';
    $('wuToggle').setAttribute('aria-checked', state.warmup ? 'true' : 'false');
    $('wuTime').textContent = H.formatTime(H.WARMUP_SECONDS);
    $('legendWarmup').hidden = !state.warmup;

    if (hero.shown && ids.indexOf(hero.shown) < 0 && !hero.hover) showHero(ids[0] || 'rest');
    renderMe();
    savePrefs();
  }

  function showHero(id) {
    if (!id) return;
    hero.shown = id;
    var ex = H.get(id) || H.REST;
    var gc = GROUP_COLORS[ex.group] || PHASE.rest.colors;
    heroFig.setExercise(id);
    heroFig.setColors(gc[0], gc[1]);
    heroFig.pulse();
    $('heroName').textContent = ex.name;
    if (currentScreen === 'setup') bg.setMood(mix(gc[0], PHASE.setup.colors[0]), mix(gc[1], PHASE.setup.colors[1]), PHASE.setup.energy);
  }
  function heroPeek(id) {
    hero.hover = id;
    if (id) showHero(id);
  }
  function heroCycle() {
    if (currentScreen !== 'setup' || hero.hover || !state.ids.length || !$('coachSheet').hidden) return;
    var i = state.ids.indexOf(hero.shown);
    showHero(state.ids[(i + 1) % state.ids.length]);
  }

  function mix(a, b) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = ((x >> 16 & 255) * 0.65 + (y >> 16 & 255) * 0.35) | 0;
    var g = ((x >> 8 & 255) * 0.65 + (y >> 8 & 255) * 0.35) | 0;
    var bl = ((x & 255) * 0.65 + (y & 255) * 0.35) | 0;
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  // ================================================================ TRAINER GUIDE
  var guide = { id: null, context: null, opener: null, resume: false, fig: null };

  function openGuide(id, context, opener) {
    var ex = H.get(id);
    if (!ex) return;
    guide.id = id; guide.context = context; guide.opener = opener || null;
    guide.resume = false;
    if (context === 'workout' && run && run.playing) { guide.resume = true; pauseQuietly(); }
    $('pausedVeil').hidden = true;

    var gc = GROUP_COLORS[ex.group] || PHASE.work.colors;
    var sheet = $('coachSheet');
    sheet.style.setProperty('--gc', gc[0]);
    sheet.style.setProperty('--gc2', gc[1]);
    $('csGroup').textContent = (H.GROUPS[ex.group] ? H.GROUPS[ex.group].label : ex.group === 'warmup' ? 'Warm-up' : 'Cardio') + ' · Trainer’s guide';
    $('csName').textContent = ex.name;
    $('csMuscles').textContent = ex.muscles;
    fillList($('csSteps'), ex.steps);
    $('csBreathe').textContent = ex.breathe;
    fillList($('csMistakes'), ex.mistakes);
    $('csEasier').textContent = ex.easier;
    $('csHarder').textContent = ex.harder;
    $('csTempo').textContent = context === 'workout' ? 'Timer paused' : 'Live demo';

    var toggle = $('csToggle');
    toggle.hidden = context !== 'setup' || ex.group === 'cardio';
    syncGuideToggle();
    $('csDone').textContent = context === 'workout' ? 'Back to workout' : 'Close';

    sheet.hidden = false;
    sheet.scrollTop = 0;
    suspendBehindSheet(true);
    if (!guide.fig) guide.fig = makeFig($('csFig'), { exercise: figIdFor(id), primary: gc[0], secondary: gc[1], quality: 'high', fit: 'fill', energy: 0.9 });
    guide.fig.setExercise(figIdFor(id));
    guide.fig.setColors(gc[0], gc[1]);
    guide.fig.setPlaying(true);
    guide.fig.pulse();
    A.play('click');
    setTimeout(function () { $('csClose').focus(); }, 30);
  }

  function suspendBehindSheet(on) {
    heroFig.setSuspended(on);
    Object.keys(thumbs).forEach(function (k) { thumbs[k].setSuspended(on); });
    if (workFig) workFig.setSuspended(on);
    if (nextFig) nextFig.setSuspended(on);
    if (doneFig) doneFig.setSuspended(on);
    Object.keys(briefThumbs).forEach(function (k) { briefThumbs[k].fig.setSuspended(on); });
    if (currentScreen !== 'workout') bg.setRunning(!on);
    setInert(on);
  }

  /** Make everything behind an open dialog unreachable for keyboard and screen readers. */
  function setInert(on) {
    var parts = currentScreen === 'workout' ? document.querySelectorAll('.w-top, .w-prog, .w-body') : [$(currentScreen)];
    Array.prototype.forEach.call(parts, function (el) { if (el) el.inert = !!on; });
  }

  function syncGuideToggle() {
    var on = state.ids.indexOf(guide.id) >= 0;
    $('csToggle').querySelector('.start-label').textContent = on ? 'Remove from workout' : 'Add to workout';
    $('csToggle').classList.toggle('is-remove', on);
  }

  function closeGuide() {
    var sheet = $('coachSheet');
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (guide.fig) guide.fig.setPlaying(false);
    suspendBehindSheet(false);
    if (guide.context === 'workout' && run && !run.finished) {
      if (guide.resume) setPlaying(true);
      else if (!run.playing) setPauseUi(true);
    }
    if (guide.context === 'workout' && run && !run.finished) { if ($('pausedVeil').hidden) $('pause').focus(); }
    else if (guide.opener && document.body.contains(guide.opener)) guide.opener.focus();
  }

  function fillList(el, items) {
    el.textContent = '';
    (items || []).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; el.appendChild(li); });
  }

  // ================================================================ SCREENS
  var currentScreen = 'setup';
  function showScreen(name) {
    currentScreen = name;
    ['setup', 'brief', 'workout', 'done'].forEach(function (s) { $(s).hidden = s !== name; });
    document.body.dataset.screen = name;
    bg.setFrameRate(LOOKS[look].fps || (name === 'workout' ? 0 : 30));
    if (name !== 'brief') briefLeave();
    if (name === 'setup' || name === 'brief') {
      document.body.dataset.phase = 'setup';
      bg.setMood(PHASE.setup.colors[0], PHASE.setup.colors[1], PHASE.setup.energy);
      bg.setRunning(true);
      requestAnimationFrame(function () { focusOn(name === 'brief' ? $('briefTitle') : $('heroFig')); });
      window.scrollTo(0, 0);
      if (name === 'setup') renderMe();
    }
  }

  // ================================================================ BRIEF
  // Before the workout the coach talks you through today's plan: the screen shows it all
  // at a glance, and the part the coach is on lights up while the rest steps back.

  var briefOf = H.brief; // the plan and the coach's lines (js/workout.js)

  var brief = { tl: null, data: null, i: -1, tok: 0, timer: 0, talking: false, clock: 0 };
  var briefThumbs = {}; // id -> { canvas, fig }: one animated mannequin per move, reused between visits
  var BRIEF_GAP = 260;  // a breath between the coach's lines

  function briefThumb(id, group) {
    var t = briefThumbs[id];
    if (!t) {
      var c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      var gc = GROUP_COLORS[group] || PHASE.warmup.colors;
      t = briefThumbs[id] = { canvas: c, group: group, fig: makeFig(c, { exercise: figIdFor(id), primary: gc[0], secondary: gc[1], quality: 'low', energy: 0.45 }) };
    }
    return t;
  }
  function briefColors() {
    Object.keys(briefThumbs).forEach(function (id) {
      var t = briefThumbs[id], gc = GROUP_COLORS[t.group] || PHASE.warmup.colors;
      t.fig.setColors(gc[0], gc[1]);
    });
  }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  /** "6:42" or "6:42 PM": the wall-clock time the session ends if it starts now. */
  function finishAt(sec) {
    var d = new Date(Date.now() + sec * 1000);
    try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
  }
  function briefClock() { if (brief.data) $('bFinish').textContent = finishAt(brief.data.total); }

  function renderBrief(tl, b) {
    var lv = b.level, segs = tl.segments, warm = !!b.warmup;
    // each part keeps together on a narrow phone ("8 exercises" never splits)
    $('bSub').innerHTML = [lv.name, plural(b.exercises.length, 'exercise'), plural(lv.sets, 'set')]
      .map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('<span class="b-dot" aria-hidden="true"> · </span>');
    $('bTotal').textContent = H.formatTime(b.total);
    $('bTotal').setAttribute('aria-label', 'Total ' + H.formatTime(b.total));
    briefClock();

    // the session to scale: warm-up | set 1 | break | set 2 … (the 10 s get-ready rides with set 1)
    var map = $('bMap');
    map.textContent = '';
    var blocks = [];
    segs.forEach(function (s) {
      var key = s.type === 'warmup' ? 'warmup' : s.type === 'setrest' ? 'break' + s.set : 'set' + s.set;
      var last = blocks[blocks.length - 1];
      if (!last || last.key !== key) blocks.push(last = { key: key, segs: [], dur: 0, set: s.set });
      last.segs.push(s); last.dur += s.duration;
    });
    blocks.forEach(function (bk) {
      var kind = bk.key === 'warmup' ? 'warmup' : /^break/.test(bk.key) ? 'break' : 'set';
      var d = mk('div', 'bm-b bp bm-' + kind);
      d.title = kind === 'warmup' ? 'Warm-up ' + H.formatTime(bk.dur) : kind === 'break' ? 'Break ' + H.formatTime(bk.dur) : 'Set ' + bk.set;
      d.dataset.part = kind === 'warmup' ? 'warmup' : kind === 'break' ? 'setbreak' : 'sets';
      d.style.flex = bk.dur + ' 1 0';
      var bar = mk('div', 'bm-bar');
      if (kind === 'set') bk.segs.forEach(function (s) { var i = mk('i', 's-' + s.type); i.style.flex = s.duration + ' 1 0'; bar.appendChild(i); });
      d.appendChild(bar);
      d.appendChild(mk('span', 'bm-l', kind === 'warmup' ? 'Warm-up' : kind === 'break' ? 'Break' : 'Set ' + bk.set));
      map.appendChild(d);
    });

    // the sequence: warm-up, then the exercises grouped upper body / abs / legs
    var seq = $('bSeq');
    seq.textContent = '';
    function row(id, group, num, name, meta, part, time) {
      var li = mk('li', 'b-item');
      var btn = mk('button', 'b-row bp');
      btn.type = 'button';
      btn.dataset.part = part;
      btn.dataset.group = group;
      var th = mk('span', 'b-thumb');
      var t = briefThumb(id, group);
      th.appendChild(t.canvas);
      btn.appendChild(th);
      if (num) btn.appendChild(mk('span', 'b-num', String(num)));
      var tx = mk('span', 'b-row-text');
      tx.appendChild(mk('span', 'b-row-name', name));
      tx.appendChild(mk('span', 'b-row-meta', meta));
      btn.appendChild(tx);
      if (time) btn.appendChild(mk('span', 'b-row-time', time));
      var info = mk('span', 'b-row-info');
      info.innerHTML = '<svg aria-hidden="true"><use href="#i-info"/></svg>';
      btn.appendChild(info);
      btn.setAttribute('aria-label', (num ? num + '. ' : '') + name + ', ' + meta + '. How to');
      btn.addEventListener('click', function () { briefStopTalk(true); openGuide(id, 'brief', btn); });
      li.appendChild(btn);
      return li;
    }
    function grp(group, label, items, part) {
      var g = mk('div', 'b-grp');
      g.dataset.group = group;
      if (part) g.dataset.part = part;
      // the warm-up is not a muscle group: its row names it, the rail stays (no label twice)
      var h = mk(label ? 'h3' : 'span', 'b-grp-h', label);
      g.appendChild(h);
      var ol = mk('ol', 'b-list');
      items.forEach(function (li) { ol.appendChild(li); });
      g.appendChild(ol);
      return g;
    }
    if (warm) {
      seq.appendChild(grp('warmup', '', [row('jog', 'warmup', 0, 'Warm-up', H.formatTime(b.warmup) + ' · jog, jacks & stretches', 'warmup')]));
    }
    var exWrap = mk('div', 'b-exs');
    exWrap.dataset.part = 'exercises';
    var n = 0;
    b.groups.forEach(function (g) {
      exWrap.appendChild(grp(g.group, g.label, g.ids.map(function (id) {
        var ex = H.get(id);
        n++;
        // the two main muscles: a third one only gets cut off on a phone
        return row(id, g.group, n, ex.name, ex.muscles.split(' · ').slice(0, 2).join(' · '), 'ex:' + id);
      })));
    });
    seq.appendChild(exWrap);

    // one set, to scale: 30 s on, 30 s off, numbered like the list
    var jacks = lv.recoverType === 'jacks';
    $('bPattern').innerHTML = '<span class="bp-w"><b>' + lv.work + ' s</b> exercise</span><span class="bp-arrow" aria-hidden="true">→</span>' +
      '<span class="bp-r' + (jacks ? ' j' : '') + '"><b>' + lv.recover + ' s</b> ' + (jacks ? 'jumping jacks' : 'rest') + '</span>';
    var beats = $('bBeats');
    beats.textContent = '';
    beats.classList.toggle('jacks', jacks);
    segs.forEach(function (s) {
      if (s.set !== 1 || (s.type !== 'work' && s.type !== 'rest' && s.type !== 'jacks')) return;
      var i = mk('i', 'bb bp bb-' + s.type);
      i.style.flex = s.duration + ' 1 0';
      if (s.type === 'work') { i.dataset.part = 'ex:' + s.exercise; i.dataset.group = H.get(s.exercise).group; i.textContent = String(s.slot + 1); }
      beats.appendChild(i);
    });
    // the same in one line up top, so the pattern is on screen at once even when the card is below the fold
    $('bSum').innerHTML =
      '<span class="bs bp" data-part="intervals"><i class="b-sw b-sw-w"></i>' + lv.work + ' s exercise <span class="bs-arrow" aria-hidden="true">→</span> <i class="b-sw b-sw-' + (jacks ? 'j' : 'r') + '"></i>' +
        lv.recover + ' s ' + (jacks ? 'jumping jacks' : 'rest') + '</span>' +
      '<span class="bs-g"><span class="bs bp" data-part="sets">×' + lv.sets + ' ' + (lv.sets === 1 ? 'set' : 'sets') + '</span>' +
      (b.setBreak ? '<span class="bs bp" data-part="setbreak">' + H.formatTime(b.setBreak) + ' breaks</span>' : '') + '</span>';
    $('bSets').innerHTML = '<b>×' + lv.sets + '</b> ' + (lv.sets === 1 ? 'set' : 'sets');
    $('bBreak').innerHTML = '<b>' + H.formatTime(b.setBreak) + '</b> break between sets';
    $('bBreak').hidden = !b.setBreak;

    $('bStartLabel').textContent = warm ? 'Start warm-up' : 'Start workout';
  }
  /** A map label that doesn't fit its block (the warm-up's, on a phone) steps aside rather than collide. */
  function briefFitMap() {
    var r = document.createRange(), blocks = document.querySelectorAll('#bMap .bm-b'), spill = 0;
    Array.prototype.forEach.call(blocks, function (d, i) {
      r.selectNodeContents(d.querySelector('.bm-l'));
      var need = r.getBoundingClientRect().width, room = d.clientWidth - 8;
      // the warm-up always keeps its label: it may run on over the next block, whose label then gives way
      var warm = d.classList.contains('bm-warmup');
      d.classList.toggle('spill', warm && need > room);
      d.classList.toggle('tight', !warm && (need > room || spill > 0));
      spill = warm && need > room ? need - room : 0;
    });
  }
  window.addEventListener('resize', function () { if (currentScreen === 'brief') briefFitMap(); });

  /** Setup's Start: build today's plan and let the coach brief it. */
  function openBrief() {
    var v = H.validate(state.ids);
    if (!v.ok) { $('startError').textContent = v.reason; return; }
    A.unlock();
    var tl = H.buildTimeline(state.ids, state.level, { warmup: state.warmup });
    brief.tl = tl;
    brief.data = briefOf(tl);
    renderBrief(tl, brief.data);
    briefShow(null);
    $('brief').classList.remove('talking');
    $('bCoachV').textContent = '';
    showScreen('brief');
    briefFitMap();
    try { document.fonts.ready.then(function () { if (currentScreen === 'brief') briefFitMap(); }); } catch (e) { /* no font API: fine */ }
    $('bScroll').scrollTop = 0;
    // Back from here returns to setup, not out of the app
    try { if (!(history.state && history.state.brief)) history.pushState({ brief: 1 }, ''); } catch (e) { /* sandboxed: fine */ }
    Object.keys(briefThumbs).forEach(function (k) { briefThumbs[k].fig.setPlaying(true); briefThumbs[k].fig.setEnergy(0.45, true); });
    clearInterval(brief.clock);
    brief.clock = setInterval(briefClock, 15000);
    requestAnimationFrame(function () { $('briefTitle').focus({ preventScroll: true }); });
    if (A.get('voice') && !A.voiceSupported()) notice(VOICE_HELP);
    briefPlay();
  }
  /** Leaving the brief screen (any way): the coach stops, nothing keeps animating behind. */
  function briefLeave() {
    if (!brief.data) return;
    briefStopTalk(false);
    clearInterval(brief.clock);
    Object.keys(briefThumbs).forEach(function (k) { briefThumbs[k].fig.setPlaying(false); });
  }
  function closeBrief() {
    if (currentScreen !== 'brief') return;
    A.stopVoice();
    showScreen('setup');
    try { if (history.state && history.state.brief) history.back(); } catch (e) { /* ignore */ }
    $('start').focus({ preventScroll: true });
  }
  function briefStart() {
    if (currentScreen !== 'brief') return;
    briefStopTalk(false);
    A.stopVoice();
    // the brief's history entry becomes the workout's (Back mid-workout still asks first)
    try { if (history.state && history.state.brief) history.replaceState({ hiit: 1 }, ''); } catch (e) { /* ignore */ }
    startWorkout(state.ids);
  }

  /** Light up the part(s) of the screen named by a line's `show` key; null clears. */
  function briefShow(key) {
    var scr = $('brief');
    Array.prototype.forEach.call(scr.querySelectorAll('[data-part].on'), function (e) { e.classList.remove('on'); });
    // reduced motion: only the move being named is demonstrated
    Object.keys(briefThumbs).forEach(function (k) { briefThumbs[k].fig.setEnergy(0.45); briefThumbs[k].fig.setPlaying(!reduced || !key); });
    // "tap Start" closes the brief: the whole plan comes back, the button calls
    scr.classList.toggle('dim', !!key && key !== 'ready');
    if (!key) return;
    var hits = Array.prototype.filter.call(scr.querySelectorAll('[data-part]'), function (e) { return e.dataset.part === key; });
    hits.forEach(function (e) { e.classList.add('on'); });
    // the exercise being named moves with full energy
    var m = /^ex:(.+)$/.exec(key) || (key === 'warmup' ? [0, 'jog'] : null);
    if (m && briefThumbs[m[1]]) { briefThumbs[m[1]].fig.setPlaying(true); briefThumbs[m[1]].fig.setEnergy(1); briefThumbs[m[1]].fig.pulse(); }
    // keep it in view (the list can be taller than a small phone)
    var first = hits.filter(function (e) { return $('bScroll').contains(e); })[0];
    if (first) briefReveal(first);
  }
  function briefReveal(e) {
    var sc = $('bScroll'), r = e.getBoundingClientRect(), v = sc.getBoundingClientRect(), pad = 12;
    var dy = r.top < v.top + pad ? r.top - v.top - pad : r.bottom > v.bottom - pad ? Math.min(r.bottom - v.bottom + pad, r.top - v.top - pad) : 0;
    if (Math.abs(dy) > 1) sc.scrollBy({ top: dy, behavior: reduced ? 'auto' : 'smooth' });
  }

  /** Reading pace for a line the voice can't say (the highlights still step). */
  function briefReadMs(text) { return Math.max(1500, text.split(/\s+/).length * 330 + 500); }
  function briefPlay() {
    briefStopTalk(false);
    var scr = $('brief');
    $('bReplay').hidden = true;
    if (!A.get('voice') || !A.voiceSupported()) { briefDone(false); return; }
    brief.talking = true;
    scr.classList.add('talking');
    briefCaption(brief.data.lines[0].say); // on screen at once; the voice follows
    var tok = brief.tok;
    brief.timer = setTimeout(function () { if (tok === brief.tok) briefLine(0); }, 450); // let the screen land first
  }
  /**
   * Say line i, then the next once it has been spoken. Lines chain on the speech engine's
   * own end (polled); if the voice doesn't actually play, the highlights step at reading pace.
   */
  function briefLine(i) {
    var lines = brief.data.lines, tok = ++brief.tok;
    if (i >= lines.length) { briefDone(true); return; }
    brief.i = i;
    var ln = lines[i];
    briefShow(ln.show);
    briefCaption(ln.say);
    A.say(ln.say);
    var t0 = performance.now(), heard = false, est = briefReadMs(ln.say);
    function next(gap) { brief.timer = setTimeout(function () { if (tok === brief.tok) briefLine(i + 1); }, gap); }
    (function poll() {
      if (tok !== brief.tok) return;
      var t = performance.now() - t0;
      if (t > 1300 && !A.voiceWorks()) { if (t >= est) next(0); else brief.timer = setTimeout(poll, 100); return; }
      if (A.speaking()) {
        heard = true;
        if (t > est * 3 + 4000) next(0); // a stuck engine
        else brief.timer = setTimeout(poll, 80);
        return;
      }
      if (heard) { next(BRIEF_GAP); return; }
      if (t >= est) next(0); else brief.timer = setTimeout(poll, 80);
    })();
  }
  /** The coach's line as a caption: the whole line, smaller when it is a long one. */
  function briefCaption(say) {
    var cv = $('bCoachV'), text = say.replace(/\bhit\b/g, 'HIIT'); // spelt "hit" for the voice only
    if (cv.textContent === text) return;
    cv.textContent = text;
    cv.classList.toggle('long', text.length > 80);
    cv.classList.remove('swap'); void cv.offsetWidth; cv.classList.add('swap');
  }
  /** The brief is over (or the voice is off): everything shows at full strength. */
  function briefDone(spoke) {
    brief.tok++;
    clearTimeout(brief.timer);
    brief.talking = false;
    $('brief').classList.remove('talking');
    briefShow(null);
    var voice = A.get('voice') && A.voiceSupported();
    briefCaption(!voice ? 'Voice coach is off. Here’s today’s plan.' : spoke ? 'That’s the plan. Ready when you are.' : 'Here’s today’s plan.');
    $('bReplay').hidden = !voice;
  }
  /** Stop the coach mid-brief; `show` leaves the plan fully visible (otherwise the caller moves on). */
  function briefStopTalk(show) {
    var was = brief.talking;
    brief.tok++;
    clearTimeout(brief.timer);
    if (was) { A.stopVoice(); brief.talking = false; }
    if (was && show) briefDone(false);
  }

  // ================================================================ RING
  function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  /** Relative luminance (WCAG) of a hex colour. */
  function lumOf(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** The icon colour on a solid hex fill: white while it keeps 3:1 (WCAG, graphics), else near-black. */
  function inkOn(hex) { return 1.05 / (lumOf(hex) + 0.05) >= 3 ? '#fff' : '#111318'; }
  /** A phase colour as a solid control on the light page: darkened a step at a time until it
   *  stands out from the page by 3.3:1 (#0a84ff, for one, is only 3.0:1). Dark pages: as is. */
  function solidOnPage(hex) {
    if (LOOKS[look].scheme !== 'light') return hex;
    var c = hexRgb(hex);
    for (var i = 0; i < 8 && 0.89 / (lumOf(hex) + 0.05) < 3.3; i++) {
      c = c.map(function (v) { return Math.round(v * 0.9); });
      hex = '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
    }
    return hex;
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }

  function Ring(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.progress = 1;
    this.a = hexRgb('#ff5a36'); this.b = hexRgb('#4f7dff');
    this.ta = this.a.slice(); this.tb = this.b.slice();
    this.beat = 0; this.hot = 0;
    this.paused = false;
    this.shocks = [];
    this.w = 0; this.h = 0; this.dpr = 1;
    this.sizeDirty = true;
    this.needs = 2;
    var self = this;
    if (window.ResizeObserver) new ResizeObserver(function () { self.sizeDirty = true; self.needs = 2; }).observe(canvas);
    else window.addEventListener('resize', function () { self.sizeDirty = true; self.needs = 2; });
  }
  /** True while anything on the ring is animating. */
  Ring.prototype.busy = function () {
    return this.needs > 0 || this.shocks.length > 0 || this.hot > 0.01 || this.beat > 0.01;
  };
  Ring.prototype.setColors = function (a, b) { this.ta = hexRgb(a); this.tb = hexRgb(b); };
  Ring.prototype.shock = function (strength) { this.shocks.push({ t: 0, s: strength || 1 }); this.needs = 2; };
  Ring.prototype.resize = function () {
    if (!this.sizeDirty && this.w) return true;
    this.sizeDirty = false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.c.clientWidth, h = this.c.clientHeight;
    if (!w || !h) { this.sizeDirty = true; return false; }
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.layout();
    }
    return true;
  };
  /**
   * Gauge geometry. The ring has an opening at the bottom, just wide enough for
   * the pause button, which sits in it on the line of the ring's end caps (its
   * base). Back and skip sit on that same line, out to the left and right of the
   * ring, clear of its arc (--bx: their distance from the centre). Everything
   * scales with the ring; the figure (or the rest countdown) fills the space
   * inside the ring above the pause.
   */
  Ring.prototype.layout = function () {
    var w = this.w, h = this.h;
    function radius(S) {
      // top: how far above the centre the ring band reaches
      var th = Math.max(9, S * 0.05); return { R: S * 0.44 - th * 0.5, th: th, ext: th * 0.5, top: S * 0.44 + 2 };
    }
    function pill(S) {
      // fixed sizes per ring, so nothing changes shape between phases; they grow with the
      // ring (a big dial gets a big pause). Back / skip are clearly secondary (0.8 of the
      // pause) but never under a 44 px target
      var main = Math.round(Math.max(52, Math.min(92, S * 0.135 + 10)));
      var side = Math.max(44, Math.round(main * 0.8));
      return { ph: main + 10, main: main, side: side };
    }
    function fit(S) {
      var r = radius(S), p = pill(S);
      // every control keeps the same clearance from the ring: the pause from the caps,
      // back / skip from the arc above them (17 px, a little more on a big ring)
      var gap = Math.max(17, Math.round(S * 0.028));
      var half = p.main / 2 + gap + r.ext; // opening half-chord: pause + clearance + cap
      var ga = Math.asin(Math.min(0.92, half / r.R));
      var capY = r.R * Math.cos(ga);
      // back / skip sit just clear of the arc, so the row stays part of the dial (beside
      // the ring's base the nearest point of the band is straight towards the centre).
      // A hand holding the phone needs room beside them (16 px inside the stage): on a
      // narrow stage their clearance gives way first (down to 12 px), then the ring shrinks.
      var outR = r.R + r.th / 2 + p.side / 2;
      function clearX(g) { return Math.sqrt(Math.max(0, Math.pow(outR + g, 2) - capY * capY)); }
      var room = w / 2 - 16 - p.side / 2, sg = gap;
      if (clearX(sg) > room) sg = Math.max(12, Math.min(sg, Math.sqrt(room * room + capY * capY) - outR));
      var bx = clearX(sg);
      var air = Math.round(Math.max(8, Math.min(16, S * 0.035))); // between the row and what's below
      return { S: S, r: r, p: p, ga: ga, capY: capY, bx: bx,
        below: Math.max(capY + p.ph / 2, capY + r.ext) + air, wide: 2 * (bx + p.side / 2 + 16) };
    }
    // The bottom of the ring is an opening, so the ring may be taller than the
    // stage: size it by what is actually drawn (top of the ring down to the controls),
    // and narrow enough that back and skip fit beside its base.
    var maxS = w / 0.9, S = Math.min(maxS, h * 1.6), f = fit(S);
    for (var k = 0; k < 16; k++) {
      var need = f.r.top + f.below;
      if (need <= h + 0.5 && f.wide <= w + 0.5) break;
      S = Math.max(60, Math.min(S * Math.pow(h / need, 0.9), S * Math.pow(w / f.wide, 0.9)) * 0.998);
      f = fit(S);
    }
    var r = f.r, p = f.p;
    var cy = Math.max(0, (h - (r.top + f.below)) / 2) + r.top;
    // inside the ring, above the pill: where the figure or the rest countdown goes
    var innerTop = cy - r.R + r.th * 0.5 + 4;
    var innerBot = cy + f.capY - p.ph / 2 - 4;
    var regionH = Math.max(40, innerBot - innerTop);
    this.geo = { S: S, cx: w / 2, cy: cy, R: r.R, th: r.th, ga: f.ga, A0: Math.PI / 2 + f.ga, SW: TAU - 2 * f.ga, fy: (innerTop + innerBot) / 2, fh: regionH };
    var st = this.c.parentNode, px = function (v) { return Math.round(v) + 'px'; };
    st.style.setProperty('--cy', px(cy));
    st.style.setProperty('--rr', px(r.R));
    st.style.setProperty('--ss', px(S));
    st.style.setProperty('--ty', px(cy + f.capY));
    st.style.setProperty('--ph', px(p.ph));
    st.style.setProperty('--pmain', px(p.main));
    st.style.setProperty('--pside', px(p.side));
    // back / skip on the base line (see fit); never past the stage's edge
    st.style.setProperty('--bx', px(Math.min(f.bx, w / 2 - 6 - p.side / 2)));
    st.style.setProperty('--fy', px((innerTop + innerBot) / 2));
    st.style.setProperty('--fh', px(regionH));
    st.style.setProperty('--ri', px(r.R - r.th / 2 - 6));
    // on the stage, so the swipe preview's figure gets exactly the same size and place
    st.style.setProperty('--fig-size', px(Math.min(S * 0.72, regionH * 1.22, 2 * (r.R - r.th))));
    sizeUpNext();
  };
  /** The up-next card overlays the readout's space; its demo tile fills that height. */
  /**
   * The up-next card covers the readout + coach area. It must always fit that
   * space with its Start button inside: try the full card first, then drop
   * extras one at a time (step, muscles, actions beside the demo, meta,
   * label) and finally shrink the demo.
   */
  var UN_STATES = ['roomy', '', 'q1', 'compact q1', 'compact q1 q2', 'compact q1 q2 q3', 'compact q1 q2 q3 q4'];
  function sizeUpNext() {
    var lower = document.querySelector('.w-lower'), card = $('upNext');
    var H = lower.offsetHeight, W = Math.min(lower.offsetWidth, 520);
    if (!H || !W) return;
    if (window.innerWidth > window.innerHeight * 1.25) {
      // side-by-side layout: the card may also use the empty space under the readout
      H = Math.max(H, window.innerHeight - 12 - lower.getBoundingClientRect().top);
    }
    var S = typeof ring !== 'undefined' && ring && ring.geo ? ring.geo.S : 300;
    var wasHidden = card.hidden;
    if (wasHidden) { card.style.visibility = 'hidden'; card.hidden = false; }
    var cap = Math.min(W * 0.47, S * 0.62, 230);
    var fig, i, cls;
    function apply(state, f) {
      card.className = 'upnext' + (state ? ' ' + state : '');
      card.style.setProperty('--un-fig', Math.round(f) + 'px');
      return card.offsetHeight <= H + 0.5;
    }
    var fits = false;
    for (i = H < 230 ? 3 : 0; i < UN_STATES.length && !fits; i++) {
      cls = UN_STATES[i];
      var compact = cls.indexOf('compact') >= 0;
      fig = Math.max(56, Math.min(cap, compact ? H - 20 : H - 28 - 50 - 12));
      if (cls === 'roomy' && fig < 140) continue;
      fits = apply(cls, fig);
    }
    while (!fits && fig > 56) { fig = Math.max(56, fig * 0.86); fits = apply(cls, fig); }
    if (wasHidden) { card.hidden = true; card.style.visibility = ''; }
  }
  Ring.prototype.draw = function (dt) {
    if (!this.resize()) return;
    if (this.needs > 0) this.needs--;
    var ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    // colour changes ease in; a quick switch (swipe armed) settles in ~120 ms
    var k = 1 - Math.exp(-dt * (performance.now() < (this.fastUntil || 0) ? 28 : 5));
    for (var i = 0; i < 3; i++) { this.a[i] += (this.ta[i] - this.a[i]) * k; this.b[i] += (this.tb[i] - this.b[i]) * k; }
    this.beat *= Math.exp(-dt * 4);
    this.hot *= Math.exp(-dt * 2.5);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.drawStudio(ctx, w, h, dt);
  };

  /** Studio ring: one thick gradient arc with a shaded end cap, nothing else. */
  Ring.prototype.drawStudio = function (ctx, w, h, dt) {
    var light = LOOKS[look].scheme === 'light';
    var g = this.geo;
    var S = g.S, cx = Math.round(g.cx), cy = Math.round(g.cy);
    var th = g.th;
    var R = g.R;
    var A0 = g.A0, SW = g.SW, A1 = A0 + SW;
    var prog = Math.max(0, Math.min(1, this.progress));
    var a1 = A0 + SW * prog;
    var ca = this.a, cb = this.b;
    var ink = light ? [17, 19, 24] : [244, 245, 247];
    var breathing = this.breathe != null;

    // breathing pacer (set break): a soft glow that fills and empties
    if (breathing) {
      var bt = this.breathe % 10;
      var bv = bt < 4 ? easeInOut(bt / 4) : 1 - easeInOut((bt - 4) / 6);
      var by = g.fy, bmax = Math.min(R - th, g.fh * 0.66);
      var br = bmax * (0.55 + 0.45 * bv);
      var pg = ctx.createRadialGradient(cx, by, br * 0.15, cx, by, br);
      pg.addColorStop(0, rgba(ca, 0));
      pg.addColorStop(0.7, rgba(ca, (light ? 0.08 : 0.07) + 0.07 * bv));
      pg.addColorStop(1, rgba(ca, 0));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(cx, by, br, 0, TAU); ctx.fill();
    }

    // track (dashed during jumping jacks so the phase reads without colour)
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(ca, light ? 0.2 : 0.16);
    ctx.lineWidth = th;
    if (this.dashed) {
      // jumping jacks: beads for the time left, small dots for the time gone (non-colour cue)
      var nB = 48, stepB = SW / nB, span = prog * SW, k, ang, u;
      ctx.fillStyle = ctx.strokeStyle;
      var fadeK = Math.floor(span / stepB + 1e-6) + 1, fadeA = (span / stepB) % 1;
      for (k = 0; k <= nB; k++) {
        if (k * stepB <= span + 1e-6) continue;
        ctx.globalAlpha = k === fadeK ? 1 - Math.min(1, fadeA) : 1; // no bullseye under the fading bead
        ang = A0 + k * stepB;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, th * 0.15, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (this.hot > 0.01) { ctx.shadowColor = rgba(ca, (light ? 0.28 : 0.55) * this.hot); ctx.shadowBlur = th; }
      for (k = 0; k * stepB <= span + 1e-6 && k <= nB; k++) {
        u = span ? k * stepB / span : 1;
        ang = A0 + k * stepB;
        ctx.fillStyle = rgba([cb[0] + (ca[0] - cb[0]) * u, cb[1] + (ca[1] - cb[1]) * u, cb[2] + (ca[2] - cb[2]) * u], 1);
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, th * 0.31, 0, TAU); ctx.fill();
      }
      // the next bead fades out smoothly instead of popping
      var frac = (span / stepB) % 1;
      if (k <= nB && frac > 0.01) {
        ang = A0 + k * stepB;
        ctx.fillStyle = rgba(ca, Math.min(1, frac));
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, th * 0.31, 0, TAU); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)';
    } else {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, R, A0, A1); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    if (prog > 0.001 && !this.dashed) {
      var grad;
      if (ctx.createConicGradient) {
        grad = ctx.createConicGradient(A0, cx, cy);
        var pf = prog * SW / TAU;
        grad.addColorStop(0, rgba(cb, 1));
        grad.addColorStop(Math.max(0.001, pf), rgba(ca, 1));
        grad.addColorStop(Math.min(1, pf + 0.001), rgba(ca, 1));
        grad.addColorStop(1, rgba(ca, 1));
      } else grad = rgba(ca, 1);
      // tail cap in the tail colour, butt-ended arc, then the head cap: no seams
      var capR = this.dashed ? th * 0.31 : th / 2;
      ctx.fillStyle = rgba(cb, 1);
      ctx.beginPath(); ctx.arc(cx + Math.cos(A0) * R, cy + Math.sin(A0) * R, capR, 0, TAU); ctx.fill();
      if (this.hot > 0.01) { ctx.shadowColor = rgba(ca, (light ? 0.28 : 0.55) * this.hot); ctx.shadowBlur = th * 1.2; }
      ctx.strokeStyle = grad;
      ctx.lineWidth = th;
      if (this.dashed) {
        // the live arc becomes a run of beads during jacks, readable without colour
        var dseg = SW * R / 48;
        ctx.setLineDash([0.01, dseg]); ctx.lineCap = 'round'; ctx.lineWidth = th * 0.62;
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, A0, a1); ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.lineWidth = th;
      ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)';

      // head cap with a soft shadow ahead of it, kept inside the ring band
      var hx = cx + Math.cos(a1) * R, hy = cy + Math.sin(a1) * R;
      var tx = -Math.sin(a1), ty = Math.cos(a1);
      var sx = hx + tx * th * 0.3, sy = hy + ty * th * 0.3;
      if (!this.dashed) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R + th / 2, 0, TAU); ctx.arc(cx, cy, R - th / 2, 0, TAU, true); ctx.clip();
        var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, th * 0.7);
        sg.addColorStop(0, light ? 'rgba(17,19,24,0.10)' : 'rgba(0,0,0,0.30)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(sx, sy, th * 0.7, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = rgba(ca, 1);
      ctx.beginPath(); ctx.arc(hx, hy, this.dashed ? th * 0.4 : capR, 0, TAU); ctx.fill();
    }

    // phase-change ripple: one thin ring easing outward
    for (var i = this.shocks.length - 1; i >= 0; i--) {
      var s = this.shocks[i];
      s.t += dt * 1.4;
      if (s.t >= 1) { this.shocks.splice(i, 1); continue; }
      var e = 1 - Math.pow(1 - s.t, 3);
      ctx.strokeStyle = rgba(ca, (1 - s.t) * 0.45 * s.s);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R + th * 0.6 + e * S * 0.05, A0, A1); ctx.stroke();
    }
  };

  // ================================================================ FX
  // Celebration confetti on the finish screen.
  var fx = {
    c: $('fx'), ctx: $('fx').getContext('2d'), parts: [], w: 0, h: 0, dpr: 1, dirty: false,
    resize: function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth, h = window.innerHeight;
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w; this.h = h; this.dpr = dpr;
        this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      }
    },
    confetti: function (colors) {
      if (reduced) return;
      var W = window.innerWidth, Hh = window.innerHeight;
      for (var i = 0; i < 40; i++) {
        var fromLeft = i % 2 === 0;
        var a = fromLeft ? -Math.PI / 3 - Math.random() * 0.5 : -2 * Math.PI / 3 + Math.random() * 0.5;
        var sp = Hh * (0.9 + Math.random() * 0.9);
        this.parts.push({ x: fromLeft ? -10 : W + 10, y: Hh * 0.85, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: Hh * 0.9, drag: 0.985, life: 1, decay: 0.28 + Math.random() * 0.25,
          size: 4 + Math.random() * 6, c: hexRgb(colors[(i >> 1) % colors.length]), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
      }
    },
    draw: function (dt) {
      if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
      if (!this.parts.length) {
        if (this.dirty) { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.c.width, this.c.height); this.dirty = false; }
        return;
      }
      this.resize();
      this.dirty = true;
      var ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      for (var i = this.parts.length - 1; i >= 0; i--) {
        var p = this.parts[i];
        p.life -= dt * p.decay;
        if (p.life <= 0 || p.y > this.h + 40) { this.parts.splice(i, 1); continue; }
        var drag = Math.pow(p.drag, dt * 60);
        p.vx *= drag; p.vy = p.vy * drag + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.c, Math.min(1, p.life * 1.5));
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * (0.4 + Math.abs(Math.sin(p.rot * 2))));
        ctx.restore();
      }
    }
  };

  // ================================================================ WORKOUT
  var ring = new Ring($('ring'));
  var workFig = null, nextFig = null;
  var run = null;
  var wakeLock = null;

  var lockPending = false;
  function lockScreen() {
    if (wakeLock || lockPending || document.hidden) return;
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        lockPending = true;
        navigator.wakeLock.request('screen').then(function (l) {
          lockPending = false;
          if (!run || run.finished) { l.release().catch(noop); return; }
          wakeLock = l;
          l.addEventListener('release', function () { if (wakeLock === l) wakeLock = null; });
        }).catch(function () { lockPending = false; });
      }
    } catch (e) { lockPending = false; }
  }
  function unlockScreen() {
    try { if (wakeLock) wakeLock.release().catch(noop); } catch (e) { /* ignore */ }
    wakeLock = null;
  }
  function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ } }

  function startWorkout(ids) {
    var v = H.validate(ids);
    if (!v.ok) { $('startError').textContent = v.reason; return; }
    A.unlock();
    if (A.get('voice') && !A.voiceSupported()) notice(VOICE_HELP);
    var tl = H.buildTimeline(ids, state.level, { warmup: state.warmup });
    run = {
      tl: tl, ids: tl.exercises.slice(), level: state.level,
      base: 0, anchor: performance.now(), playing: true,
      segIdx: -1, lastWhole: null, lastClock: -1, coachIdx: -1, figSwapped: false,
      played: tl.segments.map(function () { return 0; }), lastT: 0, cuePending: -1, finished: false
    };
    showScreen('workout');
    if (!workFig) workFig = makeFig($('fig'), { exercise: ids[0], primary: PHASE.prep.colors[0], secondary: PHASE.prep.colors[1], quality: 'high', energy: 0.6 });
    if (!nextFig) nextFig = makeFig($('nextFig'), { exercise: tl.exercises[0], primary: PHASE.prep.colors[0], secondary: PHASE.prep.colors[1], quality: 'high', fps: 30, energy: 0.45 });
    run.mode = null;
    guardHistory();
    buildProgress(tl);
    setPauseUi(false);
    lockScreen();
    requestAnimationFrame(function () { focusOn($('stage')); });
    update();
    $('pause').focus({ preventScroll: true });
  }

  function elapsedNow() {
    if (!run) return 0;
    return run.playing ? run.base + (performance.now() - run.anchor) / 1000 : run.base;
  }

  function seek(t) {
    if (!run) return;
    run.base = Math.max(0, Math.min(run.tl.total, t));
    run.anchor = performance.now();
    run.lastT = run.base; // jumps don't count as time trained
    run.lastWhole = null;
    ring.needs = 2;
    update();
  }

  /** Credit real clock time between `from` and `to` to the intervals it passed through. */
  function creditTime(from, to) {
    var segs = run.tl.segments;
    for (var i = Math.max(0, H.segmentAt(run.tl, from)); i < segs.length && segs[i].start < to; i++) {
      var o = Math.min(to, segs[i].end) - Math.max(from, segs[i].start);
      if (o > 0) run.played[i] += o;
    }
  }
  function playedStats() {
    var segs = run.tl.segments, total = 0, active = 0, perEx = {}, planned = 0;
    for (var i = 0; i < segs.length; i++) {
      var p = run.played[i];
      total += p;
      if (segs[i].type === 'work' || segs[i].type === 'jacks') {
        active += p; planned += segs[i].duration;
        perEx[segs[i].exercise] = (perEx[segs[i].exercise] || 0) + p;
      }
    }
    return { total: total, active: active, planned: planned, perEx: perEx };
  }

  function setPlaying(on) {
    if (!on && carousel) carousel.clearKeys(); // pausing stops queued arrow presses too
    if (!run || run.finished || on === run.playing) return;
    run.base = elapsedNow();
    run.anchor = performance.now();
    run.playing = on;
    setPauseUi(!on);
    if (on) {
      lockScreen();
      if (run.cuePending === run.segIdx) { run.cuePending = -1; cueSegment(run.tl.segments[run.segIdx]); }
      else A.play('click');
    } else {
      A.stopVoice(); A.sleep();
      if (run.warm && !run.warm.go) run.warm.said = false; // "Begin!" was cut: the start signal carries it on resume
    }
  }
  /** Stop the clock without showing the pause screen (dialogs, guide). */
  function pauseQuietly() {
    if (carousel) carousel.clearKeys();
    if (!run || !run.playing) return;
    run.base = elapsedNow(); run.anchor = performance.now(); run.playing = false;
    A.stopVoice();
    if (run.warm && !run.warm.go) run.warm.said = false; // a cut "Begin!": the start signal carries it on resume
    A.sleep();
    if (workFig) workFig.setPlaying(false);
    if (nextFig) nextFig.setPlaying(false);
    ring.paused = true;
    bg.setRunning(false);
    syncPauseButton(true);
  }

  function syncPauseButton(paused) {
    var btn = $('pause');
    btn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    btn.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  }

  var veilGuard = 0;
  function setPauseUi(paused) {
    var veil = $('pausedVeil');
    if (paused && veil.hidden) {
      // Resume lands exactly under the finger that pressed pause
      var pr = $('pause').getBoundingClientRect();
      if (pr.width) {
        veil.style.setProperty('--rx', Math.round(pr.left + pr.width / 2) + 'px');
        veil.style.setProperty('--ry', Math.round(pr.top + pr.height / 2) + 'px');
      }
      veil.classList.add('guard');
      clearTimeout(veilGuard);
      veilGuard = setTimeout(function () { veil.classList.remove('guard'); }, 500);
    }
    $('pausedVeil').hidden = !paused || !$('quitDialog').hidden || !$('coachSheet').hidden;
    setInert(!$('pausedVeil').hidden || !$('quitDialog').hidden || !$('coachSheet').hidden);
    ring.needs = 2;
    if (paused && run) {
      var seg = run.tl.segments[Math.min(run.segIdx, run.tl.segments.length - 1)];
      if (seg) {
        var what = seg.type === 'work' || seg.type === 'prep' ? exName(seg.exercise) : seg.type === 'jacks' ? H.JACKS.name
          : seg.type === 'setrest' ? 'Set break' : seg.type === 'warmup' ? warmName(seg) : 'Rest';
        $('veilStatus').textContent = what + ' · ' + clock(seg.end - elapsedNow()) + ' left · ' +
          (seg.type === 'warmup' ? 'Warm-up' : 'Set ' + seg.set + '/' + run.tl.level.sets);
      }
    }
    syncPauseButton(paused);
    syncFigs();
    ring.paused = paused;
    bg.setRunning(!paused);
    if (paused) setTimeout(function () { if (!$('pausedVeil').hidden) $('resume').focus(); }, 30);
  }

  /** Which of the two figures is on screen animates; the hidden one rests. */
  function syncFigs() {
    var live = !!(run && run.playing && !run.finished);
    if (workFig) workFig.setPlaying(live && run.mode !== 'rest');
    if (nextFig) nextFig.setPlaying(live && run.mode === 'rest');
  }

  // ---------------------------------------------------------------- session progress strip
  // One group per set (plus the warm-up), one cell per exercise, coloured by body area.
  var prog = { bySeg: {}, groups: [], warm: null, live: null };
  function buildProgress(tl) {
    var wrap = $('wpTrack');
    wrap.textContent = '';
    prog = { bySeg: {}, groups: {}, warm: null, live: null };
    function group(key, label, n) {
      var g = document.createElement('div');
      g.className = 'wp-group';
      g.style.setProperty('--n', n);
      g.dataset.label = label;
      wrap.appendChild(g);
      prog.groups[key] = g;
      return g;
    }
    if (tl.warmupEnd > 0) {
      var wg = group('w', 'Warm-up', Math.max(1.5, tl.exercises.length * 0.4));
      wg.classList.add('wp-warm');
      prog.warm = document.createElement('i');
      prog.warm.className = 'wp-cell g-warmup';
      wg.appendChild(prog.warm);
    }
    for (var s = 1; s <= tl.level.sets; s++) group(s, 'Set ' + s, tl.exercises.length);
    tl.segments.forEach(function (sg) {
      if (sg.type !== 'work') return;
      var c = document.createElement('i');
      c.className = 'wp-cell g-' + H.get(sg.exercise).group;
      prog.groups[sg.set].appendChild(c);
      prog.bySeg[sg.index] = c;
    });
  }
  function updateProgress(seg) {
    var tl = run.tl, idx = seg.index, sets = tl.level.sets, nEx = tl.exercises.length;
    var restMode = seg.type === 'prep' || seg.type === 'rest' || seg.type === 'setrest';
    var nextWork = restMode || seg.type === 'jacks' ? H.nextWorkIndex(tl, idx) : -1;
    Object.keys(prog.bySeg).forEach(function (k) {
      var c = prog.bySeg[k], i = +k;
      c.classList.toggle('is-done', i < idx);
      c.classList.toggle('is-now', i === idx);
      c.classList.toggle('is-next', i === nextWork); // during rest: where you're headed
      c.style.setProperty('--p', i < idx ? 1 : 0);
    });
    if (prog.warm) {
      var wDone = seg.type !== 'warmup';
      prog.warm.classList.toggle('is-done', wDone);
      prog.warm.classList.toggle('is-now', !wDone);
      prog.warm.style.setProperty('--p', wDone ? 1 : 0);
    }
    var curSet = seg.type === 'warmup' ? 0 : seg.set;
    Object.keys(prog.groups).forEach(function (k) {
      var g = prog.groups[k], n = k === 'w' ? 0 : +k;
      var done = k === 'w' ? curSet > 0 : n < curSet || (n === curSet && seg.type === 'setrest');
      g.classList.toggle('is-done', done);
      g.classList.toggle('is-cur', !done && n === curSet);
    });
    prog.live = seg.type === 'work' ? prog.bySeg[idx] : seg.type === 'warmup' ? prog.warm : null;

    var setTxt, leftTxt;
    function sets_(n) { return n + (n === 1 ? ' set' : ' sets'); }
    if (seg.type === 'warmup') {
      setTxt = 'Warm-up';
      leftTxt = '';
    } else if (seg.type === 'setrest') {
      setTxt = 'Set ' + seg.set + ' of ' + sets + ' done';
      leftTxt = sets_(sets - seg.set) + ' left';
    } else {
      var more = sets - seg.set;
      setTxt = 'Set ' + seg.set + ' of ' + sets;
      leftTxt = more > 0 ? sets_(more) + ' left after this' : 'Final set';
    }
    $('wpSet').textContent = setTxt;
    $('wpLeft').textContent = leftTxt;
    $('wpLeft').hidden = !leftTxt;
    $('wpSkip').hidden = seg.type !== 'warmup';
  }

  /** The rest screen's "Up next" card: name, body area and a live demo of what's coming. */
  function showUpNext(seg) {
    var tl = run.tl;
    var id = seg.type === 'prep' ? seg.exercise : seg.next;
    var ex = id ? H.get(id) : null;
    if (!ex) return;
    var n = tl.exercises.indexOf(id) + 1, of = tl.exercises.length;
    $('unK').textContent = seg.type === 'prep' ? 'First up · 1 of ' + of
      : seg.type === 'setrest' ? 'Set ' + (seg.set + 1) + ' · first up'
      : 'Up next · ' + n + ' of ' + of;
    // when the card is too small for its label row, "Next ·" folds into the name line
    var pre = seg.type === 'prep' ? 'First' : seg.type === 'setrest' ? 'Set ' + (seg.set + 1) : 'Next';
    $('unName').innerHTML = '<span class="un-pre">' + esc(pre) + ' · </span>' + esc(ex.name);
    $('unMeta').innerHTML = '<b>' + esc(H.GROUPS[ex.group].label) + '</b><span class="un-mus"> · ' + esc(ex.muscles) + '</span>';
    // a narrow card shows just "Start" (the card already names the set); the button's aria-label has it all
    $('unStartText').innerHTML = '<span class="un-long">' + (seg.type === 'setrest' ? 'Start set ' + (seg.set + 1) : 'Start now') + '</span><span class="un-short">Start</span>';
    // a 30 s rest is part of the workout: starting early is possible, not encouraged
    $('unStart').classList.toggle('quiet', seg.type === 'rest');
    $('unStart').setAttribute('aria-label', (seg.type === 'setrest' ? 'Start set ' + (seg.set + 1) : 'Start now') + ': ' + ex.name);
    var c = PHASE[seg.type].colors; // the card wears the phase colour, never a work colour
    if (nextFig) { nextFig.setExercise(id); nextFig.setColors(c[0], c[1]); nextFig.pulse(); }
    sizeUpNext();
  }

  function exName(id) { var e = H.get(id); return e ? e.name : ''; }
  function spoken(id) { return exName(id).toLowerCase(); }
  function clock(sec) { return H.formatTime(Math.ceil(Math.max(0, sec) - 1e-6)); }

  // ---------------------------------------------------------------- warm-up helpers
  var COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  /** Figure animation for an exercise or warm-up move id (guide uses the left side / slow pace). */
  function figIdFor(id) { return { jog: 'jog-slow', hamstring: 'hamstring-l', calf: 'calf-l' }[id] || id; }
  function warmFigId(seg) {
    if (seg.move === 'jog') return seg.pace === 'quick' ? 'jog-quick' : 'jog-slow';
    if (seg.move === 'hamstring' || seg.move === 'calf') return seg.move + '-' + (seg.side === 'right' ? 'r' : 'l');
    return seg.move;
  }
  /**
   * How the stage figure shows a warm-up step at clock time t. Counted moves loop on the
   * count: one jumping jack per beat, a squat over two beats (down on 1, up on 2), a stretch
   * per count of 4 (deepest on beat 2). Through the lead-in the move is demonstrated, then
   * the figure waits in its start pose for the countdown (`ready`); startMove() starts the
   * loop on BEGIN, so beat 1 is the first rep.
   */
  function warmFigOpts(seg, t) {
    var o = {};
    if (seg.counts) o.period = warmPeriod(seg);
    // the move is demonstrated without a break through the lead-in and the countdown, its loop
    // timed so a fresh rep starts exactly on the go (clock time 0)
    if (seg.lead) o.time = t - seg.start - seg.lead;
    return o;
  }
  function warmPeriod(seg) { return seg.move === 'jacks' ? seg.beat : seg.move === 'squat' ? 2 * seg.beat : seg.beats * seg.beat; }
  /**
   * The stage figure on the count: its loop runs on its own clock from BEGIN, which a stalled
   * frame (phone speech can block the page for 100–300 ms; a frame step is capped) or a jump
   * within the step would leave off the beat for the rest of the count. Once it is more than
   * 40 ms out of phase its clock is put right at once; up to 150 ms off, what it shows catches
   * up over 120–240 ms instead of popping (a bigger jump follows a visible freeze or a seek).
   */
  function lockFig(seg, t, lead) {
    if (!workFig || !workFig.setTime || !run.playing) return;
    var want = t - seg.start - seg.lead, per = warmPeriod(seg);
    var d = (workFig.getTime() - want) / per, off = Math.abs(d - Math.round(d)) * per;
    // in the lead-in (after a hold for the coach) it glides back onto the count, even from far
    if (off > 0.04) workFig.setTime(want, lead ? Math.min(1, Math.max(0.12, 2 * off)) : off <= 0.15 ? 0.12 : 0);
  }
  function warmName(seg) {
    if (seg.move === 'jog') return seg.pace === 'quick' ? 'Quick jog' : 'Slow jog';
    return exName(seg.move) + (seg.side ? ' · ' + (seg.side === 'left' ? 'Left' : 'Right') : '');
  }
  // how the coach names a warm-up move, and one short form cue (kept brief: the countdown follows)
  var WARM_SAY = { jog: 'jogging on the spot', pecstretch: 'chest stretch' };
  /** Was most of the warm-up actually done (not skipped)? */
  function warmedUp() {
    var segs = run.tl.segments, done = 0;
    for (var i = 0; i < segs.length && segs[i].type === 'warmup'; i++) done += run.played[i];
    return done >= run.tl.warmupEnd * 0.6;
  }
  /** What the coach says as a warm-up step begins (before its 5, 4, 3, 2, 1). */
  function warmAnnounce(seg, pv) {
    var first = !pv || pv.type !== 'warmup';
    // the brief has already welcomed you
    if (first) return 'Let\u2019s warm up. First, jogging on the spot, nice and easy.';
    if (pv.move === seg.move && pv.side !== seg.side) return 'Switch to your ' + seg.side + ' leg.';
    if (pv.move === seg.move) return seg.pace === 'quick' ? 'Quick jog!' : 'Back to an easy jog.'; // pace change, no countdown
    // "Next warm-up: jumping jacks. Five counts of four." (the form tip is on screen, in the Form card)
    return 'Next warm-up: ' + (WARM_SAY[seg.move] || spoken(seg.move)) + (seg.side ? ', ' + seg.side + ' leg.' : '.') +
      (seg.counts ? ' ' + cap(COUNT_WORDS[seg.counts - 1]) + ' counts of ' + COUNT_WORDS[seg.beats - 1] + '.' : '');
  }
  var WARM_WORD = { jacks: 'JACKS', squat: 'SQUATS', pecstretch: 'STRETCH', hamstring: 'STRETCH', calf: 'STRETCH', jog: 'JOG' };

  /** What the trainer panel cycles through during a segment, and how fast. */
  function coachPlan(seg) {
    var ex = H.get(seg.exercise);
    var nx = seg.next ? H.get(seg.next) : null;
    function steps(e, named) { return e.steps.map(function (s, i) { return { k: 'Step ' + (i + 1) + ' of ' + e.steps.length + (named ? ' · ' + e.name : ''), v: s }; }); }
    switch (seg.type) {
      case 'prep':
        return { period: 5, items: [{ k: 'Setup', v: ex.steps[0] }, { k: 'Form', v: ex.cue }] };
      case 'work':
        return { period: 7.5, items: [{ k: 'Form', v: ex.cue }].concat(
          ex.cues.slice(0, 2).map(function (c) { return { k: 'Form', v: c }; }),
          [{ k: 'Breathing', v: ex.breathe }]) };
      case 'jacks': {
        var up = nx ? [{ k: 'Up next · ' + nx.name, v: nx.steps[0] }] : [];
        return { period: 6, items: [{ k: 'Form', v: H.JACKS.cue }].concat(up,
          [{ k: 'Breathing', v: H.JACKS.breathe }], up.length ? [{ k: 'Up next · ' + nx.name, v: nx.cue }] : []) };
      }
      case 'rest':
        return { period: 7.5, items: nx ? steps(nx) : [{ k: 'Recover', v: H.REST.cue }] };
      case 'warmup': {
        var m = H.get(seg.move);
        return { period: 5, items: [{ k: 'Form', v: m.cue }].concat(
          m.cues.slice(0, 2).map(function (c) { return { k: 'Form', v: c }; }),
          [{ k: 'Breathing', v: m.breathe }]) };
      }
      case 'setrest': {
        var items = [];
        var tips = H.SET_BREAK_TIPS;
        var st = nx ? steps(nx, true) : [];
        for (var i = 0; i < Math.max(tips.length, st.length); i++) {
          if (tips[i]) items.push({ k: 'Recovery', v: tips[i] });
          if (st[i]) items.push(st[i]);
        }
        return { period: 10, items: items };
      }
    }
    return { period: 10, items: [] };
  }

  /** The exercise the "How to" button explains right now. */
  function guideTarget(seg) {
    if (seg.type === 'warmup') return seg.move;
    if (seg.type === 'work' || seg.type === 'prep') return seg.exercise;
    if (seg.type === 'jacks') return 'jacks';
    return seg.next || run.tl.exercises[0];
  }

  /** Chip, title, meta line and countdown label for an interval (the screen and the swipe preview share it). */
  function headFor(seg) {
    var tl = run.tl, nEx = tl.exercises.length, ex = H.get(seg.exercise), nx = seg.next ? H.get(seg.next) : null;
    // the next move's name inside the ring only when the ring is big enough to hold it
    var big = !!(ring.geo && ring.geo.S >= 300);
    var h = { chip: PHASE[seg.type].chip };
    if (seg.type === 'warmup') {
      h.name = seg.move === 'jog' ? warmName(seg) : exName(seg.move); h.label = seg.counts ? 'Count' : 'Time left';
      h.ex = esc('Move ' + seg.step + ' of ' + seg.steps + (seg.side ? ' · ' + (seg.side === 'left' ? 'Left' : 'Right') + ' side' : ''));
    } else if (seg.type === 'prep') {
      h.name = 'Get into position'; h.label = big && ex.name.length <= 14 ? ex.name + ' in' : 'Starting in';
      h.ex = esc('Set 1 · ' + nEx + ' exercises');
    } else if (seg.type === 'work') {
      h.name = ex.name; h.label = 'Time left';
      h.ex = '<span class="ex-word">Exercise </span>' + (seg.slot + 1) + ' of ' + nEx + ' · <b>' + esc(H.GROUPS[ex.group].label) + '</b>';
    } else if (seg.type === 'jacks') {
      h.name = H.JACKS.name; h.label = 'Time left';
      h.ex = esc(seg.setBreak ? 'Keep moving · then a break' : nx ? 'Keep moving' : 'Last push');
    } else if (seg.type === 'rest') {
      h.name = 'Rest'; h.label = nx && big && nx.name.length <= 14 ? nx.name + ' in' : 'Next in';
      h.ex = esc(seg.duration + ' s · breathe');
    } else {
      h.name = 'Set ' + seg.set + ' complete'; h.label = 'Set ' + (seg.set + 1) + ' in';
      h.ex = esc((seg.duration >= 60 ? seg.duration / 60 + ' minute' : seg.duration + ' second') + ' break');
    }
    return h;
  }
  /** No label inside small rings (or short landscape ones): the countdown gets the room. */
  function dialBare() { return !!(ring.geo && (ring.geo.S < 300 || (window.innerWidth > window.innerHeight && ring.geo.fh < 200))); }

  /** An interval's name for a button label: "rest", "Push Ups", "calf stretch, right side". */
  function labelName(sg) {
    return sg.type === 'warmup' && sg.side ? exName(sg.move).toLowerCase() + ', ' + sg.side + ' side' : segName(sg);
  }
  /** ⏭ says what it will do: "Skip to rest", "Start now: Push Ups", "Finish workout"... */
  function syncSkipLabel(seg) {
    var nx = run.tl.segments[seg.index + 1], label;
    if (!nx) label = 'Finish workout';
    else if (seg.type === 'prep' || seg.type === 'rest' || seg.type === 'setrest') label = (seg.type === 'setrest' ? 'Start set ' + (seg.set + 1) : 'Start now') + ': ' + exName(seg.next || seg.exercise);
    else if (seg.type === 'warmup') label = nx.type === 'warmup' ? 'Next warm-up move: ' + labelName(nx) : 'Finish warm-up';
    else label = 'Skip to ' + labelName(nx);
    $('skip').setAttribute('aria-label', label);
  }
  /** ⏮ says what it will do: "Restart Push Ups", "Back to rest", "Redo Push Ups". */
  function syncPrevLabel() {
    if (!run || run.finished) return;
    var b = backTarget(), name = b.seg ? labelName(b.seg) : '';
    var label = b.kind === 'restart' ? 'Restart ' + name : b.kind === 'redo' ? 'Redo ' + name : 'Back to ' + name;
    var btn = $('prev');
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
  }
  // the buttons' own icons in a tip (not emoji), with words for screen readers
  var ICON_NEXT = '<svg aria-hidden="true"><use href="#i-next"/></svg><span class="sr-only">the skip button</span>';
  var ICON_PREV = '<svg aria-hidden="true"><use href="#i-prev"/></svg><span class="sr-only">the back button</span>';
  /** A short line in the progress row (where "N sets left" sits) for a few seconds. */
  var tipT = 0;
  function showTip(html, ms) {
    var tip = $('wpTip');
    tip.innerHTML = html;
    tip.hidden = false; $('wProg').classList.add('tipping');
    clearTimeout(tipT);
    tipT = setTimeout(function () { tip.hidden = true; $('wProg').classList.remove('tipping'); }, ms);
  }
  /** ⏭ / ⏮ glow once: "this is where that lives". With reduced motion: a still halo for a moment. */
  function pulseCtl(btn) {
    if (reduced) {
      btn.classList.add('halo');
      clearTimeout(btn._haloT);
      btn._haloT = setTimeout(function () { btn.classList.remove('halo'); }, 1500);
      return;
    }
    btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
  }

  function enterSegment(idx) {
    var tl = run.tl, seg = tl.segments[idx], ph = PHASE[seg.type];
    run.segIdx = idx;
    run.lastWhole = null;
    run.coachIdx = -1;
    run.figSwapped = false;
    run.inhale = null;
    run.lastBeat = null;
    run.getSet = false;
    run.warm = null;
    $('workout').classList.remove('final10', 'final3', 'beat', 'wu-lead');
    document.body.dataset.phase = seg.type;
    var prevSeg = tl.segments[idx - 1];
    var c = ph.colors;

    bg.setMood(c[0], c[1], ph.energy);
    bg.flashNow();
    ring.setColors(c[0], c[1]);
    ring.a = ring.ta.slice(); ring.b = ring.tb.slice(); // snap: no muddy blend mid-flash
    var restMode = seg.type === 'prep' || seg.type === 'rest' || seg.type === 'setrest';
    run.mode = restMode ? 'rest' : 'active';
    $('workout').dataset.mode = run.mode;
    // the page tint keeps its colour while it fades out after a rest
    if (restMode) $('workout').style.setProperty('--tint', c[0]);
    $('upNext').hidden = !restMode;
    $('dial').setAttribute('aria-hidden', 'true');
    syncFigs();
    ring.breathe = seg.type === 'setrest' || seg.type === 'rest' ? 0 : null;
    ring.dashed = seg.type === 'jacks';
    if (!run.quiet) { ring.shock(1); ring.hot = 1; }

    if (restMode) showUpNext(seg);
    else if (workFig) {
      if (seg.type === 'warmup') workFig.setExercise(warmFigId(seg), warmFigOpts(seg, elapsedNow()));
      else workFig.setExercise(seg.exercise);
      workFig.setColors(c[0], c[1]);
      workFig.setEnergy(ph.energy);
      if (!run.quiet) workFig.pulse();
    }

    // header + labels
    var level = tl.level;
    var nEx = tl.exercises.length;
    var ex = H.get(seg.exercise);
    var nx = seg.next ? H.get(seg.next) : null;
    var hd = headFor(seg);
    $('phaseChip').textContent = hd.chip;
    $('wEx').innerHTML = hd.ex;
    var name = hd.name, label = hd.label, sub;
    if (seg.type === 'warmup' && seg.lead) label = 'Get ready';
    var flashWord = ph.flash;
    $('beats').hidden = !(seg.type === 'warmup' && seg.counts); // kept in the layout (invisible) during the lead-in: no jump at BEGIN
    if (seg.type === 'warmup') {
      sub = warmName(seg);
      if (prevSeg && prevSeg.type === 'warmup') {
        // one wipe per new move; a side swap says SWITCH; a pace change needs no wipe
        flashWord = prevSeg.move !== seg.move ? WARM_WORD[seg.move] : prevSeg.side !== seg.side ? 'SWITCH' : '';
      }
    } else if (seg.type === 'prep') sub = 'First up · ' + ex.name;
    else if (seg.type === 'work') sub = (seg.slot === 0 && seg.set > 1 ? 'Set ' + seg.set + ' · ' : '') + ex.name;
    else if (seg.type === 'jacks') sub = seg.setBreak ? 'Then a 5:00 break' : nx ? 'Next · ' + nx.name : 'Last push';
    else if (seg.type === 'rest') sub = nx ? 'Next · ' + nx.name : 'Breathe';
    else sub = 'Set ' + seg.set + ' of ' + level.sets + ' complete';
    if (run.quiet) flashWord = ''; // a swipe already showed the change
    $('wName').textContent = name;
    fitName();
    $('dLabel').textContent = label;
    if (restMode) {
      $('dialK').textContent = label;
      $('dialSub').textContent = '';
      $('dial').classList.toggle('bare', dialBare());
    }
    var mins = seg.duration >= 60 ? (seg.duration / 60) + ' minutes' : seg.duration + ' seconds';
    $('srStatus').textContent = seg.type === 'work' ? 'Work: ' + name + ', ' + mins + '.'
      : seg.type === 'jacks' ? 'Jumping jacks, ' + mins + '.'
      : seg.type === 'rest' ? 'Rest ' + mins + '. Next: ' + (nx ? nx.name : '') + '.'
      : seg.type === 'setrest' ? 'Set ' + seg.set + ' complete. Break, ' + mins + '.'
      : seg.type === 'warmup' ? 'Warm-up: ' + name + (seg.counts ? ', ' + seg.counts + ' counts of ' + seg.beats + '.' : ', ' + mins + '.')
      : 'Get ready. First up: ' + ex.name + '.';
    $('howToLabel').textContent = 'How to';
    $('howTo').setAttribute('aria-label', 'How to do ' + exName(guideTarget(seg)));

    syncSkipLabel(seg);
    syncPrevLabel();

    updateProgress(seg);
    if (restMode && seg.type !== 'setrest' && !state.swipeTip) {
      state.swipeTip = true; savePrefs();
      showTip('Swipe ← or tap ' + ICON_NEXT + ' for next', 7000);
      // the slide shows the swipe; then ⏭ glows once, so "tap ⏭" points at something
      setTimeout(function () { if (carousel) carousel.nudge(); }, 1300);
      setTimeout(function () { if (run && run.mode === 'rest') pulseCtl($('skip')); }, reduced ? 600 : 2300); // (no slide with reduced motion)
    }

    // phase wipe, sound, voice
    if (flashWord) flash(flashWord, sub, false, c, seg.type);
    if (run.playing) cueSegment(seg);
    else run.cuePending = idx; // play the cues when the user resumes
  }

  /** Sound, vibration and voice for the start of an interval. */
  function cueSegment(seg) {
    if (seg.type === 'warmup') {
      var pv = run.tl.segments[seg.index - 1];
      var first = !pv || pv.type !== 'warmup';
      A.play(first && !seg.lead ? 'go' : 'halfway');
      if (seg.lead) buzz(40);
      // landed mid-countdown (undo, seek): the numbers speak for themselves
      if (!seg.lead || elapsedNow() < seg.start + seg.lead - (seg.countdown || 5) - VLEAD - GAP) A.say(warmAnnounce(seg, pv));
      return;
    }
    if (seg.type === 'work') { A.play('go'); buzz([60, 40, 120]); }
    else if (seg.type === 'rest' || seg.type === 'setrest') { A.play('rest'); buzz(80); }
    else if (seg.type === 'jacks') { A.play('jacks'); buzz([60, 40, 60]); }
    else A.play('click');

    var nextName = seg.next ? spoken(seg.next) : '';
    if (seg.type === 'prep') {
      var pw = run.tl.segments[seg.index - 1];
      var intro = pw && pw.type === 'warmup' && !run.praised && warmedUp() ? 'Warm-up done, nice work. ' : '';
      if (intro) run.praised = true;
      A.say(intro + 'Get ready. First up, ' + spoken(seg.exercise) + '.');
    }
    else if (seg.type === 'work') sayLater((seg.slot === 0 && seg.set > 1 ? 'Set ' + seg.set + '. ' : '') + spoken(seg.exercise) + '. Go!', 350);
    else if (seg.type === 'rest') sayLater('Rest. ' + (nextName ? 'Next up, ' + nextName + '.' : ''), 350);
    else if (seg.type === 'jacks') A.say('Jumping jacks! ' + (seg.setBreak ? 'Then a five minute break.' : nextName ? 'Next up, ' + nextName + '.' : 'Last one, finish strong!'));
    else if (seg.type === 'setrest') sayLater('Set ' + seg.set + ' complete. Great work. Take five minutes. Grab some water and keep moving.', 350);
  }

  /** Exercise names are never cut off: shrink to fit one line, wrap only below a floor. */
  function fitName() {
    var el = $('wName');
    el.style.fontSize = '';
    el.classList.remove('wrap');
    var w = el.clientWidth;
    if (!w || el.scrollWidth <= w + 1) return;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    var floor = window.innerWidth < 360 ? 18 : 20;
    var nfs = Math.max(floor, Math.floor(fs * w / el.scrollWidth * 0.98));
    el.style.fontSize = nfs + 'px';
    if (el.scrollWidth > w + 1) el.classList.add('wrap');
  }
  window.addEventListener('resize', function () { if (currentScreen === 'workout') fitName(); });

  var flashTimer = 0;
  function flash(text, sub, count, colors, kind) {
    var el = $('flash'), t = $('flashText');
    if (!text) return;
    if (colors) { el.style.setProperty('--c1', colors[0]); el.style.setProperty('--c2', colors[1]); }
    el.setAttribute('data-kind', kind || ''); // a phase whose wipe needs its own depth (warm-up)
    t.textContent = text;
    t.dataset.text = text;
    t.style.setProperty('--n', Math.max(3, text.length));
    var st = $('stage').getBoundingClientRect();
    if (st.width) { el.style.setProperty('--fx', Math.round(st.left + st.width / 2) + 'px'); el.style.setProperty('--fy', Math.round(st.top + st.height / 2) + 'px'); }
    $('flashSub').textContent = sub || '';
    el.classList.remove('show', 'count');
    void el.offsetWidth;
    el.classList.add('show');
    if (count) el.classList.add('count');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.classList.remove('show', 'count'); }, count ? 950 : 1400);
  }

  var digitsText = '';
  function setDigits(text, spokenLabel) {
    if (text !== digitsText || (run && run.mode === 'rest' && $('dialDigits').textContent !== text)) {
      // the dial only follows the clock in rest mode, so it never shows work numbers while fading out
      var targets = run && run.mode === 'rest' ? [$('digits'), $('dialDigits')] : [$('digits')];
      targets.forEach(function (dg) {
        var slash = text.indexOf('/');
        if (dg.children.length !== text.length || dg.dataset.slash !== String(slash)) {
          dg.dataset.slash = String(slash);
          dg.textContent = '';
          for (var i = 0; i < text.length; i++) {
            var sp = document.createElement('span');
            sp.className = text[i] === ':' ? 'd colon' : slash >= 0 && i >= slash ? 'd of' : 'd';
            dg.appendChild(sp);
          }
        }
        for (var j = 0; j < text.length; j++) dg.children[j].textContent = text[j];
        dg.classList.toggle('long', (slash >= 0 ? slash : text.length) > 2);
      });
      digitsText = text;
    }
    $('digits').setAttribute('aria-label', spokenLabel);
  }
  /** Restart a one-shot animation class on both countdowns. */
  function pulseDigits(cls) {
    [$('digits'), $('dialDigits')].forEach(function (dg) {
      dg.classList.remove('tick', 'final');
      void dg.offsetWidth;
      if (cls) dg.classList.add(cls);
    });
  }

  /** Called once per whole second of countdown (and on any jump). */
  function onSecond(seg, whole, prev) {
    syncPrevLabel(); // ⏮ goes back in the first 3 s, restarts after
    if (seg.type === 'warmup') {
      if (!seg.counts && moving(seg)) setDigits(String(whole), whole + ' seconds left');
      return;
    }
    var long = whole >= 60;
    setDigits(long ? H.formatTime(whole) : String(whole), (long ? H.formatTime(whole) : whole + ' seconds') + ' left');
    // the last 10 seconds look different: phase-coloured digits that pulse each second
    var wk = $('workout');
    wk.classList.toggle('final10', whole <= 10);
    wk.classList.toggle('final3', whole <= 3);
    var natural = prev != null && whole < prev && prev - whole <= 2 && run.playing;
    if (!natural) return;
    if (whole <= 3) {
      pulseDigits('final');
      if (A.get('sfx')) A.play(whole === 1 ? 'tickLast' : 'tick');
      else A.say(['One', 'Two', 'Three'][whole - 1]); // beeps off: the coach counts
      bg.beatNow(1);
      ring.shock(0.7);
      ring.hot = Math.max(ring.hot, 0.8);
      wk.classList.remove('beat'); void wk.offsetWidth; wk.classList.add('beat'); // edge pulse
      buzz(whole === 1 ? [40, 40, 40] : 35);
    } else if (whole <= 10) {
      // 10: a chime you can't miss; 9…4: a tick each second
      if (whole === 10) A.play('alert10');
      else if (!A.speaking()) A.play('tickSoft'); // never tick over the coach
      if (whole === 10) buzz([30, 60, 30]);
      pulseDigits('tick');
      bg.beatNow(0.35);
      ring.hot = Math.max(ring.hot, 0.45);
    } else {
      pulseDigits('tick');
      bg.beatNow(seg.type === 'work' ? 0.45 : 0.2);
      ring.beat = 1;
    }
    trainerCalls(seg, whole);
  }

  /** Spoken coaching, timed to the countdown. */
  function trainerCalls(seg, whole) {
    var ex = H.get(seg.exercise);
    var nx = seg.next ? spoken(seg.next) : '';
    if (seg.type === 'work') {
      if (whole === 20) A.say(ex.cues[(seg.set - 1) % ex.cues.length]);
      else if (whole === Math.floor(seg.duration / 2) && whole !== 20 && whole !== 10) A.play('halfway');
      else if (whole === 10) tenSeconds('Keep pushing!');
    } else if (seg.type === 'jacks') {
      if (whole === 10) tenSeconds(seg.setBreak ? 'Then your break.' : nx ? cap(nx) + ' next.' : 'Finish strong!');
    } else if (seg.type === 'rest') {
      if (whole === 10) tenSeconds(nx ? cap(nx) + ' next. Get in position.' : 'Get in position.');
    } else if (seg.type === 'setrest') {
      if (whole === 240 || whole === 180 || whole === 120) A.say((whole / 60) + ' minutes left in your break.');
      else if (whole === 60) A.say('One minute. Set ' + (seg.set + 1) + ' is coming up.');
      else if (whole === 30) A.say('Thirty seconds. First up, ' + nx + '. Get in position.');
      else if (whole === 10) tenSeconds('Get in position.');
    }
  }
  /** At 10 s the chime says "ten seconds"; the line follows once it has rung (or the coach says it all). */
  function tenSeconds(line) {
    if (A.get('sfx')) sayLater(line, 650);
    else A.say('Ten seconds. ' + line);
  }
  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }

  function updateCoach(seg, t) {
    var plan = coachPlan(seg);
    if (!plan.items.length) return;
    var i = Math.floor(Math.max(0, t - seg.start) / plan.period) % plan.items.length;
    if (i === run.coachIdx) return;
    run.coachIdx = i;
    var item = plan.items[i];
    $('coachK').textContent = item.k;
    var v = $('coachV');
    v.textContent = item.v;
    v.classList.remove('swap'); void v.offsetWidth; v.classList.add('swap');
    var tip = $('unTip');
    tip.innerHTML = '<b>' + esc(item.k) + '</b> ' + esc(item.v);
    tip.classList.remove('swap'); void tip.offsetWidth; tip.classList.add('swap');
  }

  /** The always-visible "what's next and when" line. */
  function nextLine(idx, t) {
    var tl = run.tl, segs = tl.segments, seg = segs[idx];
    var nw = H.nextWorkIndex(tl, idx);
    if (seg.type === 'warmup') {
      var ns = segs[idx + 1];
      if (!ns) return '';
      if (ns.type === 'warmup') return 'Next: <b>' + esc(warmName(ns)) + '</b> in <b>' + clock(ns.start - t) + '</b>';
      return 'Then: <b>get ready</b> in <b>' + clock(ns.start - t) + '</b>';
    }
    if (seg.type === 'prep') return '';
    if (seg.type === 'rest') return '';
    if (seg.type === 'setrest') return nw >= 0 ? 'First up: <b>' + esc(exName(segs[nw].exercise)) + '</b>' : '';
    // work or jacks
    for (var i = idx + 1; i < segs.length && (nw < 0 || i < nw); i++) {
      if (segs[i].type === 'setrest') return 'Set break in <b>' + clock(segs[i].start - t) + '</b>';
    }
    if (nw >= 0) {
      if (segs[idx + 1] && segs[idx + 1].type === 'jacks' && seg.type === 'work') {
        return 'Then <b>jumping jacks</b> → <b>' + esc(exName(segs[nw].exercise)) + '</b> in <b>' + clock(segs[nw].start - t) + '</b>';
      }
      return 'Next: <b>' + esc(exName(segs[nw].exercise)) + '</b> in <b>' + clock(segs[nw].start - t) + '</b>';
    }
    if (seg.type === 'work' && segs[idx + 1] && segs[idx + 1].type === 'jacks') return 'Then <b>30s jumping jacks</b> to finish';
    return '<b>Last interval.</b> Finish strong!';
  }

  /** Counted warm-up steps: one call per beat ("1, 2, 3, ONE"). */
  function onBeat(seg, bi, prev) {
    var count = Math.floor(bi / seg.beats) + 1, beat = bi % seg.beats + 1;
    setDigits(count + '/' + seg.counts, 'Count ' + count + ' of ' + seg.counts);
    var dots = $('beats').children;
    for (var i = 0; i < dots.length; i++) { dots[i].classList.toggle('on', i < beat); dots[i].classList.toggle('now', i === beat - 1); }
    var natural = prev != null && bi === prev + 1 && run.playing;
    // the go: "Begin!" is beat 1, so the coach picks up the count on beat 2
    if (prev == null && bi === 0 && run.playing && run.warm && run.warm.go) sayLater(countWord(seg, 1), Math.max(0, seg.beat * 1000 - 300));
    if (!natural) return;
    // the coach counts every beat ("1 2 3 4, 2 2 3 4, …"); under a working voice the ticks
    // step back so they never talk over it, and carry the rhythm when it can't play
    var ticks = !A.voiceWorks();
    if (beat === seg.beats) {
      if (ticks) A.play('beatAccent');
      bg.beatNow(0.5); ring.beat = 1;
      pulseDigits('tick');
    } else {
      if (ticks) A.play('beat');
      bg.beatNow(0.2);
    }
    // phone speech starts 0.2–0.6 s late: ask for the next beat's word just before it
    var nb = bi + 1;
    if (nb < seg.counts * seg.beats) sayLater(countWord(seg, nb), Math.max(0, seg.beat * 1000 - 300));
  }
  /** The word on the go: a counted move starts its count ("One"), a timed one hears "Begin!". */
  function goWord(seg) { return seg.counts ? countWord(seg, 0) : 'Begin!'; }
  /** What the coach says on beat index bi: the count's number on its first beat, then 2, 3, 4. */
  function countWord(seg, bi) {
    var count = Math.floor(bi / seg.beats) + 1, beat = bi % seg.beats + 1;
    return beat === 1 ? cap(COUNT_WORDS[count - 1]) : COUNT_WORDS[beat - 1];
  }

  function update() {
    if (!run || run.finished) return;
    var tl = run.tl;
    var t = elapsedNow();
    if (t > run.lastT) { creditTime(run.lastT, t); run.lastT = t; }
    var idx = H.segmentAt(tl, t);
    if (idx >= tl.segments.length) { finish(); return; }
    if (idx !== run.segIdx) enterSegment(idx);
    var seg = tl.segments[idx];
    if (seg.type === 'warmup' && seg.lead) t = warmLead(seg, t); // may hold the clock while the coach talks
    var remaining = Math.max(0, seg.end - t);
    var whole = Math.max(1, Math.ceil(remaining - 1e-6));
    if (whole !== run.lastWhole) {
      var prev = run.lastWhole; run.lastWhole = whole;
      onSecond(seg, whole, prev);
      var nl = nextLine(idx, t);
      var wn = $('wNext');
      wn.innerHTML = nl;
      wn.hidden = !nl;
    }
    if (seg.type === 'warmup' && seg.counts && moving(seg)) {
      var bi = Math.max(0, Math.min(seg.counts * seg.beats - 1, Math.floor((t - seg.start - seg.lead) / seg.beat + 1e-6)));
      if (bi !== run.lastBeat) { var pb = run.lastBeat; run.lastBeat = bi; onBeat(seg, bi, pb); }
      lockFig(seg, t);
    }
    updateCoach(seg, t);

    if (run.mode === 'rest' && remaining <= 3 && !run.getSet) {
      // the last seconds of any rest: "Get set", and the ring turns to the work colour
      run.getSet = true;
      $('dialK').textContent = 'Get set';
      $('dialSub').textContent = '';
      if (seg.type !== 'prep') { $('wName').textContent = 'Get set'; fitName(); }
      var wc = PHASE.work.colors; ring.setColors(wc[0], wc[1]);
    }
    if (seg.type === 'setrest' || seg.type === 'rest') {
      ring.breathe = t - seg.start;
      var inhale = (ring.breathe % 10) < 4;
      if (inhale !== run.inhale && remaining > 3) { run.inhale = inhale; $('dialSub').textContent = inhale ? 'Breathe in…' : 'Breathe out…'; }
    }
    if (seg.type === 'warmup' && seg.lead) {
      // two sweeps per warm-up step: the lead-in runs down to BEGIN, then the move itself
      // (so the ring empties exactly with "Starts in", and again with the last count)
      var le = seg.start + seg.lead;
      ring.progress = t < le ? (le - t) / seg.lead : remaining / (seg.duration - seg.lead);
    } else ring.progress = remaining / seg.duration;
    ring.total = t / tl.total;
    if (prog.live) {
      var pf = prog.live === prog.warm ? t / tl.warmupEnd : (t - seg.start) / seg.duration;
      prog.live.style.setProperty('--p', Math.min(1, pf).toFixed(4));
    }

    var sec = Math.floor(t);
    if (sec !== run.lastClock) {
      run.lastClock = sec;
      $('hElapsed').textContent = H.formatTime(Math.floor(t));
      $('hLeft').textContent = clock(tl.total - t);
    }
  }

  /** A warm-up step is moving (its lead-in is over). */
  function moving(seg) { return !seg.lead || !!(run.warm && run.warm.idx === seg.index && run.warm.go); }
  function leadText(title, sub) {
    if ($('wlTitle').textContent !== title) $('wlTitle').textContent = title;
    if ($('wlSub').textContent !== sub) $('wlSub').textContent = sub;
  }
  /**
   * Warm-up lead-in. The coach names the move ("Next warm-up: squats…") while
   * the screen says "Get ready · Starts in N". The countdown never starts over
   * the coach (the clock holds, up to 4 s: "Listen…") and a breath of silence
   * comes first. Then a spoken "5, 4, 3, 2, 1" (3, 2, 1 for a leg switch) with
   * a big number each second, and "Begin!" as the BEGIN wipe opens on the
   * first beat: only then the count. While the coach is counting there are no
   * ticks over the numbers; if the voice can't play, ticks carry it instead.
   */
  var VLEAD = 0.3;   // phone speech starts late: each number is asked for this early
  var GAP = 0.8;     // silence between the coach's line and the first number
  var CD_WORDS = ['One', 'Two', 'Three', 'Four', 'Five'];
  function warmLead(seg, t) {
    var cd = seg.countdown || 5;
    // a counted move takes one more second: "…two, one, Begin!", and its count opens with "One" on the go
    var slots = cd + (seg.counts ? 1 : 0);
    var leadEnd = seg.start + seg.lead, now = performance.now();
    var cs = leadEnd - slots, hp = cs - VLEAD - GAP; // countdown start; hold point
    var w = run.warm;
    if (!w || w.idx !== seg.index) w = run.warm = { idx: seg.index, counting: false, go: false, flashed: false, holdSince: 0, k: -1, vk: -1, said: false };
    if (w.go) return t;
    var wk = $('workout'), box = $('wlBox');
    wk.classList.add('wu-lead');
    var title = 'Get ready';
    // whole seconds: a half-second lead shows its first number for a full second
    var startsIn = 'Starts in ' + Math.max(1, Math.min(Math.floor(seg.lead), Math.ceil(leadEnd - t - 1e-6)));
    box.classList.remove('listen');
    if (t < hp) { box.classList.remove('runway'); leadText(title, startsIn); return t; }
    if (!w.counting) {
      if (t - hp > 0.6 || !run.playing) w.counting = true; // jumped in, or paused: no hold
      else {
        if (!w.holdSince) w.holdSince = now;
        if (A.speaking() && A.voiceWorks() && now - w.holdSince < 4000) {
          run.base = hp - 0.001; run.anchor = now; // hold: let the coach finish
          box.classList.remove('runway');
          // only a real wait says so (a line ending right on time doesn't flicker "Listen…")
          if (now - w.holdSince > 700) { leadText(title, 'Listen\u2026'); box.classList.add('listen'); }
          return run.base;
        }
        w.counting = true;
      }
    }
    if (t >= leadEnd) { w.go = true; startMove(seg, t - leadEnd < 0.6 && run.playing); return t; }
    // the voice: each number asked for VLEAD early so it lands on its second; then "Begin!"
    var vk = Math.floor(t - cs + VLEAD + 1e-6);
    if (vk !== w.vk) {
      var vnat = vk === w.vk + 1 || (w.vk >= 0 && vk === w.vk + 2); // a late frame may skip one
      w.vk = vk;
      if (vk >= 0 && vnat && run.playing) {
        if (vk < cd) A.say(CD_WORDS[cd - 1 - vk]);
        else if (vk < slots) A.say('Begin!'); // counted move: its own second before the count
        else { w.said = true; A.say(goWord(seg)); }
      }
    }
    // no more holds from here: keep the moving figure on course for a rep on the go
    if (seg.counts) lockFig(seg, t, true);
    if (t < cs) { box.classList.remove('runway'); leadText(title, startsIn); return t; }
    // the numbers: big, pulsing, one per second; 3-2-1 also pulse the screen edge
    var k = Math.min(slots - 1, Math.floor(t - cs + 1e-6));
    if (k !== w.k) {
      var natural = k === w.k + 1 || (w.k >= 0 && k === w.k + 2);
      w.k = k;
      var n = cd - k;
      box.classList.add('runway');
      leadText(n > 0 ? String(n) : 'GO', n > 0 ? 'Starts in' : '');
      box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
      if (run.playing && natural && n > 0) {
        // the coach's numbers are the countdown; without a voice the ticks carry it (louder for 3, 2, 1)
        if (A.get('sfx') && !A.voiceWorks()) A.play(n > 3 ? 'tickSoft' : n === 1 ? 'tickLast' : 'tick');
        if (n <= 3) {
          wk.classList.remove('beat'); void wk.offsetWidth; wk.classList.add('beat');
          ring.shock(0.6); ring.hot = Math.max(ring.hot, 0.7);
          buzz(n === 1 ? [40, 40, 40] : 35);
        } else bg.beatNow(0.3);
      }
    }
    // BEGIN's wipe: with the spoken "Begin!" (after "one" has had its moment); it opens as the count begins
    if (!w.flashed && run.playing && t >= leadEnd - (slots - cd) - 0.35) { w.flashed = true; flash('BEGIN', warmName(seg), false, PHASE.warmup.colors, 'warmup'); }
    return t;
  }
  /** The count (or the jog timer) begins: an obvious signal you can hear and see. */
  function startMove(seg, loud) {
    $('workout').classList.remove('wu-lead');
    $('dLabel').textContent = seg.counts ? 'Count' : 'Time left';
    $('beats').hidden = !seg.counts;
    run.lastWhole = null; run.lastBeat = null;
    // the go: the figure has been moving all along, timed to start a rep right now; put its
    // clock right in case a hold or a stalled frame left it off (lockFig keeps it there)
    if (workFig && workFig.setTime && seg.counts) lockFig(seg, elapsedNow());
    if (!loud) return;
    // a working voice says "Begin!": keep only the low thump under it, so the word stays clear
    if (A.get('sfx')) A.play(A.voiceWorks() && run.warm && run.warm.said ? 'thump' : 'start');
    else if (!(run.warm && run.warm.said)) A.say(goWord(seg));
    buzz([90, 50, 180]);
    ring.shock(1); ring.hot = 1;
  }
  /** Say something a moment later, if we're still in the same interval. */
  function sayLater(text, ms) {
    var idx = run.segIdx;
    setTimeout(function () { if (run && !run.finished && run.playing && run.segIdx === idx) A.say(text); }, ms);
  }

  function skip() {
    if (!run) return;
    var from = elapsedNow();
    var idx = H.segmentAt(run.tl, from);
    var seg = run.tl.segments[idx], next = run.tl.segments[idx + 1];
    A.play('click');
    seek(next ? next.start : run.tl.total);
    if (seg && next && seg.end - from > 4) offerUndo(skippedWhat(seg), from);
  }
  function skippedWhat(seg) {
    return seg.type === 'warmup' ? 'Skipped ' + warmName(seg).toLowerCase()
      : seg.type === 'setrest' ? 'Skipped the set break'
      : seg.type === 'rest' ? 'Skipped rest'
      : seg.type === 'prep' ? 'Started early'
      : seg.type === 'jacks' ? 'Skipped jumping jacks'
      : 'Skipped ' + exName(seg.exercise);
  }
  function skipWarmup() {
    if (!run) return;
    var from = elapsedNow();
    A.play('click'); A.stopVoice();
    seek(run.tl.warmupEnd);
    offerUndo('Skipped warm-up', from);
  }
  /** A skip throws time away; give a few seconds to take it back. */
  var undo = { at: null, timer: 0 };
  function offerUndo(text, at) {
    if (undo.at != null) { undo.n++; text = 'Moved ' + undo.n + ' times'; } // chain: undo goes back to the first one
    else { undo.at = at; undo.n = 1; }
    $('toastText').textContent = text;
    var t = $('toast');
    t.hidden = false;
    $('wProg').classList.add('undoing'); // takes the place of the "sets left" text
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(undo.timer);
    undo.timer = setTimeout(hideUndo, 8000);
  }
  function hideUndo() { clearTimeout(undo.timer); undo.at = null; $('toast').hidden = true; $('wProg').classList.remove('undoing'); }
  /**
   * Where ⏮ goes: during a rest or set break, back to the exercise you just
   * did; otherwise restart this interval, or go to the previous one if it
   * only just began.
   */
  function backTarget() {
    var tl = run.tl, t = elapsedNow(), idx = Math.min(H.segmentAt(tl, t), tl.segments.length - 1), seg = tl.segments[idx];
    if (seg.type === 'rest' || seg.type === 'setrest') {
      for (var i = idx - 1; i >= 0; i--) if (tl.segments[i].type === 'work') return { seg: tl.segments[i], kind: 'redo' };
    }
    if (t - seg.start < 3 && idx > 0) return { seg: tl.segments[idx - 1], kind: 'back' };
    return { seg: seg, kind: 'restart' };
  }
  function prev() {
    if (!run) return;
    var from = elapsedNow(), b = backTarget();
    A.play('click');
    if (b.kind === 'restart') run.segIdx = -1; // replay the entry effects for this interval
    seek(b.seg.start);
    offerUndo((b.kind === 'restart' ? 'Restarted ' : b.kind === 'redo' ? 'Redoing ' : 'Back to ') + segName(b.seg), from);
  }
  function segName(sg) {
    return sg.type === 'work' ? exName(sg.exercise) : sg.type === 'rest' ? 'rest' : sg.type === 'jacks' ? 'jumping jacks'
      : sg.type === 'setrest' ? 'the set break' : sg.type === 'prep' ? 'get ready' : warmName(sg).toLowerCase();
  }

  // ---------------------------------------------------------------- swipe carousel: left = next, right = back
  /**
   * The ring's inside is a carousel. Dragging slides what's on now out with the
   * finger and slides a preview of the destination in from the other side,
   * clipped to the ring: the next exercise's live demo, "Rest 0:30", "Restart
   * Push Ups"... The ring blends toward the destination's colour, and ⏭ / ⏮
   * charges with an arc that fills; when it's full (with a haptic tick) the
   * button turns solid and letting go does it. Pause never moves.
   *   - Rest, get ready, set break: swipe anywhere (you're at the phone).
   *   - Exercise, jacks, warm-up: only a drag that starts on the controls, and
   *     only a full charge; wipes, palms and picking the phone up do nothing.
   * Tapping ⏭ / ⏮ plays the same slide. Edges (system back), palms, dialogs and
   * the paused screen are ignored; double taps can't skip twice.
   */
  var carousel = null;
  function initSwipe() {
    var area = $('workout'), tp = $('transport'), stage = $('stage');
    var peek = $('riPeek'), pkDial = $('pkDial'), pkK = $('pkK'), pkDigits = $('pkDigits'), pkSub = $('pkSub');
    var chip = $('phaseChip'), wName = $('wName'), wEx = $('wEx'), head = document.querySelector('.w-head');
    var peekFig = null, saved = null, dest = null;
    var g = null, eatClick = false, lockUntil = 0, settleT = 0, nudgeT = 0;
    function locked() { return performance.now() < lockUntil; }
    function blocked(e) {
      return !run || run.finished || currentScreen !== 'workout' || locked() ||
        !$('pausedVeil').hidden || !$('quitDialog').hidden || !$('coachSheet').hidden ||
        (e.target.closest && e.target.closest('.w-top, .w-prog, .veil'));
    }
    function threshold() { return Math.min(110, Math.max(64, window.innerWidth * 0.2)); }
    function travel() { return 2 * (parseFloat(getComputedStyle(stage).getPropertyValue('--ri')) || 140) + 24; }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

    /** Where a move in direction dir (+1 next, -1 back) lands, and the preview of it. */
    function prepare(dir) {
      var tl = run.tl, t = elapsedNow(), idx = H.segmentAt(tl, t), sg, prefix = '';
      if (dir > 0) sg = tl.segments[idx + 1];
      else { var bt = backTarget(); sg = bt.seg; prefix = bt.kind === 'restart' ? '↺ Restart' : bt.kind === 'redo' ? '↺ Redo' : ''; }
      dest = { dir: dir, seg: sg, prefix: prefix, colors: sg ? PHASE[sg.type].colors : PHASE.done.colors };
      var dc = solidOnPage(dest.colors[0]);
      tp.style.setProperty('--dc', dc);
      tp.style.setProperty('--dfg', inkOn(dc)); // the armed button's icon
      peek.classList.remove('is-fig', 'is-dial', 'is-end');
      if (!sg) { peek.classList.add('is-end'); return; }
      var restLike = sg.type === 'prep' || sg.type === 'rest' || sg.type === 'setrest';
      if (restLike) {
        // the dial exactly as it will look: same label, digits and breathing line
        peek.classList.add('is-dial');
        pkDial.classList.toggle('bare', dialBare());
        pkK.textContent = headFor(sg).label;
        var d = sg.duration, txt = d >= 60 ? H.formatTime(d) : String(d);
        pkDigits.textContent = '';
        for (var i = 0; i < txt.length; i++) { var sp = document.createElement('span'); sp.className = txt[i] === ':' ? 'd colon' : 'd'; sp.textContent = txt[i]; pkDigits.appendChild(sp); }
        pkDigits.classList.toggle('long', txt.length > 2);
        pkSub.textContent = sg.type === 'prep' ? '' : 'Breathe in…';
        peek.style.setProperty('--c1', dest.colors[0]);
      } else {
        // the figure exactly where and how big it will be
        peek.classList.add('is-fig');
        var fid = sg.type === 'warmup' ? warmFigId(sg) : sg.exercise;
        // (a preview at 30 fps; same quality and size as the stage figure, so the hand-over is
        // seamless). A warm-up step shows its tempo and count-in as they will be on arrival.
        var fo = sg.type === 'warmup' ? warmFigOpts(sg, sg.start) : {};
        fo.instant = true;
        if (!peekFig) peekFig = makeFig($('peekFig'), { exercise: fid, primary: dest.colors[0], secondary: dest.colors[1], quality: 'high', fps: 30, energy: PHASE[sg.type].energy });
        peekFig.setExercise(fid, fo);
        peekFig.setColors(dest.colors[0], dest.colors[1], true);
        peekFig.setEnergy(PHASE[sg.type].energy, true);
        peekFig.setPlaying(true);
      }
    }
    /** Armed: the title and the ring switch to the destination, so letting go changes nothing more. */
    function arm(on) {
      if (on === tp.classList.contains('armed')) return;
      tp.classList.toggle('armed', on);
      if (on) {
        buzz(12);
        if (dest && dest.seg) {
          saved = saved || { chip: chip.textContent, name: wName.textContent, ex: wEx.innerHTML };
          var h = headFor(dest.seg);
          chip.textContent = dest.prefix || h.chip; wName.textContent = h.name; fitName();
          wEx.innerHTML = h.ex;
          // the head wears the destination's colours too
          var dr = dest.seg.type === 'prep' || dest.seg.type === 'rest' || dest.seg.type === 'setrest';
          head.style.setProperty('--c1', dest.colors[0]); head.style.setProperty('--c2', dest.colors[1]);
          head.classList.toggle('pv-active', !dr); head.classList.toggle('pv-rest', dr);
          head.classList.remove('swap'); void head.offsetWidth; head.classList.add('swap');
          ring.fastUntil = performance.now() + 300;
          ring.setColors(dest.colors[0], dest.colors[1]);
        }
      } else restoreHead();
    }
    function clearHeadColours() {
      head.style.removeProperty('--c1'); head.style.removeProperty('--c2');
      head.classList.remove('pv-active', 'pv-rest');
    }
    function restoreHead() {
      clearHeadColours();
      if (run) ring.fastUntil = performance.now() + 300;
      if (saved) {
        chip.textContent = saved.chip; wName.textContent = saved.name; wEx.innerHTML = saved.ex; fitName();
        saved = null;
      }
      if (run) { var cur = run.tl.segments[run.segIdx]; if (cur) { var c = PHASE[cur.type].colors; ring.setColors(c[0], c[1]); } }
    }
    /** Progress k (0..1+) of a move in direction dir: what's on now leaves with the finger, the destination eases in. */
    function set(k, dir, over) {
      var th = threshold(), D = travel(), kk = Math.min(1, k), e = easeOut(kk), extra = (over || 0) * 0.06;
      stage.style.setProperty('--sx', (-dir * (kk * th + extra)).toFixed(1) + 'px');
      stage.style.setProperty('--so', Math.max(0, 1 - kk / 0.35).toFixed(3));
      stage.style.setProperty('--ss', (1 - 0.06 * kk).toFixed(4));
      stage.style.setProperty('--px', (dir * 0.35 * D * (1 - e) - dir * extra).toFixed(1) + 'px');
      stage.style.setProperty('--po', easeOut(Math.max(0, (kk - 0.25) / 0.75)).toFixed(3));
      tp.style.setProperty('--ck', kk.toFixed(3));
      tp.classList.toggle('charge-next', dir > 0 && kk > 0);
      tp.classList.toggle('charge-prev', dir < 0 && kk > 0);
      arm(kk >= 1);
    }
    function open() { clearTimeout(settleT); stage.classList.add('carousel', 'swiping'); stage.classList.remove('settle'); }
    function close(after) {
      stage.classList.remove('swiping');
      clearTimeout(settleT);
      settleT = setTimeout(function () {
        if (g && g.on) return; // a new swipe took over: keep the carousel
        stage.classList.remove('settle', 'carousel');
        tp.classList.remove('charge-next', 'charge-prev');
        if (peekFig) peekFig.setPlaying(false);
        if (after) after();
      }, reduced ? 0 : 260);
    }
    function springBack(dir) {
      stage.classList.add('settle');
      set(0, dir);
      close();
    }
    /** Finish the move from wherever it is (swipes, ⏭ / ⏮ taps and arrow keys). */
    var keyQueue = []; // arrow presses waiting for the slide before them (at most 4)
    function commit(dir, act, key) {
      if (!run) return;
      if (locked()) {
        // no double skips from a double tap; but quick arrow presses are meant: each one
        // slides on in turn once the current slide is done (held keys don't repeat: see the keydown)
        if (key && keyQueue.length < 4) keyQueue.push({ dir: dir, act: act });
        return;
      }
      lockUntil = performance.now() + (key ? (reduced ? 120 : 260) : reduced ? 300 : 600);
      if (!dest || dest.dir !== dir || !stage.classList.contains('carousel')) { open(); prepare(dir); }
      stage.classList.remove('swiping');
      stage.classList.add('settle');
      set(1, dir);
      setTimeout(function () {
        // swap in the real interval: it looks exactly like the preview, so snap without animating
        saved = null;
        clearHeadColours();
        stage.classList.remove('settle');
        stage.classList.add('snap');
        document.body.classList.add('instant-phase'); // colours jump to the new phase: the head already shows them
        var hand = dest && dest.seg && peek.classList.contains('is-fig') && peekFig ? peekFig.getTime() : null;
        run.quiet = true;
        act();
        run.quiet = false;
        if (hand != null && workFig && dest.seg) {
          // the real figure continues exactly where the preview was: same move, pose and colours
          var nowSeg = run.tl.segments[run.segIdx];
          if (nowSeg && nowSeg.index === dest.seg.index) {
            // a warm-up step keeps its tempo and count-in; on the preview's clock, which runs at
            // most the length of the swipe ahead (the count-in only waits longer, and BEGIN
            // re-times the loop to the count)
            var ho = dest.seg.type === 'warmup' ? warmFigOpts(dest.seg, elapsedNow()) : {};
            ho.instant = true; ho.time = hand;
            workFig.setExercise(dest.seg.type === 'warmup' ? warmFigId(dest.seg) : dest.seg.exercise, ho);
            workFig.setColors(dest.colors[0], dest.colors[1], true);
            workFig.setEnergy(PHASE[dest.seg.type].energy, true);
          }
        }
        stage.style.setProperty('--sx', '0px'); stage.style.setProperty('--so', 1); stage.style.setProperty('--ss', 1);
        stage.style.setProperty('--po', 0);
        tp.classList.remove('armed');
        tp.style.setProperty('--ck', 0);
        stage.classList.remove('carousel', 'swiping');
        tp.classList.remove('charge-next', 'charge-prev');
        if (peekFig) peekFig.setPlaying(false);
        dest = null;
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          stage.classList.remove('snap'); document.body.classList.remove('instant-phase');
          var q = keyQueue.shift();
          if (q) {
            lockUntil = 0;
            // (pausing, the quit dialog, Undo or a swipe clear the queue; this is a backstop)
            if (run && !run.finished && $('pausedVeil').hidden && $('quitDialog').hidden && $('coachSheet').hidden) commit(q.dir, q.act, true);
            else keyQueue.length = 0;
          }
        }); });
      }, reduced ? 0 : 220);
    }
    /** One-time nudge that shows the next interval is just a swipe away. */
    function nudge() {
      if (!run || g || locked() || reduced) return;
      open(); prepare(1);
      stage.classList.remove('swiping'); stage.classList.add('settle');
      set(0.35, 1);
      nudgeT = setTimeout(function () { nudgeT = 0; springBack(1); }, 700);
    }
    /** A sideways swipe during exercise that we ignored: show where skipping lives instead. */
    var hinted = false;
    function hintControls(dir) {
      if (hinted) return;
      hinted = true;
      pulseCtl(dir > 0 ? $('skip') : $('prev'));
      if (!state.dragTip) {
        state.dragTip = true; savePrefs();
        // (mid-exercise the screen itself ignores swipes, so a sweaty arm can't skip)
        showTip(dir > 0 ? 'Swipe from ' + ICON_NEXT + ' to skip' : 'Swipe from ' + ICON_PREV + ' to go back', 5000);
      }
    }
    carousel = { commit: commit, nudge: nudge, clearKeys: function () { keyQueue.length = 0; } };

    /** Which of back, pause or skip is (x, y) on: -1, 0 or 1 (null: none). Each is a disc;
     *  count a finger's width of slack round it. */
    var ctls = [$('prev'), $('pause'), $('skip')];
    function onControl(x, y) {
      for (var i = 0; i < ctls.length; i++) {
        var r = ctls[i].getBoundingClientRect(), rad = r.width / 2 + 18;
        var dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
        if (dx * dx + dy * dy <= rad * rad) return i - 1;
      }
      return null;
    }

    area.addEventListener('pointerdown', function (e) {
      if (g || (e.pointerType === 'mouse' && e.button !== 0) || blocked(e)) return;
      if (e.pointerType === 'touch') {
        if (e.width > 40 || e.height > 40) return; // a palm or a wipe, not a fingertip
        if (e.clientX < 24 || e.clientX > window.innerWidth - 24) return; // leave the system back gesture alone
      }
      var restMode = run.mode === 'rest';
      // during exercise only a drag that starts on one of the three buttons counts (with a
      // little slack round each); the row between them, over the ring and the figure's feet,
      // doesn't. From ⏮ it can only go back, from ⏭ only on; from pause, either way.
      var on = restMode ? 0 : onControl(e.clientX, e.clientY), ignored = on === null;
      hinted = false;
      if (nudgeT) { clearTimeout(nudgeT); nudgeT = 0; } // a real swipe replaces the hint
      keyQueue.length = 0; // and any arrow presses still waiting
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), on: false, dx: 0, dir: 0, rest: restMode, ignored: ignored, only: on || 0 };
    });
    area.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (g.ignored) {
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { hintControls(dx < 0 ? 1 : -1); g = null; }
        else if (Math.abs(dy) > 48) g = null;
        return;
      }
      if (!g.on) {
        if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // vertical: not ours
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        g.on = true;
        try { area.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        open();
      }
      var dir = dx < 0 ? 1 : -1;
      if (g.only && dir !== g.only) {
        // the wrong way for this button: nothing charges (letting go springs back), and the
        // button that does go that way lights up
        if (g.dx) { arm(false); set(0, g.dir); }
        g.dx = 0;
        if (Math.abs(dx) > 48) hintControls(dir);
        return;
      }
      if (dir !== g.dir) { if (g.dir) arm(false); g.dir = dir; prepare(dir); }
      g.dx = dx;
      var th = threshold(), adx = Math.abs(dx);
      set(adx / th, dir, Math.max(0, adx - th));
    });
    function end(e, cancelled) {
      if (!g || e.pointerId !== g.id) return;
      var s = g; g = null;
      if (!s.on) return;
      var dt = Math.max(1, performance.now() - s.t), adx = Math.abs(s.dx);
      var full = adx >= threshold();
      var flick = s.rest && adx > 56 && adx / dt > 0.45; // flicks only while resting
      if (cancelled || !(full || flick)) { arm(false); springBack(s.dir || 1); return; }
      eatClick = true; // a swipe that started on a button must not also press it
      setTimeout(function () { eatClick = false; }, 350);
      commit(s.dx < 0 ? 1 : -1, s.dx < 0 ? skip : prev);
    }
    area.addEventListener('pointerup', function (e) { end(e, false); });
    area.addEventListener('pointercancel', function (e) { end(e, true); });
    area.addEventListener('click', function (e) { if (eatClick) { e.preventDefault(); e.stopPropagation(); eatClick = false; } }, true);
  }

  // ---------------------------------------------------------------- notices
  var noticeT = 0;
  function notice(text, ms) {
    $('noticeText').textContent = text;
    $('notice').hidden = false;
    clearTimeout(noticeT);
    noticeT = setTimeout(function () { $('notice').hidden = true; }, ms || 12000);
  }
  // The voice coach depends on the browser's speech engine. Some in-app viewers
  // don't have one (or drop every line): say so instead of staying silent.
  var ANDROID = /Android/i.test(navigator.userAgent);
  var VOICE_HELP = 'The voice coach can\u2019t play in this viewer. Open the link in ' +
    (ANDROID ? 'Chrome' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Safari' : 'Safari or Chrome') + ' to hear it. Beeps still work.';
  A.onVoiceProblem(function () { if (A.get('voice')) notice(VOICE_HELP); });

  // A browser / system "back" mid-workout asks before leaving instead of dropping the session.
  function guardHistory() {
    try { if (!(history.state && history.state.hiit)) history.pushState({ hiit: 1 }, ''); } catch (e) { /* sandboxed: fine */ }
  }
  window.addEventListener('popstate', function () {
    if (currentScreen === 'brief') { closeBrief(); return; }
    if (currentScreen === 'workout' && run && !run.finished) {
      guardHistory();
      if ($('quitDialog').hidden) openQuit();
    }
  });

  var doneFig = null;
  function finish() {
    if (!run || run.finished) return;
    run.finished = true;
    releaseHistory();
    var st = playedStats();
    var counted = st.active >= st.planned * 0.5;
    if (counted) recordWorkout(st.total);
    unlockScreen();
    A.play('finish');
    A.say(counted ? 'Workout complete. Great job!' : 'Session ended early.');
    A.sleep(4000);
    buzz([100, 60, 100, 60, 240]);
    setDoneTitle(counted);
    var dr = $('doneRing');
    dr.classList.remove('play'); void dr.getBoundingClientRect(); if (counted) dr.classList.add('play');

    document.body.dataset.phase = 'done';
    bg.setMood(PHASE.done.colors[0], PHASE.done.colors[1], 1);
    bg.flashNow();
    bg.setRunning(true);
    setTimeout(function () { if (currentScreen === 'done') bg.setMood(PHASE.done.colors[0], PHASE.done.colors[1], PHASE.done.energy); }, 2200);
    if (workFig) workFig.setPlaying(false);
    if (nextFig) nextFig.setPlaying(false);
    showScreen('done');

    var tl = run.tl;
    countUp($('dTime'), st.total, true);
    countUp($('dWork'), st.active, true);
    countUp($('dCount'), state.hist.completed, false);
    countUp($('dStreak'), liveStreak(), false);
    var list = $('doneList');
    list.textContent = '';
    tl.exercises.concat(tl.level.recoverType === 'jacks' ? ['jacks'] : []).forEach(function (id) {
      var ex = H.get(id);
      var li = document.createElement('li');
      li.dataset.group = ex.group;
      li.innerHTML = '<span>' + esc(ex.name) + '</span><b>' + H.formatTime(st.perEx[id] || 0) + '</b>';
      list.appendChild(li);
    });
    if (!doneFig) doneFig = makeFig($('doneFig'), { exercise: 'jacks', primary: PHASE.done.colors[0], secondary: PHASE.done.colors[1], quality: 'high', fps: 30, energy: 1 });
    else { doneFig.setExercise('jacks'); doneFig.setPlaying(true); }
    doneFig.pulse();
    requestAnimationFrame(function () { focusOn($('doneFig')); });
    if (counted) fx.confetti([PHASE.done.colors[0], PHASE.rest.colors[0], PHASE.setrest.colors[0], LOOKS[look].scheme === 'light' ? PHASE.done.colors[1] : '#ffffff']);
    setTimeout(function () { $('again').focus({ preventScroll: true }); }, 400);
  }

  function setDoneTitle(counted) {
    var lines = counted ? ['CRUSHED', 'IT'] : ['ENDED', 'EARLY'];
    var h = $('doneTitle');
    h.setAttribute('aria-label', counted ? 'Crushed it' : 'Ended early');
    h.querySelectorAll('.mega-line').forEach(function (el, i) {
      el.dataset.text = lines[i];
      el.firstElementChild.textContent = lines[i];
    });
    var lv = run && run.tl ? run.tl.level : H.LEVELS[state.level];
    $('doneEyebrow').textContent = (counted ? 'Session complete · ' : '') + lv.name + ' · ' + lv.sets + ' sets';
    $('doneNote').hidden = counted;
  }

  function countUp(el, target, asTime) {
    var t0 = performance.now(), dur = reduced ? 0 : 900;
    function step(now) {
      var k = dur ? Math.min(1, (now - t0) / dur) : 1;
      var v = target * (1 - Math.pow(1 - k, 3));
      el.textContent = asTime ? H.formatTime(Math.floor(v)) : String(Math.round(v));
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = asTime ? H.formatTime(target) : String(target);
    }
    requestAnimationFrame(step);
  }

  /** The workout added a history entry (so Back asks first); take it away when we leave. */
  function releaseHistory() {
    try { if (history.state && history.state.hiit) history.back(); } catch (e) { /* ignore */ }
  }
  function endRun() {
    if (run) run.finished = true;
    releaseHistory();
    run = null;
    unlockScreen();
    A.stopVoice();
    A.sleep(0);
    if (workFig) workFig.setPlaying(false);
    if (nextFig) nextFig.setPlaying(false);
    $('pausedVeil').hidden = true;
    setInert(false);
    $('quitDialog').hidden = true;
    $('coachSheet').hidden = true;
    hideUndo();
  }

  // quit dialog
  var resumeAfterDialog = false;
  function openQuit() {
    if (!run) return;
    if (carousel) carousel.clearKeys();
    resumeAfterDialog = run.playing;
    pauseQuietly();
    $('pausedVeil').hidden = true;
    var qd = $('quitDialog');
    qd.hidden = false;
    qd.classList.add('guard');
    setTimeout(function () { qd.classList.remove('guard'); }, 500);
    setInert(true);
    $('quitNo').focus();
  }
  function closeQuit(resume) {
    $('quitDialog').hidden = true;
    setInert(false);
    if (resume && resumeAfterDialog) setPlaying(true);
    else if (run && !run.playing) setPauseUi(true);
    if ($('pausedVeil').hidden) $('pause').focus();
  }

  // ================================================================ MAIN LOOP
  var lastFrame = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (run && !run.finished) {
      update();
      if (currentScreen === 'workout' && (run.playing || ring.busy())) ring.draw(dt);
    }
    fx.draw(dt);
  }
  requestAnimationFrame(frame);
  // Keep the clock (and its sound cues) running when the tab is in the background.
  var lastBgTick = performance.now();
  setInterval(function () {
    var now = performance.now();
    if (document.hidden && run && !run.finished) update();
    lastBgTick = now;
  }, 250);
  document.addEventListener('visibilitychange', function () {
    lastFrame = performance.now();
    lastBgTick = performance.now();
    if (!document.hidden && run && !run.finished) lockScreen();
  });

  // ================================================================ EVENTS
  function syncToggles() {
    [['sfxToggle', 'sfx', '#i-sound', '#i-mute'], ['wSound', 'any', '#i-sound', '#i-mute'], ['voiceToggle', 'voice', '#i-voice', '#i-voice-off'], ['bVoice', 'voice', '#i-voice', '#i-voice-off']].forEach(function (t) {
      var on = t[1] === 'any' ? A.get('sfx') || A.get('voice') : A.get(t[1]);
      var b = $(t[0]);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('use').setAttribute('href', on ? t[2] : t[3]);
    });
  }

  var focusByKeyboard = false;

  function trapTab(e, container) {
    var f = Array.prototype.filter.call(container.querySelectorAll('button'), function (b) { return !b.hidden && !b.disabled && b.offsetParent !== null; });
    if (!f.length) return;
    var i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? f.length - 1 : 1) + f.length) % f.length].focus();
  }

  function bind() {
    document.querySelectorAll('.level').forEach(function (el) {
      el.addEventListener('click', function () { state.level = el.dataset.level; A.play('click'); renderSetup(); });
      el.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
        e.preventDefault();
        state.level = state.level === 'easy' ? 'medium' : 'easy';
        renderSetup();
        $('level-' + state.level).focus();
      });
    });
    $('minus').addEventListener('click', function () { setCount(state.ids.length - 1); });
    $('plus').addEventListener('click', function () { setCount(state.ids.length + 1); });
    $('shuffle').addEventListener('click', function () {
      var b = $('shuffle');
      b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
      state.ids = H.randomPick(Math.max(state.ids.length, H.MIN_EXERCISES));
      A.play('click');
      hero.hover = null;
      showHero(state.ids[0]);
      renderSetup();
    });
    $('start').addEventListener('click', openBrief);
    $('bStart').addEventListener('click', briefStart);
    $('briefBack').addEventListener('click', closeBrief);
    $('bReplay').addEventListener('click', function () { A.unlock(); briefPlay(); });
    $('bVoice').addEventListener('click', function () {
      var on = !A.get('voice'); A.set('voice', on); A.unlock();
      syncToggles(); savePrefs();
      if (on) briefPlay(); // the coach starts the brief again
      else { briefStopTalk(false); briefDone(false); }
    });
    $('heroGuide').addEventListener('click', function (e) { openGuide(hero.shown || state.ids[0], 'setup', e.currentTarget); });

    $('sfxToggle').addEventListener('click', function () { A.set('sfx', !A.get('sfx')); A.unlock(); A.play('click'); syncToggles(); savePrefs(); });
    var beforeMute = null;
    $('wSound').addEventListener('click', function () {
      if (A.get('sfx') || A.get('voice')) { beforeMute = { sfx: A.get('sfx'), voice: A.get('voice') }; A.set('sfx', false); A.set('voice', false); }
      else { var b = beforeMute || { sfx: true, voice: true }; A.set('sfx', b.sfx); A.set('voice', b.voice); A.play('click'); }
      syncToggles(); savePrefs();
    });
    $('voiceToggle').addEventListener('click', function () {
      var on = !A.get('voice'); A.set('voice', on); A.unlock();
      if (on) A.say('Voice coach on.');
      syncToggles(); savePrefs();
    });

    $('pause').addEventListener('click', function () { if (run) setPlaying(!run.playing); });
    $('resume').addEventListener('click', function () { setPlaying(true); });
    $('endFromPause').addEventListener('click', openQuit); // always confirm
    $('skip').addEventListener('click', function () { if (carousel && run) carousel.commit(1, skip); else skip(); });
    $('unStart').addEventListener('click', skip);
    $('wpSkip').addEventListener('click', skipWarmup);
    $('toastUndo').addEventListener('click', function () {
      if (carousel) carousel.clearKeys();
      if (run && undo.at != null) { A.play('click'); seek(undo.at); }
      hideUndo();
    });
    $('wuToggle').addEventListener('click', function () {
      state.warmup = !state.warmup; A.play('click'); renderSetup();
    });
    $('prev').addEventListener('click', function () { if (carousel && run) carousel.commit(-1, prev); else prev(); });
    initSwipe();
    $('quit').addEventListener('click', openQuit);
    $('quitNo').addEventListener('click', function () { closeQuit(true); });
    $('noticeClose').addEventListener('click', function () { $('notice').hidden = true; });
    $('quitYes').addEventListener('click', function () { endRun(); showScreen('setup'); });
    function howTo(e) {
      if (!run) return;
      var seg = run.tl.segments[run.segIdx];
      if (seg) openGuide(guideTarget(seg), 'workout', e.currentTarget);
    }
    $('howTo').addEventListener('click', howTo);
    $('unHow').addEventListener('click', howTo);
    document.querySelector('.un-figwrap').addEventListener('click', function () { $('unHow').click(); });

    $('csClose').addEventListener('click', closeGuide);
    $('csDone').addEventListener('click', closeGuide);
    $('csToggle').addEventListener('click', function () {
      if (!guide.id) return;
      toggleExercise(guide.id);
      syncGuideToggle();
    });
    $('coachSheet').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeGuide(); });

    $('again').addEventListener('click', function () {
      var ids = run ? run.tl.exercises.slice() : state.ids.slice();
      startWorkout(ids);
    });
    $('newWorkout').addEventListener('click', function () {
      state.ids = H.randomPick(run ? run.tl.exercises.length : H.DEFAULT_COUNT);
      run = null;
      showScreen('setup');
      hero.hover = null;
      showHero(state.ids[0]);
      renderSetup();
    });

    // How focus last moved: Tab/arrows mean a keyboard user chose the focused button.
    document.addEventListener('pointerdown', function () { focusByKeyboard = false; }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') focusByKeyboard = true;
    }, true);

    document.addEventListener('keydown', function (e) {
      var sheetOpen = !$('coachSheet').hidden;
      if (sheetOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeGuide(); }
        else if (e.key === 'Tab') trapTab(e, $('coachSheet'));
        return;
      }
      if (currentScreen === 'brief') { if (e.key === 'Escape') { e.preventDefault(); closeBrief(); } return; }
      if (currentScreen !== 'workout' || !run) return;
      var dialogOpen = !$('quitDialog').hidden;
      if (e.key === 'Escape') { e.preventDefault(); if (dialogOpen) closeQuit(true); else openQuit(); return; }
      if (dialogOpen) { if (e.key === 'Tab') trapTab(e, $('quitDialog')); return; }
      var veilOpen = !$('pausedVeil').hidden;
      if (veilOpen && e.key === 'Tab') { trapTab(e, $('pausedVeil')); return; }
      if (e.key === ' ' || e.code === 'Space') {
        // Space is play/pause, unless a keyboard user has deliberately focused another button.
        var ae = document.activeElement;
        if (ae && ae.tagName === 'BUTTON' && ae !== $('pause') && focusByKeyboard) return;
        e.preventDefault(); setPlaying(!run.playing);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.repeat) return; // a held key is one press, not a run through the workout
        var fwd = e.key === 'ArrowRight';
        if (carousel) carousel.commit(fwd ? 1 : -1, fwd ? skip : prev, true); else if (fwd) skip(); else prev();
      }
    });

    var scrollRaf = 0;
    function refocus() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        focusOn(currentScreen === 'setup' ? $('heroFig') : currentScreen === 'brief' ? $('briefTitle') : currentScreen === 'workout' ? $('stage') : $('doneFig'));
      });
    }
    window.addEventListener('scroll', refocus, { passive: true });
    window.addEventListener('resize', refocus);
  }

  // ================================================================ LOOK SWITCH
  /** The user picked a look from the menu (or 'auto'). */
  function setLook(pref) {
    if (!LOOK_PREF_RE.test(pref)) return;
    lookPref = savedLookPref = pref;
    htmlEl.setAttribute('data-look-pref', pref);
    applyLook(resolveLook(pref));
    syncLookMenu();
    savePrefs();
  }
  /** Follow the phone's light/dark setting while on Automatic. */
  function followSystem() { if (lookPref === 'auto') applyLook(resolveLook('auto')); }
  if (schemeMQ) {
    if (schemeMQ.addEventListener) schemeMQ.addEventListener('change', followSystem);
    else if (schemeMQ.addListener) schemeMQ.addListener(followSystem);
  }
  if (window.MutationObserver) new MutationObserver(followSystem).observe(htmlEl, { attributes: true, attributeFilter: ['data-theme'] });

  function applyLook(name) {
    if (!LOOKS[name] || name === look) return;
    look = name;
    htmlEl.classList.add('look-switching');
    requestAnimationFrame(function () { requestAnimationFrame(function () { htmlEl.classList.remove('look-switching'); }); });
    var L = LOOKS[look];
    htmlEl.setAttribute('data-look', L.style);
    htmlEl.setAttribute('data-scheme', L.scheme);
    applyPalette();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', look === 'studio-dark' ? DARK_VARIANTS[darkVariant].meta : L.meta);
    bg.setStyle(L.style, L.scheme);
    bg.setFrameRate(L.fps || (currentScreen === 'workout' ? 0 : 30));
    var mat = figMaterial();
    figs.forEach(function (f) { f.setStyle(L.style, L.scheme, mat); }); // one repaint each
    H.EXERCISES.forEach(function (ex) { var gc = GROUP_COLORS[ex.group]; thumbs[ex.id].setColors(gc[0], gc[1]); });
    briefColors();
    if (hero.shown) showHero(hero.shown);
    if (run && !run.finished && currentScreen === 'workout') {
      var seg = run.tl.segments[run.segIdx];
      if (seg) {
        var c = PHASE[seg.type].colors;
        bg.setMood(c[0], c[1], PHASE[seg.type].energy);
        ring.setColors(c[0], c[1]); ring.a = ring.ta.slice(); ring.b = ring.tb.slice();
        if (workFig) workFig.setColors(c[0], c[1]);
        if (run.mode === 'rest') showUpNext(seg);
        updateProgress(seg);
      }
    }
    ring.sizeDirty = true;
    if (currentScreen === 'done') {
      bg.setMood(PHASE.done.colors[0], PHASE.done.colors[1], PHASE.done.energy);
      if (doneFig) doneFig.setColors(PHASE.done.colors[0], PHASE.done.colors[1]);
    }
    if (guide.fig && guide.id) {
      var ex = H.get(guide.id), gc2 = GROUP_COLORS[ex.group] || PHASE.work.colors;
      guide.fig.setColors(gc2[0], gc2[1]);
      $('coachSheet').style.setProperty('--gc', gc2[0]);
      $('coachSheet').style.setProperty('--gc2', gc2[1]);
    }
    ring.needs = 2;
    syncLookMenu();
    savePrefs();
  }

  function syncLookMenu() {
    document.querySelectorAll('#lookList [data-look]').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.look === lookPref ? 'true' : 'false');
    });
  }
  function openLookMenu(open) {
    var list = $('lookList'), btn = $('lookBtn');
    list.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var cur = list.querySelector('[aria-checked="true"]') || list.querySelector('[data-look]');
      cur.focus();
    }
  }
  function bindLookMenu() {
    var list = $('lookList'), btn = $('lookBtn');
    btn.addEventListener('click', function () { openLookMenu(list.hidden); });
    btn.addEventListener('keydown', function (e) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.hidden) { e.preventDefault(); openLookMenu(true); }
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-look]');
      if (!b) return;
      setLook(b.dataset.look);
      openLookMenu(false);
      btn.focus();
    });
    list.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(list.querySelectorAll('[data-look]'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        items[e.key === 'Home' ? 0 : items.length - 1].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (e.key === 'Escape') e.preventDefault();
        openLookMenu(false);
        if (e.key === 'Escape') btn.focus();
      }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!list.hidden && !e.target.closest('.look-menu')) openLookMenu(false);
    });
    syncLookMenu();
  }

  // ================================================================ BOOT
  buildGrid();
  bind();
  bindLookMenu();
  syncToggles();
  showScreen('setup');
  showHero(state.ids[0]);
  renderSetup();
  setInterval(heroCycle, 3600);

  // Small test hook for automated checks (no effect on the app).
  window.__hiit = {
    state: state,
    get run() { return run; },
    get ring() { return ring; },
    seek: function (t) { seek(t); },
    advance: function (sec) { if (run && !run.finished) { run.base += sec; update(); } },
    start: function () { startWorkout(state.ids); },
    brief: function () { openBrief(); },
    get briefData() { return brief.data; },
    finish: function () { if (run) seek(run.tl.total); },
    guide: function (id) { openGuide(id, run ? 'workout' : 'setup'); },
    look: function (name) { setLook(name); }
  };
})();
