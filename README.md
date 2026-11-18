# Overdrive HIIT

A full-body HIIT interval timer with a clean "Studio" look and a built-in personal trainer: animated 3D exercise demos, a ring timer with the controls built in, a rest screen you can read from across the room, step-by-step form guides, and synthesised sound cues with a spoken coach.

**Live site (GitHub Pages):** https://hermannwwr-cmyk.github.io/HIIT/

No framework, no dependencies, no build step. Open `index.html` in a browser, or serve the folder:

```sh
npm run serve        # python3 -m http.server 8080, then open http://localhost:8080
```

**On your phone:** open the live site and add it to the home screen (iPhone: Share → *Add to Home Screen*; Android Chrome: ⋮ → *Add to Home screen* / *Install app*). It gets the Overdrive icon (the workout's timer ring with a pause in its opening) and opens full screen like an app.

## Looks

The default is **Automatic**: Studio in light or dark to match the phone's system theme, switching live if the phone changes (even mid-workout). Pick light or dark from the appearance button (◐) in the top bar; that choice is remembered on the device. `?look=auto|studio-dark|studio-light` in the URL overrides it for that visit only.

- **Studio dark / Studio light:** clean and quiet.
  - **Backdrop:** warm paper (light) or warm charcoal (dark) with a soft spotlight that picks up the phase colour.
  - **Athlete:** a satin 3D mannequin with contact shadows: graphite on light, warm stone on dark.
  - **Dark scheme:** cards and panels sit lighter than the stage, the same structure as light. `?dark=graphite` shows a neutral alternative with a titanium mannequin.
  - **Type:** Geist, with one coral accent.
  - **Timer:** an Apple-style ring with thin oversized digits.
  - **Phase colour:** on the ring, the phase chip and the current progress cell; rest, get-ready and the set break also tint the whole page. During jumping jacks the ring turns into beads, so the phase reads without colour.
  - **Finish:** a ring sweeps closed around the athlete.

## Workouts

| Exercise | Group |
| --- | --- |
| Push Ups | Upper body |
| Shoulder Taps | Upper body |
| Crunches | Abs |
| Leg Raises | Abs |
| Flutter Kicks | Abs |
| Russian Twists | Abs |
| Squats | Legs |
| Lunges | Legs |

- Every session starts with **5 random exercises** that always include at least one upper-body, one abs and one legs exercise. Workouts always run top to bottom: **upper body, then abs, then legs**.
- Change the count with **− / +** (3 to 8). The app adds or drops exercises while keeping the full-body mix.
- Tap any exercise to add or remove it. The numbered badges show the order they run in. **Start** stays locked until upper body, abs and legs are all covered.
- **Shuffle** rolls a new random set at the current count.

### Coach's brief

**Start** opens the brief before anything runs: today's plan on one screen, and the coach reading it aloud ("Welcome to today's HIIT session! Here's the plan…").

- **On screen:** total time and when you'll finish, the session to scale (warm-up, sets, 5:00 breaks), the exercises in order on coloured upper body / abs / legs rails with live mini demos, one set drawn as 30 s on / 30 s off, and the number of sets.
- **While the coach speaks,** the part being talked about lights up and the rest steps back; the current line is shown under it as a caption. If the voice can't play, the highlights still step through at reading pace. With the voice off (the mic button), the plan simply shows in full.
- **Start warm-up** (or **Start workout** with the warm-up off) can be tapped at any time; the coach stops and the workout begins. Tap an exercise for its trainer's guide. **‹**, Esc or the browser's Back return to setup.

### Warm-up

After the brief, a 4:14 SAF-style warm-up runs first ("Let's warm up. First, jogging on the spot, nice and easy."):

| Step | How long |
| --- | --- |
| Jog on the spot: slow, quick, slow, quick | 10 s each |
| Jumping jacks | 5 counts of 4 |
| Pectoral stretch | 5 counts of 4 |
| Squats | 5 counts of 4 |
| Hamstring stretch, left then right | 5 counts of 4 each |
| Calf stretch, left then right | 5 counts of 4 each |

Each new move starts with a short **Get ready**: the coach names it and its count ("Next warm-up: jumping jacks. Five counts of four.") while the demo waits, dimmed, and nothing starts while the coach is still talking (the screen says *Listen…* and the clock waits). After a breath, the coach counts down "5, 4, 3, 2, 1" with a big number each second (3, 2, 1 also pulse the screen edge and vibrate) and the coach says "Begin!" with a full-screen **BEGIN**, and the count starts on "One" a second later ("…two, one, Begin! One, two, three, four"); a timed move such as the jog starts on "Begin!". A leg switch counts down "3, 2, 1"; a change of jogging pace runs straight on. If the voice can't play, ticks carry the countdown instead (louder for 3, 2, 1) and a loud start signal marks the beginning. Counted moves show the count with four beat dots, and the coach counts every beat the SAF way, "1, 2, 3, 4 — 2, 2, 3, 4 — 3, 2, 3, 4 …" (the first beat of each count is its number); if the voice can't play, a tick on every beat carries the rhythm instead. **Skip warm-up** jumps straight to Get ready, and the switch in the Session panel turns the warm-up off (remembered on the device).

### Intensity

| Level | Each exercise | Then | Sets | Between sets |
| --- | --- | --- | --- | --- |
| Easy | 30 s | 30 s rest | 3 | 5:00 rest |
| Medium | 30 s | 30 s jumping jacks | 2 | 5:00 rest |

Every session opens with a 10 s get-ready countdown (after the warm-up, the coach says "Warm-up done" first). On Easy the 5-minute set break replaces the rest after the last exercise of a set, and the very last rest is dropped. On Medium every exercise is followed by jumping jacks, then the set break. A 5-exercise session is 23:40 on Easy and 15:10 on Medium.

### Personal trainer

- **Trainer's guide** for every exercise (tap ⓘ on a card, the preview label, or **How to** mid-workout): live animated demo, numbered steps, breathing, mistakes to avoid, and easier / harder versions. The workout timer pauses while the guide is open.
- **On-screen coaching** rotates form cues during each exercise and walks you through the next exercise's steps while you rest.
- **Rest screen** looks different from exercise: the page turns the rest colour, the countdown moves inside the ring, and an **Up next** card shows a live demo of the next exercise with its steps, **How to** and **Start now**. In the last 3 seconds it says *Get set*.
- **Voice coach** announces each exercise, gives a form cue at 20 s left, calls out 10 seconds, and says what's next. During the set break it checks in at 4, 3, 2 and 1 minute, 30 s and 10 s.
- **Set break** shows a breathing pacer (4 s in, 6 s out), recovery tips, and previews the first exercise of the next set.

### Always-visible timing

- Top bar: time elapsed and when the session ends.
- Progress strip under it: one group per set (plus the warm-up), one cell per exercise. The current cell fills as you go; during rest the next one is outlined. It reads *Set 1 of 3 · 2 sets left after this*, then *Final set*.
- Big countdown labelled for what it counts down to: *Time left*, *Crunches in*, *Set 2 in*. The warm-up shows counts as *2/5*.
- *Next: Squats in 0:58* line during every exercise, so you always know what's coming and when.
- **Start now** (or **Start set 2**) on the Up next card jumps straight to the next exercise; **Skip warm-up** sits in the progress strip. Every skip or back can be undone for 8 seconds.
- The ring shows the current interval. **The last 10 seconds are unmistakable:** a two-note chime at 10 (the coach's line follows it, never on top), a tick every second from 9 to 4 (skipped while the coach is talking), louder beeps on 3, 2, 1 with a glow around the screen edge, and the digits turn the phase colour, get bolder and pulse each second. With beeps off, the coach says "Ten seconds" and counts "Three, two, one".
- The finish screen shows total time, time spent on each exercise, and your workouts and day streak on this device.

### Controls

| Action | Button | Key |
| --- | --- | --- |
| Pause / resume | centre button in the ring | Space |
| Next interval | ⏭, or swipe left | → |
| Back (restart the interval, or redo the last exercise during a rest) | ⏮, or swipe right | ← |

Swiping slides a preview of where you're going into the ring while ⏭ / ⏮ fills up; let go once it's full. During rest, get ready and the set break you can swipe anywhere; during an exercise only a drag that starts on the controls counts, so wiping the screen or picking the phone up never skips. Browser Back during a workout asks before ending it.
| End workout | ✕ | Esc |

The screen is kept awake during a workout where the browser supports the Wake Lock API, and phones vibrate on each phase change.

## Project layout

```
index.html          markup for the screens (setup, brief, workout, done)
css/style.css       base layout and components; phase colours are CSS custom properties
css/studio.css      Studio look, scoped to html[data-look="studio"] (dark/light via data-scheme)
js/workout.js       pure workout logic: catalogue + trainer content, random full-body pick, timeline
js/app.js           UI controller, timer engine, ring timer with the controls in its opening
js/figure.js        Canvas 2D athlete that demonstrates each exercise (studio mannequin)
js/bg.js            WebGL backdrop shader (studio lighting)
js/audio.js         Web Audio sound effects and speechSynthesis voice coach
icons/              app icon: favicon.svg / favicon-32.png (browser tab), apple-touch-icon.png (iPhone),
                    icon-192/512 + maskable-512 (Android); icon.svg and maskable.svg are the sources
manifest.webmanifest  name, colours and icons for "Add to Home Screen" (opens full screen)
tests/              node:test unit tests for workout.js, the mannequin (figure.js) and the icon/manifest files
dev/figure-test.html  gallery of every exercise animation for checking the figures
scripts/build.mjs   bundles everything into one HTML file in dist/
```

```sh
npm test             # unit tests (Node 18+)
npm run build        # dist/overdrive-hiit.html, a single self-contained file
```

## Hosting on GitHub Pages

The site is static, so Pages serves it as-is (over HTTPS, which also enables the screen wake lock).

- **Automatic (recommended):** `.github/workflows/pages.yml` runs the unit tests and publishes `index.html`, `manifest.webmanifest`, `css/`, `js/` and `icons/` on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- **Without Actions:** **Settings → Pages → Source: Deploy from a branch**, pick the branch and `/ (root)`. `.nojekyll` makes Pages serve the files untouched.

Settings (look, intensity, sound, voice), completed workouts, total minutes and the day streak are kept in `localStorage` on the device.
