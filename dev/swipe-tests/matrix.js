// Adversarial gesture matrix. usage: node matrix.js [w h] [frameUrl] [busy]
const { open } = require('./lib');
const W0 = +process.argv[2] || 390, H0 = +process.argv[3] || 844;
const FRAME = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;
const BUSY = process.argv[5] === 'busy';
const out = []; let fails = 0;
function check(name, ok, info) { out.push((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + (typeof info === 'string' ? info : JSON.stringify(info)) + ']' : '')); if (!ok) fails++; }

(async () => {
  const h = await open({ url: (process.env.URL||'http://127.0.0.1:8731/index.html'), width: W0, height: H0, frame: FRAME });
  const { touch, stroke, st, go, box, log, f, page } = h;
  await h.toWorkout();
  await h.remap();
  if (BUSY) await f.evaluate(() => { (function spin() { const t = performance.now(); while (performance.now() - t < 30); requestAnimationFrame(spin); })(); });
  const W = await f.evaluate(() => innerWidth);
  let [cx, cy] = await box('#stage');
  cy -= 30; // over the figure
  const L = (s, a) => s.i === a.i + 1 ? 'next' : s.i === a.i - 1 ? 'prev' : s.i === a.i ? (s.into < a.into - 1 ? 'restart' : 'stay') : ('jump' + (s.i - a.i));

  async function trial(name, type, path, expect, opts = {}, off = 6) {
    const a = await go(type, off, opts.nth || 0);
    await touch(path, opts);
    const b = await st(); const l = await log();
    const got = L(b, a);
    const ok = Array.isArray(expect) ? expect.includes(got) : got === expect;
    check(type + ': ' + name + ' -> ' + (Array.isArray(expect) ? expect.join('|') : expect), ok, got + (l.clicks.length ? ' clicks=' + l.clicks : '') + (opts.audio ? ' audio=' + l.audio.length : ''));
    return { a, b, l, got };
  }

  // ---- sloppy quick flicks (40-80 px in 80-200 ms, vertical drift)
  for (const [dx, ms, dy, ease] of [[-40, 80, 8, 'in'], [-50, 120, -14, 'in'], [-60, 150, 18, 'inout'], [-80, 200, -22, 'inout'], [-45, 200, 10, 'lin'], [-70, 100, 25, 'out'], [-40, 150, 6, 'out']]) {
    await trial(`flick ${dx}px/${ms}ms dy${dy} ${ease}`, 'work', stroke(cx + 50, cy, dx, dy, ms, Math.max(3, Math.round(ms / 16)), ease), 'next');
  }
  for (const [dx, ms, dy] of [[45, 100, 10], [70, 160, -20]]) await trial(`flick right ${dx}px/${ms}ms dy${dy}`, 'work', stroke(cx - 50, cy, dx, dy, ms, Math.round(ms / 16), 'in'), 'restart');
  // thumb arcs (right thumb sweeping left: starts going up-left, curves)
  const arc = (x0, y0, R, a0, a1, ms, n) => { const p = [[x0, y0, 0]]; const ccx = x0 - R * Math.cos(a0), ccy = y0 - R * Math.sin(a0); for (let i = 1; i <= n; i++) { const s = (i / n) ** 1.6, a = a0 + (a1 - a0) * s; p.push([ccx + R * Math.cos(a), ccy + R * Math.sin(a), ms / n]); } return p; };
  await trial('thumb arc (pivot bottom-right, 90 px chord)', 'work', arc(cx + 60, cy + 30, 220, -2.0, -2.45, 180, 11), 'next');
  await trial('thumb arc starting upward (first 12 px vertical)', 'work', [[cx + 60, cy + 40, 0], [cx + 59, cy + 34, 16], [cx + 57, cy + 27, 16], [cx + 50, cy + 20, 16], [cx + 35, cy + 14, 16], [cx + 10, cy + 10, 16], [cx - 25, cy + 8, 16]], 'next');
  await trial('thumb arc steep 45deg up-left 90 px / 160 ms', 'work', stroke(cx + 60, cy + 40, -64, -64, 160, 10, 'in'), ['next', 'stay']);
  // slow drags released at 25% / 35% of width
  const slow = (frac) => [...stroke(cx + 80, cy, -W * frac, 5, 700, 40, 'inout')];
  await trial('slow drag 25% of width, still', 'work', slow(0.25), 'stay', { hold: 150 });
  await trial('slow drag 35% of width, still', 'work', slow(0.35), 'next', { hold: 150 });
  await trial('slow drag 35% then held 600 ms', 'work', slow(0.35), 'next', { hold: 600 });
  // flick then reverse
  await trial('drag 120 then flick back 60 fast', 'work', [...stroke(cx + 90, cy, -120, 0, 300, 18, 'lin'), ...stroke(cx - 30, cy, 60, 0, 80, 5, 'in').slice(1)], 'stay');
  await trial('flick out then return to start', 'work', [...stroke(cx + 60, cy, -80, 0, 120, 7, 'in'), ...stroke(cx - 20, cy, 80, 0, 160, 9, 'inout').slice(1)], 'stay');
  // swipes that start on the controls, and jittery taps on them
  for (const sel of ['#prev', '#pause', '#skip']) {
    const [bx, by] = await box(sel);
    const sx = Math.min(Math.max(bx, 40), W - 40);
    const r = await trial('flick left starting on ' + sel, 'work', stroke(sx + (sel === '#prev' ? 60 : 0), by, -70, 6, 120, 7, 'in'), 'next');
    check('  no click from swipe on ' + sel, !r.l.clicks.length, r.l.clicks.join());
  }
  for (const sel of ['#prev', '#pause', '#skip']) for (const j of [6, 8, 10]) {
    const [bx, by] = await box(sel);
    const a = await go('work', 8);
    await touch([[bx, by, 0], [bx + j * 0.5, by + 1, 30], [bx + j, by + j * 0.3, 30]], { endDt: 40 });
    const b = await st(); const l = await log();
    const expectClick = sel.slice(1);
    const okk = l.clicks.includes(expectClick) && l.clicks.length === 1;
    const effect = sel === '#pause' ? (!b.playing ? 'paused' : 'playing') : L(b, a);
    check(`tap ${sel} with ${j}px jitter -> one click`, okk, 'clicks=' + l.clicks.join() + ' effect=' + effect);
    if (sel === '#pause' && !b.playing) { await f.evaluate(() => document.querySelector('#pausedVeil [data-act=resume], #resume, #pausedVeil button') && 0); await f.evaluate(() => window.__hiit.run.playing || document.getElementById('pause').click()); await page.waitForTimeout(400); await f.evaluate(() => { const r = window.__hiit.run; if (!r.playing) { const b = document.querySelector('#pausedVeil button'); b && b.click(); } }); await page.waitForTimeout(500); }
  }
  // origins
  const [dgx, dgy] = await box('#digits');
  await trial('flick from timer digits', 'work', stroke(dgx + 40, dgy, -70, 8, 120, 7, 'in'), 'next');
  await trial('flick over the mannequin', 'work', stroke(cx + 30, cy - 40, -70, -8, 120, 7, 'in'), 'next');
  // rest: the Up next card
  { await go('rest', 5); const [ux, uy, uw, uh] = await box('#upNext'); check('rest shows Up next card', uw > 0, [ux, uy, uw, uh].map(Math.round)); }
  { const [ux, uy] = await box('#upNext'); await trial('flick from Up next card', 'rest', stroke(ux + 40, uy, -70, 5, 120, 7, 'in'), 'next', {}, 5); }
  { const [cx2, cy2] = await box('#stage'); await trial('flick over the rest dial', 'rest', stroke(cx2 + 40, cy2 - 30, -70, 5, 120, 7, 'in'), 'next', {}, 5);
    await trial('flick right over rest dial (back to exercise)', 'rest', stroke(cx2 - 40, cy2 - 30, 80, 5, 120, 7, 'in'), 'prev', {}, 5); }
  await trial('flick in prep', 'prep', stroke(cx + 40, cy, -70, 5, 120, 7, 'in'), 'next', {}, 3);
  await trial('flick in set break', 'setrest', stroke(cx + 40, cy, -70, 5, 120, 7, 'in'), 'next', {}, 20);
  await trial('flick in warm-up lead-in', 'warmup', stroke(cx + 40, cy, -70, 5, 120, 7, 'in'), 'next', {}, 1, 2);
  await trial('flick in warm-up move', 'warmup', stroke(cx + 40, cy, -70, 5, 120, 7, 'in'), 'next', {}, 9);
  // last interval
  { const a = await f.evaluate(() => { const s = window.__hiit.run.tl.segments; const last = s[s.length - 1]; window.__hiit.seek(last.start + 5); return s.length - 1; });
    await page.waitForTimeout(400); await log();
    await touch(stroke(cx + 50, cy, -80, 4, 120, 7, 'in'));
    const b = await st(); check('last interval: flick left -> nothing (stays, not finished)', b.i === a && !b.finished, b);
    await touch(stroke(cx + 60, cy, -200, 4, 500, 30, 'inout'), { hold: 100 });
    const c = await st(); check('last interval: long drag left -> nothing', c.i === a && !c.finished, c);
    const sc = await f.evaluate(() => [document.getElementById('stage').className, getComputedStyle(document.getElementById('riCur')).transform]);
    check('last interval: stage back at rest after resistance', sc[0] === 'w-stage' && (sc[1] === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(sc[1])), sc);
  }
  // rapid repeated flicks: 5 in 1.5 s
  { const a = await go('work', 3, 1);
    for (let k = 0; k < 5; k++) await touch(stroke(cx + 50, cy, -70, 6, 110, 7, 'in'), { after: 190 });
    await page.waitForTimeout(900);
    const b = await st();
    check('5 flicks in ~1.5 s -> 5 intervals on', b.i === a.i + 5, 'moved ' + (b.i - a.i) + ' toast="' + b.toastText + '"'); }
  // touchcancel mid-drag
  { const r = await trial('touchcancel mid-drag (armed, 150 px)', 'work', stroke(cx + 90, cy, -150, 0, 300, 18, 'lin'), 'stay', { cancel: true });
    const sc = await f.evaluate(() => document.getElementById('stage').className + '|' + document.getElementById('transport').className);
    check('  stage/transport clean after cancel', !/carousel|armed|charge/.test(sc), sc); }
  // sparse events: only 3 touchmoves
  await trial('sparse: 3 moves (5, 30, 70 px) over 120 ms', 'work', [[cx + 50, cy, 0], [cx + 45, cy + 1, 40], [cx + 20, cy + 3, 40], [cx - 20, cy + 4, 40]], 'next');
  await trial('sparse: 2 moves (12, 70 px) over 100 ms', 'work', [[cx + 50, cy, 0], [cx + 38, cy + 2, 50], [cx - 20, cy + 4, 50]], 'next');
  await trial('sparse: 1 move 70 px in 60 ms (coalesced)', 'work', [[cx + 50, cy, 0], [cx - 20, cy + 4, 60]], 'next');
  await trial('sparse: first move 4px, then 75 px', 'work', [[cx + 50, cy, 0], [cx + 46, cy + 1, 30], [cx - 25, cy + 4, 50]], 'next');
  // no double skip & Undo
  { const r = await trial('one flick -> exactly one skip', 'work', stroke(cx + 50, cy, -70, 6, 110, 7, 'in'), 'next');
    check('  Undo toast appears', r.b.toast, r.b.toastText);
    const plays = r.l.audio.filter(x => x.startsWith('play:')); const says = r.l.audio.filter(x => x.startsWith('say:'));
    check('  audio after skip is modest (no replayed round)', plays.length <= 4 && says.length <= 3, r.l.audio.join(' | ')); }
  // vertical drags stay the browser's
  await trial('vertical drag 200 px', 'work', stroke(cx, cy - 80, 8, 200, 300, 18, 'inout'), 'stay');
  await trial('vertical-ish flick 60 down, 25 sideways', 'work', stroke(cx, cy - 40, -25, 60, 120, 7, 'in'), 'stay');
  // edges
  await trial('flick from right edge (x=W-8)', 'work', stroke(W - 8, cy, -80, 0, 120, 7, 'in'), 'stay');
  await trial('flick from x=W-20', 'work', stroke(W - 20, cy, -80, 0, 120, 7, 'in'), 'next');
  // two fingers
  { const a = await go('work', 6);
    const P = (x, y, id) => ({ x, y, radiusX: 24, radiusY: 27, force: .6, id });
    let t = Date.now() / 1000;
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(cx + 40, cy, 1)], timestamp: t });
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(cx + 20, cy, 1)], timestamp: t += .016 });
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(cx + 20, cy, 1), P(cx - 40, cy + 60, 2)], timestamp: t += .016 });
    for (let k = 1; k < 6; k++) await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(cx + 20 - k * 20, cy, 1), P(cx - 40 - k * 5, cy + 60 + k * 10, 2)], timestamp: t += .016 });
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t += .016 });
    await page.waitForTimeout(700);
    const b = await st(); const sc = await f.evaluate(() => document.getElementById('stage').className);
    check('two fingers -> no skip, stage clean', b.i === a.i && sc === 'w-stage', L(b, a) + ' ' + sc);
    // and next single flick works again
    await trial('single flick after a 2-finger gesture', 'work', stroke(cx + 50, cy, -70, 6, 110, 7, 'in'), 'next'); }
  // paused: swiping does nothing, resume works
  { const a = await go('work', 6); await f.evaluate(() => document.getElementById('pause').click()); await page.waitForTimeout(400);
    await touch(stroke(cx + 50, cy, -70, 6, 110, 7, 'in'));
    const b = await st(); check('paused: flick does not skip', b.i === a.i, L(b, a));
    await f.evaluate(() => { const b = document.querySelector('#pausedVeil button'); b && b.click(); }); await page.waitForTimeout(500); }
  // keyboard and buttons
  { const a = await go('work', 8); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800); const b = await st(); check('ArrowRight -> next', L(b, a) === 'next', L(b, a)); }
  { const a = await go('work', 8); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(800); const b = await st(); check('ArrowLeft -> restart', L(b, a) === 'restart', L(b, a)); }
  { const a = await go('work', 8); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1500); const b = await st(); check('ArrowRight x2 quick -> +2', b.i === a.i + 2, b.i - a.i); }
  { const a = await go('work', 8); const [bx, by] = await box('#skip'); await touch([[bx, by, 0]], { endDt: 60 }); const b = await st(); check('tap ⏭ -> next', L(b, a) === 'next', L(b, a)); }
  { const a = await go('work', 8); const [bx, by] = await box('#skip'); await touch([[bx, by, 0]], { endDt: 50, after: 90 }); await touch([[bx, by, 0]], { endDt: 50 }); const b = await st(); check('double-tap ⏭ -> exactly one skip', b.i === a.i + 1, b.i - a.i); }
  { const a = await go('work', 8); const [bx, by] = await box('#prev'); await touch([[bx, by, 0]], { endDt: 60 }); const b = await st(); check('tap ⏮ -> restart', L(b, a) === 'restart', L(b, a)); }

  const l = await log();
  check('no page errors', !h.errs.length && !l.errors.length, h.errs.concat(l.errors).slice(0, 5));
  console.log(`== ${W}x${H0} ${FRAME ? 'iframe ' + FRAME : 'page'} ${BUSY ? 'BUSY' : ''}`);
  console.log(out.join('\n'));
  console.log('fails:', fails);
  await h.browser.close();
})().catch(e => { console.log(out.join('\n')); console.error(e); process.exit(1); });
