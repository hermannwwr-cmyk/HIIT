// Shared harness: realistic CDP touch on the HIIT workout screen.
const { chromium } = require('playwright');

const SPEECH_MOCK = () => {
  // speech that "works": onstart soon, onend after a length-based delay
  const q = []; let cur = null;
  const ss = {
    speaking: false, pending: false, paused: false,
    speak(u) {
      q.push(u); this.pending = true;
      const pump = () => {
        if (cur || !q.length) return;
        cur = q.shift(); ss.pending = q.length > 0; ss.speaking = true;
        const u2 = cur;
        setTimeout(() => { if (u2.onstart) u2.onstart({}); }, 15);
        setTimeout(() => { if (cur === u2) { cur = null; ss.speaking = false; if (u2.onend) u2.onend({}); pump(); } }, 120 + (u2.text || '').length * 18);
      };
      pump();
    },
    cancel() { const c = cur; cur = null; q.length = 0; this.speaking = false; this.pending = false; if (c && c.onend) setTimeout(() => c.onend({}), 1); },
    resume() {}, pause() {}, getVoices() { return [{ name: 'Mock', lang: 'en-US', default: true, localService: true }]; },
    addEventListener() {}, removeEventListener() {}, onvoiceschanged: null
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: ss });
  window.__log = { clicks: [], errors: [], audio: [] };
  addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) window.__log.clicks.push(b.id || b.className); }, true);
  addEventListener('error', e => window.__log.errors.push(String(e.message)));
  const ce = console.error; console.error = function () { window.__log.errors.push([].join.call(arguments, ' ')); return ce.apply(console, arguments); };
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const A = window.HIITAudio; if (!A) return;
      ['play', 'say'].forEach(k => { const o = A[k]; A[k] = function (x) { window.__log.audio.push(k + ':' + x); return o.apply(this, arguments); }; });
    }, 0);
  });
};

async function open({ url, width = 390, height = 844, dsf = 1, frame = null, scale = 1 }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: dsf,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript(SPEECH_MOCK);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(frame || url);
  await page.waitForTimeout(700);
  const f = frame ? page.frames().find(x => x !== page.mainFrame()) : page.mainFrame();
  const cdp = await ctx.newCDPSession(page);
  // frame -> top-page mapping (iframe may be CSS scaled)
  let ox = 0, oy = 0, k = 1;
  async function remap() {
    if (!frame) return;
    const r = await page.evaluate(() => { const el = document.querySelector('iframe'); const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, cw: el.clientWidth || el.offsetWidth }; });
    const inner = await f.evaluate(() => innerWidth);
    ox = r.x; oy = r.y; k = r.w / inner;
  }
  await remap();
  const P = (x, y, rr) => ({ x: ox + x * k, y: oy + y * k, radiusX: rr, radiusY: rr * 1.15, force: 0.6, id: TID });
  /** path: [[x, y, dtMs], ...] in frame CSS px; first is the touchstart. opts: r, cancel, hold, after, onMove(i) */
  let TID = 1;
  async function touch(path, opts = {}) {
    TID++;
    const r = opts.r || 24; let vt = Date.now() / 1000;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(path[0][0], path[0][1], r)], timestamp: vt });
    for (let i = 1; i < path.length; i++) {
      const dt = path[i][2] || 0;
      if (dt) { await page.waitForTimeout(dt); vt += dt / 1000; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(path[i][0], path[i][1], r)], timestamp: vt });
      if (opts.onMove) await opts.onMove(i);
    }
    const end = opts.endDt != null ? opts.endDt : 8;
    if (opts.hold) { await page.waitForTimeout(opts.hold); vt += opts.hold / 1000; }
    if (end) { await page.waitForTimeout(end); vt += end / 1000; }
    await cdp.send('Input.dispatchTouchEvent', { type: opts.cancel ? 'touchCancel' : 'touchEnd', touchPoints: [], timestamp: vt });
    await page.waitForTimeout(opts.after != null ? opts.after : 750);
  }
  // motion profiles. ease: 'lin' | 'in' (accelerating, released while fastest) | 'inout'
  function stroke(x0, y0, dx, dy, ms, n, ease = 'in', drift = 0) {
    const e = { lin: s => s, in: s => s * s, inout: s => s < .5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s), out: s => 1 - (1 - s) * (1 - s) }[ease];
    const a = [[x0, y0, 0]];
    for (let i = 1; i <= n; i++) { const s = e(i / n); a.push([x0 + dx * s, y0 + dy * s + drift * Math.sin(Math.PI * i / n), ms / n]); }
    return a;
  }
  const st = () => f.evaluate(() => {
    const H = window.__hiit, r = H.run; if (!r) return { i: -1 };
    const seg = r.tl.segments[r.segIdx];
    const t = r.base + (r.playing ? (performance.now() - r.anchor) / 1000 : 0);
    return { i: r.segIdx, type: seg && seg.type, into: seg ? +(t - seg.start).toFixed(2) : 0, playing: r.playing, finished: r.finished, mode: r.mode,
      toast: !document.getElementById('toast').hidden, toastText: document.getElementById('toastText').textContent,
      carousel: document.getElementById('stage').className, n: r.tl.segments.length };
  });
  const go = async (type, off = 5, nth = 0) => {
    await f.evaluate(([t, o, n]) => {
      const tl = window.__hiit.run.tl, s = tl.segments.filter(x => x.type === t)[n];
      window.__hiit.seek(s.start + o);
    }, [type, off, nth]);
    await page.waitForTimeout(450);
    await f.evaluate(() => { document.getElementById('toast').hidden = true; window.__log.audio.length = 0; window.__log.clicks.length = 0; });
    return st();
  };
  const box = async sel => { const b = await f.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; }, sel); return b; };
  const log = () => f.evaluate(() => { const l = JSON.parse(JSON.stringify(window.__log)); window.__log.audio.length = 0; window.__log.clicks.length = 0; return l; });
  async function toWorkout() {
    await f.locator('#start').click(); await page.waitForTimeout(600);
    await f.locator('#bStart').click(); await page.waitForTimeout(900);
  }
  return { browser, ctx, page, f, cdp, touch, stroke, st, go, box, log, toWorkout, errs, remap };
}
module.exports = { open };
