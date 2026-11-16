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
    prep: { colors: ['#9b5cff', '#ff2bd6'], energy: 0.45, chip: 'Get ready', flash: 'READY' },
    work: { colors: ['#ff2bd6', '#ff8a1f'], energy: 1.0, chip: 'Work', flash: 'GO!' },
    rest: { colors: ['#22e5ff', '#4a6bff'], energy: 0.18, chip: 'Rest · up next', flash: 'REST' },
    jacks: { colors: ['#c6ff1a', '#ffe14a'], energy: 0.8, chip: 'Cardio', flash: 'JACKS!' },
    setrest: { colors: ['#36ffc0', '#2a8bff'], energy: 0.1, chip: 'Set break', flash: 'BREAK' },
    done: { colors: ['#ffd23f', '#ff2bd6'], energy: 0.55, chip: '', flash: '' }
  };
  var GROUP_COLORS = {
    upper: ['#ff4fd8', '#ff8a1f'],
    abs: ['#2ee6ff', '#4a6bff'],
    legs: ['#ffb21f', '#ff4f6a'],
    cardio: ['#c6ff1a', '#ffe14a'],
    rest: ['#22e5ff', '#4a6bff']
  };

  // ---------------------------------------------------------------- storage
  var STORE_KEY = 'overdrive-hiit:v1';
  function loadPrefs() {
    try { return JSON.parse(window.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function savePrefs() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        level: state.level, sfx: A.get('sfx'), voice: A.get('voice'),
        completed: state.hist.completed, seconds: state.hist.seconds,
        streak: state.hist.streak, lastDay: state.hist.lastDay
      }));
    } catch (e) { /* storage unavailable: fine */ }
  }

  var prefs = loadPrefs();
  var state = {
    level: H.LEVELS[prefs.level] ? prefs.level : 'easy',
    ids: H.randomPick(H.DEFAULT_COUNT),
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
  var stubFig = { setExercise: noop, setColors: noop, setPlaying: noop, setEnergy: noop, pulse: noop, destroy: noop };
  function noop() {}
  function makeFig(canvas, opts) {
    try { return (window.HIITFigure && window.HIITFigure.create(canvas, opts)) || stubFig; } catch (e) { return stubFig; }
  }

  // ---------------------------------------------------------------- backdrop
  var bg;
  try { bg = new window.HIITBackdrop($('bg')); } catch (e) {
    bg = { setMood: noop, setFocus: noop, beatNow: noop, flashNow: noop, setRunning: noop };
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
  var heroFig = makeFig($('heroFig'), { exercise: state.ids[0], primary: GROUP_COLORS.upper[0], secondary: GROUP_COLORS.upper[1], quality: 'high', energy: 0.7 });
  var hero = { hover: null, shown: null };

  function buildGrid() {
    var grid = $('exGrid');
    H.EXERCISES.forEach(function (ex) {
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
      thumbs[ex.id] = makeFig(btn.querySelector('canvas'), { exercise: ex.id, primary: gc[0], secondary: gc[1], quality: 'low', energy: 0.6 });
    });
  }

  function toggleExercise(id) {
    var i = state.ids.indexOf(id);
    if (i >= 0) state.ids.splice(i, 1);
    else if (state.ids.length < H.MAX_EXERCISES) state.ids.push(id);
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
      hint.innerHTML = 'Tap to add or remove. They run in the numbered order. Tap <svg aria-hidden="true" class="inline-ico"><use href="#i-info"/></svg> for the trainer’s guide.';
    }

    $('start').disabled = !v.ok;
    $('startError').textContent = v.ok ? '' : v.reason;

    var tl = H.buildTimeline(ids, state.level);
    var total = v.ok ? H.formatTime(tl.total) : '--:--';
    $('sumLevel').textContent = level.name + ' · ' + level.sets + ' sets';
    $('sumTotal').textContent = total;
    $('sumWork').textContent = v.ok ? H.formatTime(tl.intervals * level.work) : '--:--';
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
    $('csGroup').textContent = (H.GROUPS[ex.group] ? H.GROUPS[ex.group].label : 'Cardio') + ' · Trainer’s guide';
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
    if (!guide.fig) guide.fig = makeFig($('csFig'), { exercise: id, primary: gc[0], secondary: gc[1], quality: 'high', energy: 0.9 });
    guide.fig.setExercise(id);
    guide.fig.setColors(gc[0], gc[1]);
    guide.fig.setPlaying(true);
    guide.fig.pulse();
    A.play('click');
    setTimeout(function () { $('csClose').focus(); }, 30);
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
    if (guide.context === 'workout' && run && !run.finished) {
      if (guide.resume) setPlaying(true);
      else if (!run.playing) setPauseUi(true);
    }
    if (guide.opener && document.body.contains(guide.opener)) guide.opener.focus();
  }

  function fillList(el, items) {
    el.textContent = '';
    (items || []).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; el.appendChild(li); });
  }

  // ================================================================ SCREENS
  var currentScreen = 'setup';
  function showScreen(name) {
    currentScreen = name;
    ['setup', 'workout', 'done'].forEach(function (s) { $(s).hidden = s !== name; });
    document.body.dataset.screen = name;
    if (name === 'setup') {
      document.body.dataset.phase = 'setup';
      bg.setMood(PHASE.setup.colors[0], PHASE.setup.colors[1], PHASE.setup.energy);
      bg.setRunning(true);
      requestAnimationFrame(function () { focusOn($('heroFig')); });
      window.scrollTo(0, 0);
      renderMe();
    }
  }

  // ================================================================ RING
  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }

  function Ring(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.progress = 1;
    this.ticks = 10;
    this.a = hexRgb('#9b5cff'); this.b = hexRgb('#ff2bd6');
    this.ta = this.a.slice(); this.tb = this.b.slice();
    this.energy = 0.5;
    this.beat = 0; this.hot = 0;
    this.rot = 0;
    this.paused = false;
    this.shocks = [];
    this.sparks = [];
    this.w = 0; this.h = 0; this.dpr = 1;
  }
  Ring.prototype.setColors = function (a, b) { this.ta = hexRgb(a); this.tb = hexRgb(b); };
  Ring.prototype.shock = function (strength) { this.shocks.push({ t: 0, s: strength || 1 }); };
  Ring.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.c.clientWidth, h = this.c.clientHeight;
    if (!w || !h) return false;
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      var S = Math.min(w, h);
      var fig = $('fig');
      fig.style.setProperty('--fig-size', Math.round(S * 0.7) + 'px');
    }
    return true;
  };
  Ring.prototype.draw = function (dt) {
    if (!this.resize()) return;
    var ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    var k = 1 - Math.exp(-dt * 5);
    for (var i = 0; i < 3; i++) { this.a[i] += (this.ta[i] - this.a[i]) * k; this.b[i] += (this.tb[i] - this.b[i]) * k; }
    this.beat *= Math.exp(-dt * 4);
    this.hot *= Math.exp(-dt * 2.5);
    if (!this.paused && !reduced) this.rot += dt * (0.15 + 0.5 * this.energy);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var S = Math.min(w, h);
    var cx = w / 2, cy = h / 2;
    var R = S * 0.405;
    var th = Math.max(6, S * 0.03);
    var A0 = -Math.PI / 2;
    var prog = Math.max(0, Math.min(1, this.progress));
    var a1 = A0 + TAU * prog;
    var ca = this.a, cb = this.b;

    ctx.lineCap = 'round';

    // ticks: one per second of the interval, lit while that second remains
    var n = this.ticks;
    var t0 = R + th * 1.25, len = S * 0.022;
    for (i = 0; i < n; i++) {
      var ang = A0 + (i + 0.5) / n * TAU;
      var lit = (i + 0.5) / n <= prog;
      var major = i % 5 === 0;
      var L = major ? len * 1.6 : len;
      ctx.strokeStyle = lit ? rgba(ca, 0.9) : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = major ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * t0, cy + Math.sin(ang) * t0);
      ctx.lineTo(cx + Math.cos(ang) * (t0 + L), cy + Math.sin(ang) * (t0 + L));
      ctx.stroke();
    }

    // track
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = th;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';

    // HUD decorations
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rot);
    ctx.strokeStyle = rgba(cb, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 9]);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-this.rot * 1.7);
    ctx.strokeStyle = rgba(ca, 0.4);
    ctx.lineWidth = 2;
    var rr = R + th * 1.25 + len * 2.4;
    for (i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, 0, rr, i * TAU / 3, i * TAU / 3 + 0.55); ctx.stroke();
    }
    ctx.restore();

    // whole-session progress: thin inner arc
    var tp = Math.max(0, Math.min(1, this.total || 0));
    var ri = R - th * 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, ri, 0, TAU); ctx.stroke();
    if (tp > 0.001) {
      ctx.strokeStyle = rgba(cb, 0.85);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, ri, A0, A0 + TAU * tp); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(A0 + TAU * tp) * ri, cy + Math.sin(A0 + TAU * tp) * ri, 2.6, 0, TAU); ctx.fill();
    }

    // progress arc with layered glow
    if (prog > 0.0005) {
      var grad;
      if (ctx.createConicGradient) {
        grad = ctx.createConicGradient(A0, cx, cy);
        grad.addColorStop(0, rgba(cb, 1));
        grad.addColorStop(Math.max(0.001, prog), rgba(ca, 1));
        grad.addColorStop(Math.min(1, prog + 0.001), rgba(ca, 1));
        grad.addColorStop(1, rgba(ca, 1));
      } else {
        grad = rgba(ca, 1);
      }
      var heat = 1 + this.hot * 0.8 + this.beat * 0.4;
      var passes = [[th * 3.6, 0.07], [th * 2.2, 0.16], [th * 1.0, 0.95]];
      for (i = 0; i < passes.length; i++) {
        ctx.globalAlpha = Math.min(1, passes[i][1] * heat);
        ctx.strokeStyle = grad;
        ctx.lineWidth = passes[i][0];
        ctx.beginPath(); ctx.arc(cx, cy, R, A0, a1); ctx.stroke();
      }
      ctx.globalAlpha = 0.55 + 0.45 * this.hot;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = th * 0.26;
      ctx.beginPath(); ctx.arc(cx, cy, R, A0, a1); ctx.stroke();
      ctx.globalAlpha = 1;

      // comet head
      var hx = cx + Math.cos(a1) * R, hy = cy + Math.sin(a1) * R;
      var hr = th * (2.6 + this.beat * 2 + this.hot * 2);
      var rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.25, rgba(ca, 0.9));
      rg.addColorStop(1, rgba(ca, 0));
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();

      // sparks shed from the head
      if (!this.paused && !reduced) {
        var rate = 40 * (0.25 + this.energy) * dt;
        while (rate > 0) {
          if (Math.random() < rate) {
            var tang = a1 + Math.PI / 2; // clockwise tangent: the head moves the other way
            var sp = S * (0.05 + Math.random() * 0.25) * (0.5 + this.energy);
            var spread = (Math.random() - 0.5) * 1.6;
            this.sparks.push({
              x: hx, y: hy,
              vx: Math.cos(tang + spread) * sp + Math.cos(a1) * sp * 0.4 * (Math.random() - 0.3),
              vy: Math.sin(tang + spread) * sp + Math.sin(a1) * sp * 0.4 * (Math.random() - 0.3),
              life: 1, decay: 1.4 + Math.random() * 1.6, size: 0.8 + Math.random() * 1.8,
              c: Math.random() < 0.5 ? ca : cb
            });
          }
          rate -= 1;
        }
      }
    }

    // sparks
    for (i = this.sparks.length - 1; i >= 0; i--) {
      var p = this.sparks[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      ctx.strokeStyle = rgba(p.c, p.life);
      ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
    }
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);

    // shockwaves
    for (i = this.shocks.length - 1; i >= 0; i--) {
      var s = this.shocks[i];
      s.t += dt * 1.3;
      if (s.t >= 1) { this.shocks.splice(i, 1); continue; }
      var e = 1 - Math.pow(1 - s.t, 3);
      ctx.strokeStyle = rgba(ca, (1 - s.t) * 0.8 * s.s);
      ctx.lineWidth = th * (1 - s.t) * 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, R + e * S * 0.32, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba([255, 255, 255], (1 - s.t) * 0.5 * s.s);
      ctx.lineWidth = Math.max(1, th * 0.25 * (1 - s.t));
      ctx.beginPath(); ctx.arc(cx, cy, R + e * S * 0.24, 0, TAU); ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  };

  // ================================================================ FX
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
    burst: function (x, y, colors, count, power) {
      if (reduced) return;
      var m = Math.min(window.innerWidth, window.innerHeight);
      for (var i = 0; i < count; i++) {
        var a = Math.random() * TAU;
        var sp = m * (0.3 + Math.random() * 0.9) * (power || 1);
        this.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, drag: 0.9,
          life: 1, decay: 0.9 + Math.random() * 0.9, size: 1 + Math.random() * 2.2, c: hexRgb(colors[i % colors.length]), streak: true });
      }
    },
    confetti: function (colors) {
      if (reduced) return;
      var W = window.innerWidth, Hh = window.innerHeight;
      for (var i = 0; i < 180; i++) {
        var fromLeft = i % 2 === 0;
        var a = fromLeft ? -Math.PI / 3 - Math.random() * 0.5 : -2 * Math.PI / 3 + Math.random() * 0.5;
        var sp = Hh * (0.9 + Math.random() * 0.9);
        this.parts.push({ x: fromLeft ? -10 : W + 10, y: Hh * 0.85, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: Hh * 0.9, drag: 0.985, life: 1, decay: 0.28 + Math.random() * 0.25,
          size: 4 + Math.random() * 6, c: hexRgb(colors[i % colors.length]), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12, streak: false });
      }
    },
    draw: function (dt) {
      if (!this.parts.length) {
        if (this.dirty) { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.c.width, this.c.height); this.dirty = false; }
        return;
      }
      this.resize();
      this.dirty = true;
      var ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = this.parts.length - 1; i >= 0; i--) {
        var p = this.parts[i];
        p.life -= dt * p.decay;
        if (p.life <= 0 || p.y > this.h + 40) { this.parts.splice(i, 1); continue; }
        var drag = Math.pow(p.drag, dt * 60);
        p.vx *= drag; p.vy = p.vy * drag + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.streak) {
          ctx.strokeStyle = rgba(p.c, p.life);
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke();
        } else {
          p.rot += p.vr * dt;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = rgba(p.c, Math.min(1, p.life * 1.5));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * (0.4 + Math.abs(Math.sin(p.rot * 2))));
          ctx.restore();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // ================================================================ WORKOUT
  var ring = new Ring($('ring'));
  var workFig = null;
  var run = null;
  var wakeLock = null;

  function lockScreen() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(noop);
      }
    } catch (e) { /* not allowed here */ }
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
    var tl = H.buildTimeline(ids, state.level);
    run = {
      tl: tl, ids: H.sanitize(ids), level: state.level,
      base: 0, anchor: performance.now(), playing: true,
      segIdx: -1, lastWhole: null, lastClock: -1, coachIdx: -1, figSwapped: false,
      active: 0, perEx: {}, finished: false
    };
    showScreen('workout');
    if (!workFig) workFig = makeFig($('fig'), { exercise: ids[0], primary: PHASE.prep.colors[0], secondary: PHASE.prep.colors[1], quality: 'high', energy: 0.6 });
    workFig.setPlaying(true);
    buildSegs(tl);
    setPauseUi(false);
    lockScreen();
    requestAnimationFrame(function () { focusOn($('stage')); });
    update();
  }

  function elapsedNow() {
    if (!run) return 0;
    return run.playing ? run.base + (performance.now() - run.anchor) / 1000 : run.base;
  }

  function seek(t) {
    if (!run) return;
    run.base = Math.max(0, Math.min(run.tl.total, t));
    run.anchor = performance.now();
    run.lastWhole = null;
    update();
  }

  function setPlaying(on) {
    if (!run || run.finished || on === run.playing) return;
    run.base = elapsedNow();
    run.anchor = performance.now();
    run.playing = on;
    setPauseUi(!on);
    if (on) { A.play('click'); lockScreen(); } else { A.stopVoice(); }
  }
  /** Stop the clock without showing the pause screen (dialogs, guide). */
  function pauseQuietly() {
    if (!run || !run.playing) return;
    run.base = elapsedNow(); run.anchor = performance.now(); run.playing = false;
    A.stopVoice();
    if (workFig) workFig.setPlaying(false);
    ring.paused = true;
    bg.setRunning(false);
    syncPauseButton(true);
  }

  function syncPauseButton(paused) {
    var btn = $('pause');
    btn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    btn.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  }

  function setPauseUi(paused) {
    $('pausedVeil').hidden = !paused || !$('quitDialog').hidden || !$('coachSheet').hidden;
    syncPauseButton(paused);
    if (workFig) workFig.setPlaying(!paused);
    ring.paused = paused;
    bg.setRunning(!paused);
    if (paused) setTimeout(function () { if (!$('pausedVeil').hidden) $('resume').focus(); }, 30);
  }

  function buildSegs(tl) {
    var wrap = $('segs');
    wrap.textContent = '';
    tl.segments.forEach(function (s) {
      var i = document.createElement('i');
      i.className = 't-' + s.type;
      i.style.setProperty('--w', s.duration);
      wrap.appendChild(i);
    });
  }

  function exName(id) { var e = H.get(id); return e ? e.name : ''; }
  function spoken(id) { return exName(id).toLowerCase(); }
  function clock(sec) { return H.formatTime(Math.ceil(Math.max(0, sec) - 1e-6)); }

  /** What the trainer panel cycles through during a segment, and how fast. */
  function coachPlan(seg) {
    var ex = H.get(seg.exercise);
    var nx = seg.next ? H.get(seg.next) : null;
    function steps(e, named) { return e.steps.map(function (s, i) { return { k: 'Step ' + (i + 1) + ' of ' + e.steps.length + (named ? ' · ' + e.name : ''), v: s }; }); }
    switch (seg.type) {
      case 'prep':
        return { period: 5, items: [{ k: 'First up · ' + ex.name, v: ex.steps[0] }, { k: 'First up · ' + ex.name, v: ex.cue }] };
      case 'work':
        return { period: 7.5, items: [{ k: 'Form', v: ex.cue }].concat(
          ex.cues.slice(0, 2).map(function (c) { return { k: 'Form', v: c }; }),
          [{ k: 'Breathing', v: ex.breathe }]) };
      case 'jacks':
        return { period: 7.5, items: [{ k: 'Form', v: H.JACKS.cue }].concat(
          H.JACKS.cues.slice(0, 2).map(function (c) { return { k: 'Form', v: c }; }),
          [{ k: 'Breathing', v: H.JACKS.breathe }]) };
      case 'rest':
        return { period: 7.5, items: nx ? steps(nx) : [{ k: 'Recover', v: H.REST.cue }] };
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
    if (seg.type === 'work' || seg.type === 'prep') return seg.exercise;
    if (seg.type === 'jacks') return 'jacks';
    return seg.next || run.tl.exercises[0];
  }

  function enterSegment(idx) {
    var tl = run.tl, seg = tl.segments[idx], ph = PHASE[seg.type];
    run.segIdx = idx;
    run.lastWhole = null;
    run.coachIdx = -1;
    run.figSwapped = false;
    document.body.dataset.phase = seg.type;
    var c = ph.colors;

    bg.setMood(c[0], c[1], ph.energy);
    bg.flashNow();
    ring.setColors(c[0], c[1]);
    ring.energy = ph.energy;
    ring.ticks = Math.min(seg.duration, 60);
    ring.shock(1);
    ring.hot = 1;

    var figEx = seg.type === 'rest' ? (seg.next || 'rest') : seg.type === 'setrest' ? 'rest' : seg.exercise;
    if (workFig) {
      workFig.setExercise(figEx);
      workFig.setColors(c[0], c[1]);
      workFig.setEnergy(seg.type === 'rest' || seg.type === 'setrest' ? 0.35 : ph.energy);
      workFig.pulse();
    }

    // header + labels
    var level = tl.level;
    var nEx = tl.exercises.length;
    var ex = H.get(seg.exercise);
    var nx = seg.next ? H.get(seg.next) : null;
    $('wSet').textContent = seg.set + '/' + level.sets;
    $('phaseChip').textContent = ph.chip;
    var name, label, sub;
    if (seg.type === 'prep') {
      name = ex.name; label = 'Starting in'; sub = 'First up · ' + ex.name;
      $('wEx').textContent = 'Exercise 1 of ' + nEx;
    } else if (seg.type === 'work') {
      name = ex.name; label = 'Time left';
      sub = (seg.slot === 0 && seg.set > 1 ? 'Set ' + seg.set + ' · ' : '') + ex.name;
      $('wEx').textContent = 'Exercise ' + (seg.slot + 1) + ' of ' + nEx;
    } else if (seg.type === 'jacks') {
      name = H.JACKS.name; label = 'Time left';
      sub = nx ? 'Next · ' + nx.name : 'Last push';
      $('wEx').textContent = 'Active recovery';
    } else if (seg.type === 'rest') {
      name = nx ? nx.name : 'Rest'; label = 'Next exercise in';
      sub = nx ? 'Next · ' + nx.name : 'Breathe';
      $('wEx').textContent = 'Recover';
    } else { // setrest
      name = 'Set ' + seg.set + ' done'; label = 'Set ' + (seg.set + 1) + ' starts in';
      sub = 'Set ' + seg.set + ' of ' + level.sets + ' complete';
      $('wEx').textContent = '5 minute recovery';
    }
    $('wName').textContent = name;
    $('dLabel').textContent = label;
    $('howToLabel').textContent = seg.type === 'setrest' ? 'How to: ' + exName(guideTarget(seg)) : 'How to';
    $('howTo').setAttribute('aria-label', 'How to do ' + exName(guideTarget(seg)));

    var skipLabel = seg.type === 'setrest' ? 'Start set ' + (seg.set + 1) : 'Start now';
    var showStart = seg.type === 'prep' || seg.type === 'rest' || seg.type === 'setrest';
    $('skip').classList.toggle('has-text', showStart);
    $('skipText').textContent = skipLabel;
    $('skip').setAttribute('aria-label', showStart ? skipLabel + ': ' + exName(seg.next || seg.exercise) : 'Next interval');

    // progress bar
    var bars = $('segs').children;
    for (var i = 0; i < bars.length; i++) {
      bars[i].style.setProperty('--p', i < idx ? 1 : 0);
      bars[i].classList.toggle('now', i === idx);
    }

    // flash, particles, sound, voice
    flash(ph.flash, sub);
    var stage = $('stage').getBoundingClientRect();
    fx.burst(stage.left + stage.width / 2, stage.top + stage.height / 2, c.concat(['#ffffff']), seg.type === 'work' ? 90 : 50, seg.type === 'work' ? 1 : 0.6);
    if (seg.type === 'work') { A.play('go'); buzz([60, 40, 120]); }
    else if (seg.type === 'rest' || seg.type === 'setrest') { A.play('rest'); buzz(80); }
    else if (seg.type === 'jacks') { A.play('jacks'); buzz([60, 40, 60]); }
    else A.play('click');

    var nextName = seg.next ? spoken(seg.next) : '';
    if (seg.type === 'prep') A.say('Get ready. First up, ' + spoken(seg.exercise) + '.');
    else if (seg.type === 'work') A.say((seg.slot === 0 && seg.set > 1 ? 'Set ' + seg.set + '. ' : '') + spoken(seg.exercise) + '. Go!');
    else if (seg.type === 'rest') A.say('Rest. ' + (nextName ? 'Next up, ' + nextName + '.' : ''));
    else if (seg.type === 'jacks') A.say('Jumping jacks! ' + (nextName ? 'Next up, ' + nextName + '.' : 'Last one, finish strong!'));
    else if (seg.type === 'setrest') A.say('Set ' + seg.set + ' complete. Great work. Take five minutes. Grab some water and keep moving.');

    var stageEl = $('workout');
    stageEl.classList.remove('shake');
    if (seg.type === 'work' && !reduced) { void stageEl.offsetWidth; stageEl.classList.add('shake'); }
  }

  var flashTimer = 0;
  function flash(text, sub) {
    var el = $('flash'), t = $('flashText');
    if (!text) return;
    t.textContent = text;
    t.dataset.text = text;
    $('flashSub').textContent = sub || '';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.classList.remove('show'); }, 1400);
  }

  var digitsText = '';
  function setDigits(text, spokenLabel) {
    var dg = $('digits');
    if (text !== digitsText) {
      if (text.length !== digitsText.length) {
        dg.textContent = '';
        for (var i = 0; i < text.length; i++) {
          var sp = document.createElement('span');
          sp.className = text[i] === ':' ? 'd colon' : 'd';
          dg.appendChild(sp);
        }
      }
      for (var j = 0; j < text.length; j++) dg.children[j].textContent = text[j];
      dg.classList.toggle('long', text.length > 2);
      digitsText = text;
    }
    dg.setAttribute('aria-label', spokenLabel);
  }

  /** Called once per whole second of countdown (and on any jump). */
  function onSecond(seg, whole, prev) {
    var long = seg.duration >= 60;
    setDigits(long ? H.formatTime(whole) : String(whole), (long ? H.formatTime(whole) : whole + ' seconds') + ' left');
    var dg = $('digits');
    var natural = prev != null && whole === prev - 1 && run.playing;
    if (!natural) return;
    dg.classList.remove('tick', 'final');
    void dg.offsetWidth;
    if (whole <= 3) {
      dg.classList.add('final');
      A.play(whole === 1 ? 'tickLast' : 'tick');
      bg.beatNow(1);
      ring.shock(0.7);
      ring.hot = Math.max(ring.hot, 0.8);
      buzz(35);
    } else {
      dg.classList.add('tick');
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
      else if (whole === 10) A.say('Ten seconds. Keep pushing!');
    } else if (seg.type === 'jacks') {
      if (whole === 10) A.say(nx ? 'Ten seconds. ' + nx + ' next.' : 'Ten seconds. Finish strong!');
    } else if (seg.type === 'rest') {
      if (whole === 10) A.say('Ten seconds. Get ready for ' + nx + '.');
    } else if (seg.type === 'setrest') {
      if (whole === 240 || whole === 180 || whole === 120) A.say((whole / 60) + ' minutes left in your break.');
      else if (whole === 60) A.say('One minute. Set ' + (seg.set + 1) + ' is coming up.');
      else if (whole === 30) A.say('Thirty seconds. First up, ' + nx + '. Get in position.');
      else if (whole === 10) A.say('Ten seconds.');
    }
    if (seg.type === 'setrest' && whole <= 30 && !run.figSwapped && seg.next && workFig) {
      run.figSwapped = true;
      workFig.setExercise(seg.next);
      workFig.pulse();
    }
  }

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
  }

  /** The always-visible "what's next and when" line. */
  function nextLine(idx, t) {
    var tl = run.tl, segs = tl.segments, seg = segs[idx];
    var nw = H.nextWorkIndex(tl, idx);
    if (seg.type === 'prep') return '';
    if (seg.type === 'rest') return '';
    if (seg.type === 'setrest') return nw >= 0 ? 'First up: <b>' + esc(exName(segs[nw].exercise)) + '</b>' : '';
    // work or jacks
    for (var i = idx + 1; i < segs.length && (nw < 0 || i < nw); i++) {
      if (segs[i].type === 'setrest') return 'Set break in <b>' + clock(segs[i].start - t) + '</b>';
    }
    if (nw >= 0) {
      var then = segs[idx + 1] && segs[idx + 1].type === 'jacks' && seg.type === 'work' ? ' after jacks' : '';
      return 'Next: <b>' + esc(exName(segs[nw].exercise)) + '</b> in <b>' + clock(segs[nw].start - t) + '</b>' + then;
    }
    if (seg.type === 'work' && segs[idx + 1] && segs[idx + 1].type === 'jacks') return 'Then <b>30s jumping jacks</b> to finish';
    return '<b>Last interval.</b> Finish strong!';
  }

  function update() {
    if (!run || run.finished) return;
    var tl = run.tl;
    var t = elapsedNow();
    var idx = H.segmentAt(tl, t);
    if (idx >= tl.segments.length) { finish(); return; }
    if (idx !== run.segIdx) enterSegment(idx);
    var seg = tl.segments[idx];
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
    updateCoach(seg, t);

    ring.progress = remaining / seg.duration;
    ring.total = t / tl.total;
    var cur = $('segs').children[idx];
    if (cur) cur.style.setProperty('--p', ((t - seg.start) / seg.duration).toFixed(4));

    var sec = Math.floor(t);
    if (sec !== run.lastClock) {
      run.lastClock = sec;
      $('hElapsed').textContent = H.formatTime(Math.floor(t));
      $('hLeft').textContent = clock(tl.total - t);
    }
  }

  function skip() {
    if (!run) return;
    var idx = H.segmentAt(run.tl, elapsedNow());
    var next = run.tl.segments[idx + 1];
    A.play('click');
    seek(next ? next.start : run.tl.total);
  }
  function prev() {
    if (!run) return;
    var t = elapsedNow();
    var idx = H.segmentAt(run.tl, t);
    var seg = run.tl.segments[Math.min(idx, run.tl.segments.length - 1)];
    A.play('click');
    if (t - seg.start < 3 && idx > 0) {
      seek(run.tl.segments[idx - 1].start);
    } else {
      run.segIdx = -1; // replay the entry effects for this interval
      seek(seg.start);
    }
  }

  var doneFig = null;
  function finish() {
    if (!run || run.finished) return;
    run.finished = true;
    recordWorkout(run.active);
    unlockScreen();
    A.play('finish');
    A.say('Workout complete. Great job!');
    buzz([100, 60, 100, 60, 240]);

    document.body.dataset.phase = 'done';
    bg.setMood(PHASE.done.colors[0], PHASE.done.colors[1], PHASE.done.energy);
    bg.flashNow();
    bg.setRunning(true);
    if (workFig) workFig.setPlaying(false);
    showScreen('done');

    var tl = run.tl;
    var workSec = 0;
    Object.keys(run.perEx).forEach(function (k) { workSec += run.perEx[k]; });
    $('dTime').textContent = H.formatTime(run.active);
    $('dWork').textContent = H.formatTime(workSec);
    $('dCount').textContent = String(state.hist.completed);
    $('dStreak').textContent = String(liveStreak());
    var list = $('doneList');
    list.textContent = '';
    tl.exercises.concat(tl.level.recoverType === 'jacks' ? ['jacks'] : []).forEach(function (id) {
      var ex = H.get(id);
      var li = document.createElement('li');
      li.dataset.group = ex.group;
      li.innerHTML = '<span>' + esc(ex.name) + '</span><b>' + H.formatTime(run.perEx[id] || 0) + '</b>';
      list.appendChild(li);
    });
    if (!doneFig) doneFig = makeFig($('doneFig'), { exercise: 'jacks', primary: PHASE.done.colors[0], secondary: PHASE.done.colors[1], quality: 'high', energy: 1 });
    else { doneFig.setExercise('jacks'); doneFig.setPlaying(true); }
    doneFig.pulse();
    requestAnimationFrame(function () { focusOn($('doneFig')); });
    fx.confetti(['#ffd23f', '#ff2bd6', '#22e5ff', '#c6ff1a', '#ffffff']);
    setTimeout(function () { var r = $('doneFig').getBoundingClientRect(); fx.burst(r.left + r.width / 2, r.top + r.height / 2, ['#ffd23f', '#ff2bd6', '#ffffff'], 120, 1.2); }, 200);
    setTimeout(function () { $('again').focus(); }, 400);
  }

  function endRun() {
    if (run) run.finished = true;
    run = null;
    unlockScreen();
    A.stopVoice();
    if (workFig) workFig.setPlaying(false);
    $('pausedVeil').hidden = true;
    $('quitDialog').hidden = true;
    $('coachSheet').hidden = true;
  }

  // quit dialog
  var resumeAfterDialog = false;
  function openQuit() {
    if (!run) return;
    resumeAfterDialog = run.playing;
    pauseQuietly();
    $('pausedVeil').hidden = true;
    $('quitDialog').hidden = false;
    $('quitNo').focus();
  }
  function closeQuit(resume) {
    $('quitDialog').hidden = true;
    if (resume && resumeAfterDialog) setPlaying(true);
    else if (run && !run.playing) setPauseUi(true);
    $('quit').focus();
  }

  // ================================================================ MAIN LOOP
  function tickActive(dt) {
    if (!run || run.finished || !run.playing) return;
    run.active += dt;
    var seg = run.tl.segments[run.segIdx];
    if (seg && (seg.type === 'work' || seg.type === 'jacks')) run.perEx[seg.exercise] = (run.perEx[seg.exercise] || 0) + dt;
  }

  var lastFrame = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (run && !run.finished) {
      tickActive(dt);
      update();
      if (currentScreen === 'workout') ring.draw(dt);
    }
    fx.draw(dt);
  }
  requestAnimationFrame(frame);
  // Keep the clock (and its sound cues) running when the tab is in the background.
  var lastBgTick = performance.now();
  setInterval(function () {
    var now = performance.now();
    if (document.hidden && run && !run.finished) {
      tickActive((now - lastBgTick) / 1000);
      update();
    }
    lastBgTick = now;
  }, 250);
  document.addEventListener('visibilitychange', function () {
    lastFrame = performance.now();
    lastBgTick = performance.now();
    if (!document.hidden && run && !run.finished) lockScreen();
  });

  // ================================================================ EVENTS
  function syncToggles() {
    [['sfxToggle', 'sfx', '#i-sound', '#i-mute'], ['wSound', 'sfx', '#i-sound', '#i-mute'], ['voiceToggle', 'voice', '#i-voice', '#i-voice-off']].forEach(function (t) {
      var on = A.get(t[1]);
      var b = $(t[0]);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('use').setAttribute('href', on ? t[2] : t[3]);
    });
  }

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
    $('start').addEventListener('click', function (e) {
      var r = e.currentTarget.getBoundingClientRect();
      fx.burst(r.left + r.width / 2, r.top + r.height / 2, ['#ff2bd6', '#ff8a1f', '#ffffff'], 70, 0.8);
      startWorkout(state.ids);
    });
    $('heroGuide').addEventListener('click', function (e) { openGuide(hero.shown || state.ids[0], 'setup', e.currentTarget); });

    $('sfxToggle').addEventListener('click', function () { A.set('sfx', !A.get('sfx')); A.unlock(); A.play('click'); syncToggles(); savePrefs(); });
    $('wSound').addEventListener('click', function () { var on = !A.get('sfx'); A.set('sfx', on); A.set('voice', on); syncToggles(); savePrefs(); });
    $('voiceToggle').addEventListener('click', function () {
      var on = !A.get('voice'); A.set('voice', on); A.unlock();
      if (on) A.say('Voice coach on.');
      syncToggles(); savePrefs();
    });

    $('pause').addEventListener('click', function () { if (run) setPlaying(!run.playing); });
    $('resume').addEventListener('click', function () { setPlaying(true); });
    $('endFromPause').addEventListener('click', function () { endRun(); showScreen('setup'); });
    $('skip').addEventListener('click', skip);
    $('prev').addEventListener('click', prev);
    $('quit').addEventListener('click', openQuit);
    $('quitNo').addEventListener('click', function () { closeQuit(true); });
    $('quitYes').addEventListener('click', function () { endRun(); showScreen('setup'); });
    $('howTo').addEventListener('click', function (e) {
      if (!run) return;
      var seg = run.tl.segments[run.segIdx];
      if (seg) openGuide(guideTarget(seg), 'workout', e.currentTarget);
    });

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

    document.addEventListener('keydown', function (e) {
      var sheetOpen = !$('coachSheet').hidden;
      if (sheetOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeGuide(); }
        else if (e.key === 'Tab') trapTab(e, $('coachSheet'));
        return;
      }
      if (currentScreen !== 'workout' || !run) return;
      var dialogOpen = !$('quitDialog').hidden;
      if (e.key === 'Escape') { e.preventDefault(); if (dialogOpen) closeQuit(true); else openQuit(); return; }
      if (dialogOpen) { if (e.key === 'Tab') trapTab(e, $('quitDialog')); return; }
      if (e.key === ' ' || e.code === 'Space') {
        var ae = document.activeElement;
        if (ae && ae.tagName === 'BUTTON') return; // a focused button handles Space itself
        e.preventDefault(); setPlaying(!run.playing);
      } else if (e.key === 'ArrowRight') { e.preventDefault(); skip(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    });

    var scrollRaf = 0;
    function refocus() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        focusOn(currentScreen === 'setup' ? $('heroFig') : currentScreen === 'workout' ? $('stage') : $('doneFig'));
      });
    }
    window.addEventListener('scroll', refocus, { passive: true });
    window.addEventListener('resize', refocus);
  }

  // ================================================================ BOOT
  buildGrid();
  bind();
  syncToggles();
  showScreen('setup');
  showHero(state.ids[0]);
  renderSetup();
  setInterval(heroCycle, 3600);

  // Small test hook for automated checks (no effect on the app).
  window.__hiit = {
    state: state,
    get run() { return run; },
    seek: function (t) { seek(t); },
    start: function () { startWorkout(state.ids); },
    finish: function () { if (run) seek(run.tl.total); },
    guide: function (id) { openGuide(id, run ? 'workout' : 'setup'); }
  };
})();
