# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Overdrive HIIT is a static, dependency-free HIIT interval timer (no framework, no bundler, no npm dependencies). It is live on GitHub Pages at https://hermannwwr-cmyk.github.io/HIIT/. The README describes the user-facing behaviour (warm-up, intensities, controls, swipe, voice coach) and the file layout.

## Commands

```sh
npm test                                   # node --test tests/*.test.js (Node 18+)
node --test --test-name-pattern "warm" tests/workout.test.js   # run matching tests only
npm run build                              # dist/overdrive-hiit.html: one self-contained file
node scripts/build.mjs out.html --fragment # same, without <html>/<head>/<body> (for hosts that add their own)
npm run serve                              # python3 -m http.server 8080
```

The workout screen's layout and swipe are checked in a headless browser (Playwright must be installed globally; it is not a dependency of the repo). The scripts expect the repo root served on port 8731; set `URL=` to point them elsewhere:

```sh
python3 -m http.server 8731 &              # from the repo root
cd dev/swipe-tests
node matrix.js 390 844                     # ~70 swipe, tap and key checks at one screen size; must end "fails: 0"
node tapdial.js                            # tap the dial to pause
node sizes.js                              # ring, figure and countdown at 8 screen sizes; compare with sizes-baseline.txt
node pages.js work-rest                    # mid-swipe screenshots into shots/ (git-ignored)
node ../../scripts/render-icons.mjs        # regenerate icons/*.png after editing icons/*.svg
node ../offline-test.js                    # the offline copy: install, update within one open, never mid-workout, works with the server stopped
```

`dev/swipe-tests/README.md` lists the rest of the harness and why each script exists.

There is no linter or formatter. Opening `index.html` directly (file://) must keep working.

A layout change on the workout screen must not make the figure, the countdown or the ring smaller at any screen size unless that was asked for: content comes first there. `sizes.js` is the check.

## Architecture

**Classic scripts sharing globals.** `index.html` loads `js/workout.js`, `bg.js`, `audio.js`, `figure.js` and `app.js` in that order. Each file is an IIFE that publishes one global:
- `window.HIIT`: workout logic. It is also `module.exports`, which is how the tests `require` it.
- `HIITBackdrop`: WebGL background.
- `HIITAudio`: synthesised sounds and the speech coach.
- `HIITFigure`: the Canvas 2D mannequin demo.

`app.js` is the controller that uses all of them. Keep the code ES5-style (`var`, plain functions) and module-free, so it runs from file://, from the Pages sub-path, and inlined by `build.mjs`.

**`js/workout.js` is pure data and logic, with no DOM.**
- It holds the exercise catalogue and trainer text, `LEVELS`, `WARMUP_STEPS`, the random full-body pick, and `order()` (upper body → abs → legs).
- `buildTimeline(ids, level, {warmup})` returns a flat list of segments, each with `start`, `end`, `duration` and `index`. Segment `type` is one of `warmup`, `prep`, `work`, `rest`, `jacks` or `setrest`.
- Warm-up segments also carry `lead` (seconds of lead-in before the move) and `countdown` (5, or 3 for a leg switch).
- `tests/workout.test.js` pins exact numbers: the lead values, `WARMUP_SECONDS` formatting to `'4:14'`, and session totals. So timing changes need test updates, plus the static fallback in `index.html` (`#wuTime`).

**Start flow and the coach's brief.**
- Screens: setup → brief (`#brief`) → workout (`#workout`) → done (`#done`).
- On the setup screen, `#start` calls `openBrief()`. The coach reads the plan aloud, and `#bStart` ("Start warm-up", or "Start workout" with the warm-up off) calls `startWorkout()`. `#briefBack`, Esc and browser Back return to setup.
- `HIIT.brief(tl)` in `workout.js` is a pure function. From the timeline it returns the plan (exercises, groups, level, set break, warm-up, total) and the spoken `lines: [{say, show}]`.
- `show` names the part of the screen to light while that line is spoken: `intro`, `warmup`, `exercises`, `ex:<id>`, `intervals`, `sets`, `setbreak`, `total` or `ready`. It matches elements with `data-part="…"`; `briefShow()` toggles `.on`.
- `tests/workout.test.js` pins the brief's wording rules:
  - every line ends in `.`, `!` or `?`, never a comma (each line is its own speech utterance);
  - no digits;
  - "HIIT" is written as "hit" so text-to-speech says the word;
  - a 25–41 s length.
- The welcome lives in the brief, so the warm-up opens with "Let's warm up…".
- Playwright scripts must click `#start` and then `#bStart` to reach the workout.

**`js/app.js` drives the clock in one loop.**
- The clock is `run.base` plus the time since `run.anchor`, read through `elapsedNow()`.
- `update()` runs every animation frame:
  1. finds the segment for the current time;
  2. on entering a new one, calls `enterSegment()`, which then calls `cueSegment()` for sounds and voice;
  3. calls `onSecond()` once per whole second (the last-10-second countdown and trainer calls);
  4. calls `onBeat()` for counted warm-up moves.
- Per-frame work is kept off the style system: `update()` writes a style or a text only when its value changes. The live progress cell's `--p` goes through `setP()`, quantised to the cell's width in device pixels (`liveSteps()`), so it is written a few times a second and never while paused. Don't add an unguarded per-frame `style` / `textContent` write.
- `frame()` calls `ring.tick(dt)`, not `draw()`: while only the timer's sweep moves, the ring is drawn every other frame. A frame is skipped only if the head has moved less than 0.75 px since the last one drawn (`HEAD_STEP`) and nothing in `Ring.quick()` is on (a swipe, a ripple, `hot`, a colour change, `needs`), so fast sweeps (warm-up lead-ins, the jog, the 10 s get-ready), the last ten seconds and swipes keep every frame. Skipped time is added to the next draw's `dt`. The mannequin is not throttled this way: it is content and stays on the beat.
- `warmLead()` runs a warm-up step's lead-in: "Get ready", a spoken 5-4-3-2-1, then "Begin!". It can hold the clock by rewriting `run.base` while the coach is still speaking.
- Jumps go through `seek(t)`. Cues only fire on "natural" progress (see the `natural` and `prev` checks), so seeking never replays a whole round of sounds.
- The timer ring is the `Ring` canvas class. `Ring.layout()` writes the stage geometry as CSS custom properties (`--cy`, `--rr`, `--fy`, `--fh`, `--pm`, …) and sets `tuck` on `#workout` in portrait.
  - The dial is one of a row: the previous and next intervals' dials sit one `ring.pitch` to the left and right, 24 px of each (44 px on tablets) showing at the canvas's edges. `Ring.drawStudio()` draws those slices, then `drawDial()` for the current one.
  - Portrait (`tuck`): the opening at the bottom holds the countdown, which rises into it from the readout below (`--tuck`, a negative margin that never depends on the stage's height). Pause and How to (`#info`) are discs in the corners under the ring's sides (`--dx`, `--dy`), 14 px clear of the band; rest's up-next card starts under them (`ring.hang`). The canvas spans the screen. When the stage is taller than the ring, the title comes down with it (`--head-dy`, a `translate`, so the stage's height never depends on it).
  - Side by side (landscape, `(min-aspect-ratio: 5/4) and (min-width: 560px)`): the readout has its own column, so the opening holds the pause (`--pax`, `--pay`) and How to sits beside the ring's base. The row is clipped to the stage.
  - The pause grows with the ring (`S*0.148`, 50–72 px). The beat-dot row stays reserved through the whole workout, so the ring keeps one size from the warm-up to the end.
- `ring.progress` is set in `update()`. Warm-up steps get two sweeps: one for the lead-in, one for the move.
- Rest, prep and the set break switch the screen to `#workout[data-mode="rest"]`: a dial inside the ring plus an "Up next" card.
  - `sizeUpNext()` fits the card to the lower area less `ring.hang`: it tries `UN_STATES` from `roomy` (with the step tip) down to `compact … q4`, and shrinks the demo tile last. Start stays at least 48 px tall in every state. It reads the card's own width (720 px at most on a tablet in portrait, 520 px elsewhere).
  - Tall phones (`min-height: 800px`, under 600 px wide): `.w-lower`'s `min-height` in `studio.css` takes the height the ring cannot use (the ring is limited by the width there), so the tip fits. It must never cost ring size: `dev/swipe-tests/sizes.js` against `sizes-baseline.txt`.
  - Short landscape (`max-height: 500px`): the right column (title, countdown, "Next:") sets the stage's height, so the ring follows `--dg`, which is capped by the height. Rest keeps the hidden title's row so the ring is the same size as in work.

**Swipe, back and next.** `initSwipe()` is a pager, the same in every phase and anywhere on the workout screen.
- The whole row of dials follows the finger 1:1. Pages are one `ring.pitch` apart (`travel()`), each clipped to the inside of its own ring; the countdown in the opening goes with its dial.
- Commit rule, `wouldCommit()`; otherwise the page springs back:
  - a flick of at least 0.25 px/ms, with hysteresis (it stays armed down to 0.18);
  - a short, fast move that never stopped (`quick`);
  - or a drag past `commitDist()`: 28% of a phone's width up to 110 px, or 60% of a page on a tablet's big ring; at most 30% of the width and 75% of a page.
- Velocity comes from the events' own `timeStamp`s, so a busy main thread doesn't turn flicks into slow drags.
- `armed` on `#transport` shows `wouldCommit()`, re-checked every frame, so it drops once the finger rests. The release applies the same rule at the touchend's own `timeStamp`. `armed` must always mean "letting go commits".
- The settle leaves at the finger's speed and only slows down (`settleWith()`).
- Input:
  - touch goes through TouchEvents, and sideways `touchmove`s are `preventDefault`-ed so an embedding iframe or webview can't steal the pan;
  - pointer events serve mouse and pen;
  - vertical moves, a second finger and the outer 16 px are left to the browser;
  - a swipe never clicks the button it started on;
  - there is no palm or contact-size filter (real fingertips report 40–60 px).
- **Don't replace elements on the workout screen every tick.** Touch moves and ends go to the element the touch began on, and are lost if it leaves the DOM. The listeners are also bound to that element and a lone new touch clears a stale gesture, but use `setRich()` (in-place text, as `#wNext` does) rather than rewriting `innerHTML`.
- `overscroll-behavior: none` applies only with `html.top-level` (not framed). In the Claude app's preview iframe, vertical drags must scroll the host page.
- The preview figure (`peekFig`) is made ahead of the first swipe: `startWorkout()` asks for `carousel.warm()` when the main thread is idle; `prepare()` still makes it if a swipe comes first.
- What moves:
  - A swipe moves whole pages: each dial with its title above and its countdown and lower area below. `place()` sets `--sx` (the leaving page), `--px` (the incoming one) and `--sp` (0..1 of the way, which fades the leaving page's text) on `.w-body`. `Ring.draw()` reads `#riCur`'s computed transform each frame while `.carousel` is on, so the bands on the canvas keep exactly to the finger and to the settle's curve.
  - The swipe's state classes (`carousel`, `swiping`, `settle`, `snap`, `away`, `armed`) are set on `.w-body` as well as on the stage (`mark()`), and `--st` / `--se` (the settle's timing) on `.w-body`. The CSS for the swipe uses no `:has()`; keep it that way.
  - The leaving page: `.w-head` keeps naming the current interval and leaves with its dial, fading. It is never rewritten during a swipe. The countdown (`.w-readout`), the next line, the trainer card and rest's Up next card leave with it too (the last three fade).
  - The incoming page is `#riPeek` (a figure or a rest dial) plus its title, `#headIn`: a second `.w-head`, built once in `index.html`, filled in place by `headInLook()` and laid over the head's grid cell (absolute, so it never changes the layout). There is one name per page; the old floating name tag (`#riEdgeN`) is gone. The incoming chip fills in while `armed` and the finger is down.
  - What comes in under the dial, one pitch (`--pd`) from the leaving countdown: an exercise's or a jog's seconds (`#pkMouth`), or a warm-up move's "Get ready · Starts in N" (`#pkLead`). This also happens from a rest, where the readout they sit in is hidden. While the row moves the readout is raised above the dimmed pause and How to discs. The incoming lower area is not pre-rendered.
  - Landing (`land()`) swaps in the real interval unseen. The lower area's text is held at opacity 0 (`away`) until the snap is over, then fades in over 0.2 s (`unsnap()`). `land()` also switches the readout's and the trainer card's rise-in animation off (inline `animation: none`); `enterSegment()` gives it back at the next rest.
  - Side by side (landscape) the title has its own column, so it changes in place: the old one fades out over the first half of the way and the new one in over the second, each with a short step sideways. The countdown there stays until landing.
  - The ring's colours switch outright at commit (`Ring.snapColors`), never through a muddy blend.
- Back and next are the neighbouring dials' slices at the screen edges: a see-through piece of the band in the colour of where it leads, fading out above and below a chevron. `#prev` / `#skip` are transparent 64×168 px hit areas over them.
  - `syncNeighbours()` (from `syncSkipLabel()` / `syncPrevLabel()`) sets `ring.nb`. Back wears this interval's own colour once it is a few seconds in (a restart), and is absent at the very start. After the last interval a neutral slice with a tick stands for Finish (tap only: a swipe rubber-bands).
  - The slice being pulled in firms up into a full dial as it arrives. Pause and How to dim while the row moves.
  - The hooks the gesture sets on `#transport` are `--ck` (0..1), `charge-next` / `charge-prev` and `armed` (`armed` is mirrored on `.w-body`). Taps and keys go through the same commit path.
- A tap inside the ring, or on the countdown in its opening, pauses (`dialTap()` in `bind()`); the pause disc stays the visible button. The swipe code eats the click that ends a swipe.
- The idle hints are the slices themselves, plus two one-time tips in the progress row (`state.tapTip`, `state.swipeTip`, the second with a nudge of the row).
- To look at a swipe, run `dev/swipe-tests/pages.js`: it holds a finger mid-drag and screenshots each step at four sizes.
- Testing: use CDP `Input.dispatchTouchEvent` with a realistic `radiusX/Y` (about 22) and explicit `timestamp`s. Headless delivery is far slower than real time, so judge timing by event timestamps. The harness, the history (root causes, rejected designs) and the open nice-to-haves are in `dev/swipe-tests/README.md`.

**Looks.**
- Only the "Studio" look exists. An inline script in `<head>` sets `html[data-look="studio"]` and `data-scheme="light|dark"` before first paint, following the system setting unless the user overrides it.
- `css/style.css` holds the base layout. `css/studio.css` holds everything scoped to `[data-look="studio"]`, including the compact media queries (the countdown digits size via `--dg`).
- The backdrop (`js/bg.js`) draws only while something is in transition (colours, energy, focus, a flash, a beat of 0.6 or more, a resize, a scheme change: `_dirty` / `_settled()`); otherwise once a second for the washes' drift (`DRIFT_STEP`), and not at all when paused. The weak beats the app sends each second never changed a pixel by more than 1/255, so `beatNow()` ignores them.
- While the paused veil, the quit dialog or the How-to sheet is up, the endless CSS pulses underneath (`studioPulse`, `wpNext`, `bReady`) are paused through the `inert` attribute that `setInert()` sets (end of `studio.css`); otherwise the blurred veil is composited again every frame. A new endless animation on those screens needs adding there.
- Preferences and stats live in localStorage under `overdrive-hiit:v1`.
- Bar colours: the page's `<meta name="theme-color">` follows the scheme (set by the inline head script and by `applyLook()`), but an installed app's bottom gesture bar and splash screen take the manifest's `background_color` / `theme_color`, which cannot vary. They are the dark charcoal (`#1a1918`): a dark bar under the light scheme looks ordinary, a cream bar under the dark scheme did not.
- The iPhone install hint (`#iosHint` in the setup screen's eyebrow row): iOS has no install prompt, so `bindIosHint()` in `app.js` shows an "Install" chip whose popover names Share → "Add to Home Screen". `iosHintWanted()` lists when: an iPhone/iPad (or iPadOS presenting as a Mac), not installed, not framed, not dismissed (`state.iosHint`, saved with the other preferences).
  - It is absolutely placed in `.hero-copy` and must never move the setup screen's layout. The `<button>` is the 44 px target; the 26 px pill is drawn inside it (`.ios-chip-in`). Its CSS is one block at the end of `style.css` (layout) and of `studio.css` (colours).
- Phase colours live in two places that must agree:
  - `app.js`: `PHASE`, `LOOKS[…].phase` and `.group` for light and dark, and `DARK_VARIANTS.charcoal` (the default dark scheme);
  - the CSS custom properties, e.g. `--warm-a`/`--warm-b` in `style.css` and `studio.css`.
- Current phase colours: warm-up leaf green, work coral, rest blue, jacks amber, set break mint-teal. The WARM UP and BEGIN wipes use their own deep green, passed through the `flash()` kind argument, so white text stays readable.
- The only font is Geist, self-hosted: `fonts/geist-latin.woff2` is the one variable file (weights 200–700, Latin block) that Google Fonts serves, with its licence in `fonts/OFL.txt`. The `@font-face` is a `<style>` in `index.html`'s `<head>`; the preload link is added by the `#fontPreload` script, not written as markup, because from file:// a font preload is refused with a console error (the font itself loads there). Nothing is loaded from another origin; `tests/site.test.js` checks that.

**Audio and voice (`js/audio.js`).**
- All sounds are synthesised with Web Audio; there are no audio files.
- The coach uses `speechSynthesis`, with workarounds for phones:
  - keep a reference to each utterance until it ends;
  - cancel, then wait before speaking the next line;
  - call `resume()` before speaking;
  - unlock speech with a silent word on the first user gesture.
- `voiceWorks()` reports whether recent lines actually started; the countdown falls back to louder ticks when they didn't. `onVoiceProblem` lets the app show a notice when the viewer can't speak at all.

**Mannequin (`js/figure.js`).** It is a 3D skeleton with FK and 2-bone IK, a per-exercise camera, and one "studio" Canvas-2D renderer.
- Exercises live in the `EX` table: `period`, `cam`, draw `order`, and `pose(p)` built from keyframes.
- All instances share one `requestAnimationFrame` loop, which sleeps while no figure needs frames.
- Warm-up moves stay on the count:
  - `app.js` `warmFigOpts()` passes `setExercise(id, {time, period})` with a negative time during the lead-in, so the move is demonstrated without a break and a fresh rep starts exactly on the go. (The figure still supports `ready`, a count-in that waits in a breathing pose, but the app no longer uses it.)
  - From the countdown on, `lockFig()` glides the figure back onto the count after any hold for the coach.
  - `update()` re-syncs through `setTime(t, ease)` when the figure drifts more than 40 ms off the count. Errors up to about 150 ms glide; bigger ones snap.
- Exercise changes cross-dissolve over 0.25 s. The stage uses one body scale for every move; the setup hero and the How-to sheet use `fit: 'fill'`.
- Figure ids differ from workout ids for sided and paced warm-up moves. `app.js` `figIdFor()` and `warmFigId()` map them, e.g. `jog` → `jog-slow`/`jog-quick`, `hamstring` → `hamstring-l`/`-r`.
- `makeFig()` options:
  - setup-card thumbnails use `quality: 'low'`, which means 30 fps and thicker limbs;
  - `clear: [dx, dy, r]` keeps the thumbnail figure out from under the ⓘ badge for the whole cycle;
  - other figures take `fps` (default 60) and `maxDpr` (default 2).
- Draw order comes from each exercise's `order`. `_stOrder()` then depth-sorts the two arms, with hysteresis. Don't add phase-dependent order flips (`orderAt`); they made limbs pop in front of each other.
- Renders are not fully deterministic across sizes or machines:
  - The silhouette rim pass is skipped below 180 px, and the occlusion pass below 200 px.
  - A one-way slow-device guard drops the rim, then the occlusion pass, once frames average more than 8 ms. For pixel comparisons on a busy machine, call `HIITFigure._dev.slow(false)` first.
- Bench: `dev/figure-test.html?sheet=1&style=studio&scheme=light&material=graphite&ph=0,0.25,0.5,0.75` renders a contact sheet of every exercise. Use `&scheme=dark&material=stone&stage=charcoal` for dark.
- `tests/figure.test.js` checks for duplicate top-level function names, finite poses, no IK clamping, seamless loops and the clock.

**Test and debug hook.** `window.__hiit` exposes `run`, `ring`, `seek(t)`, `advance(sec)`, `start()`, `finish()`, `guide(id)` and `look(name)`. Changes are checked by driving `index.html` with Playwright and these hooks, often with a mocked `speechSynthesis`.

## Deploy

- `.github/workflows/pages.yml` runs `npm test` on every push to `main`, then publishes only `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `icons/` and `fonts/`. Any new file the site needs must be added to that `cp` line, and to `SHELL` in `sw.js` if `index.html` loads it (`tests/site.test.js` compares the three).
- **Offline (`sw.js`).** One version = one cache, `overdrive-hiit-<version>`.
  - The workflow replaces the `var VERSION = 'dev';` line with the commit SHA (`sed` after the `cp`); the repo's file keeps `'dev'`.
  - Install fetches the whole shell from the server (`?v=<version>`, `cache: 'no-store'`) into the new cache, all or nothing.
  - A stamped worker serves the page and every shell file from its own cache only, so one version's files never mix with another's. There is no network-first for the page: a fresh `index.html` with cached scripts would be exactly that mix.
  - No `clients.claim()`, and no `skipWaiting()` at install: a new worker never takes over by itself, so files are never swapped under a running workout. The page asks for it (`activate-now`, then one reload) wherever a reload costs nothing, i.e. on the setup screen with no sheet open (`idle()` in the `#swReg` script): as soon as the new version has finished downloading, when the app comes back to the foreground, when it returns to the setup screen after a workout, and as it opens. So an update shows a few seconds into the first open after a deploy, with one visible reload of the setup screen. `dev/offline-test.js` drives one never-closed tab through four versions; keep it passing.
  - Un-stamped (`'dev'`: localhost, or a branch deploy without the workflow) the worker is network-first with a 3 s timeout and refreshes its copy as it goes, so edits show on reload. A Playwright context that loads the page twice is served through it.
  - Registered by the `#swReg` script at the end of `<body>`, only over https or on localhost/127.0.0.1 (never file://). `build.mjs` removes `#swReg` and `#fontPreload` and inlines the font as a data URI.
  - There is no "update ready" note in the UI.
  - `manifest.webmanifest` is in `SHELL`, so a manifest change reaches the browser through the same update path as the page, not at once. An installed Android app re-reads its manifest on Chrome's own schedule (a day or more); removing and re-installing applies it straight away. A "fix that did not work" on a phone is often this delay: have the app opened once more before looking further.
- Confirming a deploy: the run has two jobs, `build` (tests, the `cp`, the version stamp and its `grep` check) and `deploy`; both must succeed. The live site may not be reachable from a sandboxed session, so the run's result is the evidence. Nothing in the harness replaces a real phone: installed-app behaviour, iOS Safari and battery cost can only be checked by the owner.
- `tests/site.test.js` checks the icons and manifest against the workflow. The root-level PNGs and `q2/` are screenshots and are not published.
- `icons/*.svg` are the sources for the icons. The PNGs (favicon-32, a 180 px iPhone icon, 192, 512 and maskable 512) are pre-rendered from them and must be regenerated if the SVGs change: `node scripts/render-icons.mjs` (needs a globally installed Playwright; not part of the site or the tests). It re-encodes each screenshot losslessly through `scripts/png.mjs` (plain Node: best filter, zlib level 9, and it verifies the pixels are unchanged), under a third of Chromium's size. The "30" in the ring's opening is drawn as stroked paths, not text; the favicon's is coral, larger and snapped to the 32 px grid.
- `scripts/build.mjs` inlines the CSS, the JS, the font and the SVG favicon, and drops the other icon and manifest links and the service worker registration.
