// Round-2 regressions: armed flicker, double-bound listeners, the 8 s timeout, the sliver, rapid-flick settles.
const { open } = require('../lib');
const fs = require('fs'); const SH = __dirname + (process.env.SH || '/shots/'); fs.mkdirSync(SH, { recursive: true });
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), dsf: 2 });
  await h.toWorkout();
  const { f, page, cdp, touch, stroke, st, go, box, log } = h;
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;
  await f.evaluate(() => {
    window.__arm = []; window.__buzz = 0;
    const o = navigator.vibrate; navigator.vibrate = function () { window.__buzz++; return true; };
    new MutationObserver(() => { const a = document.getElementById('transport').classList.contains('armed'); const L = window.__arm; if (!L.length || L[L.length - 1][1] !== a) L.push([Math.round(performance.now()), a]); }).observe(document.getElementById('transport'), { attributes: true, attributeFilter: ['class'] });
  });
  // 1) armed flicker: drags near the flick speed with natural speed noise, never reaching commitDist
  for (const [label, base, noise] of [['~0.22 px/ms +-0.1', 3.5, 1.6], ['~0.27 px/ms +-0.12', 4.3, 2], ['fast start then slow (0.6 -> 0.15)', null, null]]) {
    await go('work', 6); await f.evaluate(() => window.__arm.length = 0);
    const p = [[cx + 80, cy, 0]]; let x = cx + 80;
    for (let i = 0; i < 24; i++) { const step = base == null ? (i < 6 ? 9.6 : 2.4) : base + noise * Math.sin(i * 1.7) ; x -= step; p.push([x, cy + Math.sin(i / 4) * 3, 16]); }
    await touch(p, { hold: 200 });
    const seq = await f.evaluate(() => window.__arm.map(a => a[1] ? 'ON' : 'off'));
    console.log('armed during drag', label, Math.round(cx + 80 - x) + 'px:', seq.join(','), '-> toggles', seq.length - 1);
  }
  // 2) double-bound listeners: a swipe that starts on the next slice's hit area or on redrawn text => one skip, one Undo line
  for (const sel of ['#skip', '#wNext b', '#digits span']) {
    const a = await go('work', 6);
    const [x, y] = await box(sel);
    await touch(stroke(Math.min(x, 330), y, -80, 4, 120, 7, 'in'));
    const b = await st(); const l = await log();
    console.log('swipe from', sel, '-> moved', b.i - a.i, '| toast', JSON.stringify(b.toastText), '| clicks', l.clicks.join() || '-', '| click sounds', l.audio.filter(x => x === 'play:click').length);
  }
  // 3) the 8 s timeout: drag 70 px, hold 9 s, then drag on to 160 px and let go
  { const a = await go('work', 4);
    let vt = Date.now() / 1000; const P = (x) => ({ x, y: cy, radiusX: 24, radiusY: 27, force: .6, id: 4242 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(cx + 80)], timestamp: vt });
    for (let i = 1; i <= 10; i++) { vt += .03; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(cx + 80 - i * 7)], timestamp: vt }); await page.waitForTimeout(30); }
    await page.waitForTimeout(9000); vt += 9;
    const mid = await f.evaluate(() => document.getElementById('stage').className);
    for (let i = 11; i <= 23; i++) { vt += .03; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(cx + 80 - i * 7)], timestamp: vt }); await page.waitForTimeout(30); }
    const late = await f.evaluate(() => [document.getElementById('stage').className, getComputedStyle(document.getElementById('riCur')).transform]);
    await page.waitForTimeout(200); vt += .2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: vt });
    await page.waitForTimeout(700);
    const b = await st();
    console.log('held 9 s mid-drag: stage after hold', JSON.stringify(mid), '| dragging on to 160 px:', JSON.stringify(late), '| released ->', b.i - a.i);
  }
  // 4) the sliver: where is it, does it catch taps, does it cover the ring or pause?
  for (const [type, off] of [['rest', 8], ['prep', 3], ['setrest', 20]]) {
    await go(type, off); await page.waitForTimeout(1800);
    const info = await f.evaluate(() => {
      const st = document.getElementById('stage'), e = document.getElementById('riEdge');
      if (!e) return { cls: st.className, sliver: 'gone (the neighbouring dials are drawn on the canvas now)' };
      const c = e.querySelector('.ri-edge-c'), r = c.getBoundingClientRect(), ring = document.getElementById('ring').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      const pe = getComputedStyle(e).pointerEvents;
      return { cls: st.className, display: getComputedStyle(e).display, edgeBox: [r.left, r.top, r.width, r.height].map(Math.round), pe, hitAtSliver: hit && (hit.id || hit.className), ri: getComputedStyle(st).getPropertyValue('--ri') };
    });
    console.log(type, 'sliver:', JSON.stringify(info));
    await page.screenshot({ path: SH + 'sliver-' + type + '.png' });
    // tap the pause right after, and a tap on the sliver spot
    const [px, py] = await box('#pause');
    await touch([[px, py, 0]], { endDt: 60, after: 400 });
    const pl = (await st()).playing;
    await f.evaluate(() => { const r = window.__hiit.run; if (!r.playing) { const b = document.querySelector('#pausedVeil button'); b && b.click(); } }); await page.waitForTimeout(500);
    console.log('   tap pause in', type, '-> paused:', !pl, '| clicks', (await log()).clicks.join());
  }
  // 5) rapid flicks: sample every frame for backward jumps / flashes
  await f.evaluate(() => {
    window.__fr = [];
    (function loop(t) { const cur = document.getElementById('riCur'), pk = document.getElementById('riPeek'), stg = document.getElementById('stage');
      window.__fr.push([Math.round(t), Math.round(new DOMMatrix(getComputedStyle(cur).transform).m41), +getComputedStyle(cur).opacity, Math.round(new DOMMatrix(getComputedStyle(pk).transform).m41), getComputedStyle(pk).display === 'none' ? 0 : +getComputedStyle(pk).opacity, stg.className.replace('w-stage', '').trim(), window.__hiit.run.segIdx]);
      requestAnimationFrame(loop); })(performance.now());
  });
  for (const gap of [190, 60]) {
    const a = await go('work', 3, 1); await f.evaluate(() => window.__fr.length = 0);
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 390, maxHeight: 844 });
    let n = 0; const frames = [];
    cdp.on('Page.screencastFrame', async fr => { frames.push(fr.data); cdp.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {}); });
    for (let k = 0; k < 5; k++) await touch(stroke(cx + 50, cy, -70, 6, 110, 7, 'in'), { after: gap });
    await page.waitForTimeout(900);
    await cdp.send('Page.stopScreencast');
    const b = await st();
    const fr = await f.evaluate(() => window.__fr.slice());
    // glitches: current page moving right (back) while not springing back, or a visible jump > 60 px between frames while settling
    const gl = [];
    for (let i = 1; i < fr.length; i++) {
      const [t, x, o, px, po, cls, si] = fr[i], p = fr[i - 1];
      if (si === p[6] && /settle/.test(cls) && x - p[1] > 2) gl.push(`t${t - fr[0][0]} cur moved back ${p[1]}->${x}`);
      if (si === p[6] && Math.abs(x - p[1]) > 70) gl.push(`t${t - fr[0][0]} jump ${p[1]}->${x} (${cls})`);
    }
    console.log(`5 flicks, ${gap} ms apart: moved ${b.i - a.i}; ${fr.length} frames; glitches: ${gl.length ? gl.slice(0, 8).join('; ') : 'none'}`);
    const dir = SH + 'rapid' + gap + '/'; fs.mkdirSync(dir, { recursive: true });
    frames.forEach((d, i) => fs.writeFileSync(dir + String(i).padStart(3, '0') + '.png', Buffer.from(d, 'base64')));
    fs.writeFileSync(dir + 'frames.json', JSON.stringify(fr));
    cdp.removeAllListeners('Page.screencastFrame');
  }
  console.log('errors', h.errs, (await log()).errors);
  await h.browser.close();
})();
