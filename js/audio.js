/*
 * Synthesised sound effects (Web Audio, no files) and an optional voice
 * coach (speechSynthesis). Everything fails silently: sound is a bonus.
 */
(function () {
  'use strict';

  var ctx = null, master = null;
  var settings = { sfx: true, voice: true };

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      var comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  /** Call from a user gesture so browsers allow audio. */
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* ignore */ } }
    if (window.speechSynthesis && settings.voice) {
      try {
        var u = new SpeechSynthesisUtterance(' ');
        u.volume = 0; window.speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    }
  }

  function tone(freq, start, dur, opts) {
    opts = opts || {};
    var c = ctx;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, start);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    var vol = opts.vol == null ? 0.4 : opts.vol;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    var node = o;
    if (opts.filter) {
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.filter; f.Q.value = 6;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(master);
    o.start(start); o.stop(start + dur + 0.05);
  }

  var sounds = {
    // last 3 seconds: loud, bright beeps that carry on a phone speaker (1–2.5 kHz)
    tick: function (t) {
      tone(988, t, 0.18, { type: 'square', vol: 0.34, filter: 3200 });
      tone(1976, t, 0.09, { type: 'triangle', vol: 0.2 });
    },
    tickLast: function (t) {
      tone(1319, t, 0.26, { type: 'square', vol: 0.4, filter: 3800 });
      tone(2637, t, 0.12, { type: 'triangle', vol: 0.22 });
    },
    // 10 seconds left: a two-note chime, clearly different from the ticks
    alert10: function (t) {
      [[1319, 0], [1760, 0.16]].forEach(function (n) {
        tone(n[0], t + n[1], 0.5, { type: 'triangle', vol: 0.42 });
        tone(n[0] * 2, t + n[1], 0.22, { type: 'sine', vol: 0.12 });
      });
    },
    // 9 … 4: a short wood-block tick each second
    tickSoft: function (t) {
      tone(1568, t, 0.05, { type: 'triangle', vol: 0.3 });
      tone(784, t, 0.04, { type: 'sine', vol: 0.12 });
    },
    // warm-up: "ready…" (two rising beeps) then a loud start signal before the count begins
    ready: function (t) {
      tone(880, t, 0.12, { type: 'square', vol: 0.26, filter: 3000 });
      tone(1175, t + 0.18, 0.14, { type: 'square', vol: 0.3, filter: 3200 });
    },
    start: function (t) {
      [783.99, 987.77, 1174.66, 1567.98].forEach(function (f, i) {
        tone(f, t + i * 0.035, 0.55, { type: 'sawtooth', vol: 0.2, filter: 4200 });
      });
      tone(2093, t + 0.12, 0.35, { type: 'triangle', vol: 0.22, to: 2637 });
      tone(120, t, 0.32, { type: 'sine', to: 60, vol: 0.65 });
    },
    go: function (t) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, t + i * 0.055, 0.42 - i * 0.05, { type: 'sawtooth', vol: 0.18, filter: 3200 });
      });
      tone(110, t, 0.35, { type: 'sine', to: 55, vol: 0.6 });
    },
    rest: function (t) {
      tone(659.25, t, 0.35, { type: 'sine', vol: 0.3 });
      tone(493.88, t + 0.16, 0.5, { type: 'sine', vol: 0.3 });
    },
    jacks: function (t) {
      tone(392, t, 0.14, { type: 'square', vol: 0.12, filter: 2200 });
      tone(587.33, t + 0.09, 0.14, { type: 'square', vol: 0.12, filter: 2200 });
      tone(783.99, t + 0.18, 0.3, { type: 'square', vol: 0.12, filter: 2600 });
      tone(90, t, 0.3, { type: 'sine', to: 50, vol: 0.5 });
    },
    halfway: function (t) { tone(987.77, t, 0.08, { vol: 0.2 }); tone(987.77, t + 0.12, 0.08, { vol: 0.2 }); },
    click: function (t) { tone(1400, t, 0.04, { type: 'triangle', vol: 0.12 }); },
    beat: function (t) { tone(1046.5, t, 0.05, { type: 'triangle', vol: 0.22 }); },
    beatAccent: function (t) { tone(1568, t, 0.09, { type: 'triangle', vol: 0.32 }); tone(784, t, 0.12, { type: 'sine', vol: 0.18 }); },
    finish: function (t) {
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      notes.forEach(function (f, i) { tone(f, t + i * 0.09, 0.6, { type: 'sawtooth', vol: 0.13, filter: 4000 }); });
      tone(130.81, t, 1.2, { type: 'sine', vol: 0.45 });
      tone(196, t + 0.54, 1.0, { type: 'triangle', vol: 0.2 });
    }
  };

  function play(name) {
    if (!settings.sfx) return;
    var c = ensure();
    if (!c || !sounds[name]) return;
    try {
      clearTimeout(sleep.t);
      if (c.state === 'suspended') c.resume();
      sounds[name](c.currentTime + 0.01);
    } catch (e) { /* ignore */ }
  }

  var voiceCache = null;
  function pickVoice() {
    if (voiceCache !== null) return voiceCache;
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      var en = voices.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
      voiceCache = en.filter(function (v) { return /Google|Samantha|Daniel|Natural|Neural|Aria|Jenny/i.test(v.name); })[0] || en[0] || null;
    } catch (e) { voiceCache = null; }
    return voiceCache;
  }
  if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function () { voiceCache = null; };
  }

  function say(text) {
    if (!settings.voice || !window.speechSynthesis || !text) return;
    try {
      var s = window.speechSynthesis;
      s.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.05; u.pitch = 1; u.volume = 1;
      s.speak(u);
    } catch (e) { /* ignore */ }
  }

  /** Is the coach still talking? (Used to let an instruction finish before a move starts.) */
  function speaking() {
    try { return !!(settings.voice && window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)); } catch (e) { return false; }
  }

  function stopVoice() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  /** Let the audio hardware idle (paused / finished). play() wakes it again. */
  function sleep(delayMs) {
    if (!ctx) return;
    clearTimeout(sleep.t);
    sleep.t = setTimeout(function () { try { if (ctx.state === 'running') ctx.suspend(); } catch (e) { /* ignore */ } }, delayMs == null ? 2500 : delayMs);
  }

  window.HIITAudio = {
    unlock: unlock, play: play, say: say, stopVoice: stopVoice, sleep: sleep, speaking: speaking,
    set: function (k, v) { settings[k] = !!v; if (k === 'voice' && !v) stopVoice(); },
    get: function (k) { return settings[k]; },
    voiceSupported: function () { return !!window.speechSynthesis; }
  };
})();
