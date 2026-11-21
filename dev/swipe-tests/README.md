# Swipe: handoff notes and test harness

This covers the swipe and the ⏮ / ⏭ controls on the workout screen, as shipped in PR #8 (merged 2026-11-19). The design contract (the commit rule, `armed`, the hooks and the display hand-over) lives in `CLAUDE.md` under "Swipe and the ⏮ / ⏭ controls". This file covers what CLAUDE.md doesn't: how we got here, what was rejected, what's still open, and how to test.

## Since then: the row of dials (2026-11-21)

The user found that the ⏮ / ⏭ discs did not say "swipe", and wanted the controls to give room back to the figure and the countdown. What shipped, and what was tried on the way:

- **Shipped.** Back and next are slices of the neighbouring dials at the screen edges; the whole row slides. The countdown sits in the ring's opening, pause and How to in the corners beside it. A tap inside the ring also pauses. See `CLAUDE.md`.
- **Arc strength.** Solid arcs competed with the content. The user chose see-through arcs that fade out above and below the chevron.
- **Rejected: a bottom dock** (⏮ ⏸ ⏭ as pills). Easy to hit, but it took the space back: the ring grew only about 8–12%.
- **Rejected: a wide Pause bar** along the bottom, for the same reason.
- **Rejected: pause shown on the dial only** (a small mark under the countdown, the countdown on a raised plate, or a "Tap to pause" caption). The mark was too faint, the plate and caption cost ring size. The user kept the corner disc and the tap as an extra.
- Sizes measured against the old layout: figure 194 → 245 px and countdown 72 → 101 px at 360×640; figure 236 → 270 px and countdown 117 → 128 px at 390×844.

### Whole pages (2026-11-21, later the same day)

Until then only the dial and the countdown moved; the title and the lower area stood still and cut over on release.

- **The title travels.** The head keeps naming the current interval and leaves with its dial. The incoming page has its own title (`#headIn`), which comes in with its dial. This replaced the floating name tag `#riEdgeN`: with both there would have been two names for one page. The cost is that at a short drag only the start of the incoming name shows at the screen's edge, where the tag was readable from 20 px.
- **`armed` is now shown by the incoming chip filling in** (the tag used to turn solid). It is subtler than the tag was.
- **The chip no longer says "↺ Restart" / "↺ Redo"** during the slide. It shows what the head will show on landing, so nothing changes there. A restart reads from the full countdown coming in.
- **From a rest, the exercise's countdown comes in with its dial,** and the Up next card leaves with the rest's page. A warm-up move brings its "Get ready · Starts in N", and a jog's change of pace its seconds.
- **The countdowns pass over the dimmed pause and How to discs,** not under them (the readout is raised while the row moves, and the discs dim to 25%).
- **Fixed on the way.** The readout's settle never got the swipe's own timing: `--st` / `--se` were set on the stage, which the readout is not inside, so it used the 0.22 s fallback. They are on `.w-body` now. The incoming countdown also wore the last-10-seconds colour and weight of the interval being left.
- **No `:has()`.** The state classes are mirrored onto `.w-body`.
- **Open.** In short landscape (844×390) the title sits about 9 px lower while it comes in from a rest than after landing, because the head's row grows when the name line appears. The incoming lower area is not pre-rendered: it fades in after landing.
- `pages.js` takes the screenshots for all of this. `r2/regress.js` no longer looks for the ⏭ icon or the resting sliver, which went with the row of dials.

The sections below describe the pager as first shipped in PR #8. The gesture rules still hold; the curtain, the rim sliver and the button tabs are gone.

## What the user asked for

- "Swiping does not go previous or next" → "I want to have swipe throughout the app". They chose: the whole workout screen.
- "Swiping still does not work. I do not want deliberate swiping. Redesign the control buttons, design and placement for swiping."
- So the swipe must feel like a phone's own pager: a normal flick works, with no "drag until it fills" ritual, in every phase.
- The user views the app on a phone, possibly through the Claude app's preview (an iframe). Treat Android Chrome inside an iframe as the primary target.

## Why it failed before (root causes, in order of impact)

1. **Palm filter.** The old code dropped any touch with `e.width > 40`. Real fingertips report 40–60 px, and a scaled preview iframe inflates that. So almost every swipe was ignored, buttons included.
2. **Flicks were ignored during exercise.** Only a full drag to a threshold committed.
3. **Pointer events only.** When the browser or embedding page claimed the pan (`pointercancel`), the swipe died.
4. **Stuck swipe.** Touch move and end events go to the element the touch started on. `#wNext` (rewritten every second), the digits (rebuilt from 10 to 9) and `#wEx` were replaced mid-gesture, so `touchend` never reached `#workout`. The gesture state `g` then stayed set, and `down()` returned early forever: swiping was dead for the rest of the session. This is probably what the user hit on the phone.
5. **Wall-clock velocity.** On a busy main thread, a flick looked like a slow drag.
6. **CSS name clash.** The swipe's `--ss` collided with the ring layout's `--ss`.

## Decisions (and the alternatives rejected)

- **Pager, not "charge" buttons.** Earlier versions made you drag until ⏭ filled up, and only allowed flicks from the buttons. The user called that deliberate swiping and rejected it.
- **Same rule in every phase.** There is no stricter rule during work; Undo (8 s) is the safety net.
- **On the last interval** a swipe only rubber-bands. Finishing the workout needs a tap on ⏭.
- **The ring is the one place that names the destination,** via the `#riEdgeN` tag (since replaced by the incoming page's own title, see above). Rejected:
  - the tab showing the exercise name: it truncated and changed with screen size;
  - the header flipping to the destination while dragging: the timer still showed the current interval.
- **The tab shows a fixed action word** ("Next ›", "‹ Restart", "‹ Redo", "‹ Back", "Finish ›"), never "Back" for a restart.
- **Idle hint.** Rejected:
  - chevrons on the discs: they read as backwards ("⏮ ›");
  - a 3 px nudge: nobody noticed it.
  - Kept: a soft resting sliver of the next page at the ring's rim during rest, prep and the set break.
- **`armed` means letting go commits.** The release uses exactly the same predicate, at the touchend's own `timeStamp`.
- **Pull-to-refresh is blocked only at top level** (`html.top-level`). Inside an iframe, `overscroll-behavior: none` stopped vertical drags from scrolling the host page, which was a regression caught in review.

## Process used

There was one builder for the gesture and pager, and one for the controls' look. Two independent critics never saw the code being written:
- a gesture critic using the harness below;
- a design critic rendering four sizes × light/dark × work/rest/set break/warm-up, in idle, mid-drag, armed and paused states.

We iterated until both said "UTTERLY IMPRESSED: yes": four gesture rounds and five visual rounds. Typical critic finds were the stuck swipe, armed showing while the release springs back, the settle kicking forward at 4–7× finger speed, the iframe scroll regression, and labels overlapping or truncating.

## Open nice-to-haves (not done)

- In light mode at rest, the resting sliver is almost invisible once its slide-in ends. A little more opacity would help.
- On a heavily throttled device (×4–×8 CPU), a sparse two-move flick can un-arm the ⏭ tab a few frames before the commit goes through. The outcome is right; only the highlight drops early.
- A thumb arc whose first ~13 px is mostly vertical is treated as a vertical move. Android's own pager does the same.
- Not yet confirmed on the user's real phone after the fix.

## Running the harness

These are Playwright scripts that send realistic CDP touch: a contact radius of about 24–28, force, event timestamps and a new touch id per gesture. They also install a speech mock that fires `onstart`/`onend`. They reach the workout by clicking `#start` then `#bStart` (see `lib.js`).

```sh
# from the repo root: serve the app on 8731, and this folder on 8732 (a second origin for the iframe host)
python3 -m http.server 8731 &
(cd dev/swipe-tests && python3 -m http.server 8732 &)

cd dev/swipe-tests
node matrix.js 390 844                                   # ~70 checks: flicks, drags, taps, phases, edges, two fingers, keys
node matrix.js 360 780 - busy                            # with a 30 ms busy loop every frame
node matrix.js 390 844 http://localhost:8732/outer.html  # inside a cross-origin iframe scaled to 0.8
node stuck.js && node stuck2.js                          # swipes that start on elements that get redrawn
node armed.js                                            # quick move then hold: armed must drop, no commit
node feel.js                                             # settle speed vs finger speed, mid-drag screenshots
node r2/throttle.js                                      # CPU throttle x4 / x8: sparse flicks must commit
node r2/diag.js                                          # release timing under load
node r2/regress.js                                       # flicker, double-firing, long holds, sliver taps, rapid flicks
node r2/vscroll.js && node r2/vscroll2.js                # vertical drags in the iframe scroll the host page
node r3/agree.js                                         # what armed showed vs what the release did
node r3/clip.js                                          # incoming-page clip during drag and settle (frame sheets)
node misc.js; node audio.js; node iframe-scroll.js
node tapdial.js                                          # a tap in the ring pauses; controls, arcs and swipes don't
node pages.js                                            # whole pages: mid-drag, release and cancel screenshots at four sizes (shots/pages/)
```

- Set `URL=` to point at another build.
- Screenshots go to `shots/`, which is git-ignored.
- Headless delivery is much slower than a phone, so judge timing by event timestamps, not wall clock. A rare busy-run mismatch that disappears at normal speed is harness noise.
