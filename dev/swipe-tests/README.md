# Swipe: handoff notes and test harness

This covers the swipe, back / next and pause on the workout screen. The design contract (the commit rule, `armed`, what moves, the layout) lives in `CLAUDE.md` under "Swipe, back and next". This file covers what CLAUDE.md doesn't: what the user asked for, why the first swipe failed, what was tried and rejected, what is still open, and how to test.

## What the user asked for

- "Swiping does not go previous or next" → "I want to have swipe throughout the app". They chose: the whole workout screen.
- "I do not want deliberate swiping." A normal flick must work, with no "drag until it fills" ritual, in every phase.
- "The buttons do not make it obvious for users to know they can swipe", and the controls should "save space to make important contents bigger".
- **Content comes first.** The figure, the countdown and the exercise name must not get smaller for the sake of a control. `sizes.js` checks this.
- The user views the app on a phone, possibly through the Claude app's preview (an iframe). Treat Android Chrome inside an iframe as the primary target.

## The design as it stands

- The workout is a row of dials. A see-through slice of the previous and the next interval's dial shows at each screen edge, in the colour of where it leads, fading out above and below a chevron. Those slices are back and next (a tick after the last interval: Finish).
- A swipe moves whole pages 1:1: each dial with its title above and its countdown and lower area below. The slice being pulled in firms up into a full dial.
- In portrait the countdown sits in the ring's opening, with pause to its right and How to on its left. In landscape the countdown has its own column and the pause sits in the opening.
- A tap inside the ring, or on the countdown in its opening, also pauses. The pause disc stays the visible button.

## Why the first swipe failed (root causes, in order of impact)

1. **Palm filter.** The old code dropped any touch with `e.width > 40`. Real fingertips report 40–60 px, and a scaled preview iframe inflates that. So almost every swipe was ignored, buttons included.
2. **Flicks were ignored during exercise.** Only a full drag to a threshold committed.
3. **Pointer events only.** When the browser or embedding page claimed the pan (`pointercancel`), the swipe died.
4. **Stuck swipe.** Touch move and end events go to the element the touch started on. `#wNext` (rewritten every second), the digits (rebuilt from 10 to 9) and `#wEx` were replaced mid-gesture, so `touchend` never reached `#workout`. The gesture state `g` then stayed set, and `down()` returned early forever: swiping was dead for the rest of the session. This is probably what the user hit on the phone.
5. **Wall-clock velocity.** On a busy main thread, a flick looked like a slow drag.
6. **CSS name clash.** The swipe's `--ss` collided with the ring layout's `--ss`.

## Decisions that still hold

- **Pager, not "charge" buttons.** Earlier versions made you drag until ⏭ filled up, and only allowed flicks from the buttons. The user called that deliberate swiping and rejected it.
- **Same rule in every phase.** There is no stricter rule during work; Undo (8 s) is the safety net.
- **After the last interval** a swipe only rubber-bands. Finishing the workout needs a tap.
- **`armed` means letting go commits.** The release uses exactly the same predicate, at the touchend's own `timeStamp`.
- **The title never names one interval while the timer runs another.** The leaving title keeps the current name and leaves with its dial; the incoming page brings its own title (`#headIn`). One name per page.
- **Pull-to-refresh is blocked only at top level** (`html.top-level`). Inside an iframe, `overscroll-behavior: none` stopped vertical drags from scrolling the host page, a regression caught in review.

## Tried and rejected

Controls:
- **⏮ / ⏭ discs at the ring's base that morphed into a tab** ("Next ›", "‹ Restart") while swiping. Shipped in PR #8. The user found the discs did not say "swipe" at rest, and they held the ring's size down.
- **Chevrons on those discs** as an idle hint: they read as backwards ("⏮ ›"). **A 3 px nudge**: nobody noticed it. **A sliver of the next page inside the ring's rim** during rest: too faint, and only there in rest.
- **A bottom dock** (⏮ ⏸ ⏭ as pills). Easy to hit, but it took the space back: the ring grew only about 8–12%. **A wide Pause bar** along the bottom, for the same reason.
- **Solid side arcs.** They competed with the content. The user chose see-through arcs that fade out above and below the chevron.
- **Pause shown on the dial only** (a small mark under the countdown, the countdown on a raised plate, or a "Tap to pause" caption). The mark was too faint; the plate and the caption cost ring size. The user kept the corner disc, with the tap as an extra.

What a swipe shows:
- **Only the inside of the ring sliding** (a curtain in the destination's colour, pages 1.3 radii apart). The ring's band, the title and the countdown stood still, so it did not read as a page.
- **A floating name tag** for the destination. Replaced by the incoming page's own title: with both there would have been two names for one page. The cost: at a short drag only the start of the incoming name shows at the screen's edge.
- **The header flipping to the destination while dragging**: the timer still showed the current interval.
- **A tab or chip saying "↺ Restart" / "↺ Redo"** during the slide. The incoming title now shows exactly what it will show on landing, so nothing changes there.

## Sizes

Against the layout before the row of dials: figure 194 → 245 px and countdown 72 → 101 px at 360×640; figure 236 → 270 px and countdown 117 → 128 px at 390×844; in phone landscape (844×390) the countdown went 117 → 148 px and the ring 266 → 281 px. `sizes-baseline.txt` holds the current numbers at eight screen sizes.

## Open

- **Not confirmed on the user's real phone.** Every check so far ran in a headless desktop browser with synthetic touch. The slices sit where Android's back gesture lives: a drag from the very edge belongs to the system (the outer 16 px are left alone, as before).
- Reduced motion, tablets mid-swipe, and names long enough to wrap during a swipe have not been looked at since whole pages began to travel.
- Short landscape (844×390): coming from a rest, the incoming title sits about 9 px lower than after landing, because the head's row grows when the name line appears.
- The incoming page's lower area is not pre-rendered: it fades in after landing.
- Tall phones size the lower area with `dvh`; without that unit the layout falls back to the smaller Up next card.
- `armed` is shown by the incoming chip filling in, which is subtler than the old solid tag.
- A thumb arc whose first ~13 px is mostly vertical is treated as a vertical move. Android's own pager does the same.
- `r3/agree.js` (what `armed` showed against what the release did) reports 2 of 45 disagreements at normal speed; it was 3 of 45 before the row of dials.

## Process used

Builders never reviewed their own work. For PR #8: one builder for the gesture, one for the look, and two critics who never saw the code (a gesture critic using this harness, a design critic reading screenshots). For the row of dials: prototypes injected over the running app and shown to the user before anything was built; then an independent code review and an independent visual review at eight screen sizes; then three parallel builders in separate worktrees (layout, swipe display, icon), merged and re-checked together.

## Running the harness

These are Playwright scripts (installed globally, not a dependency of the repo) that send realistic CDP touch: a contact radius of about 24–28, force, event timestamps and a new touch id per gesture. They also install a speech mock that fires `onstart`/`onend`. They reach the workout by clicking `#start` then `#bStart` (see `lib.js`).

```sh
# from the repo root: serve the app on 8731, and this folder on 8732 (a second origin for the iframe host)
python3 -m http.server 8731 &
(cd dev/swipe-tests && python3 -m http.server 8732 &)

cd dev/swipe-tests
node matrix.js 390 844                                   # ~70 checks: flicks, drags, taps, phases, edges, two fingers, keys
node matrix.js 360 780 - busy                            # with a 30 ms busy loop every frame
node matrix.js 390 844 http://localhost:8732/outer.html  # inside a cross-origin iframe scaled to 0.8
node tapdial.js [W H]                                    # a tap in the ring or on the countdown pauses; controls, arcs and swipes don't
node sizes.js                                            # ring, figure, countdown, pause and Start at 8 sizes: compare with sizes-baseline.txt
node pages.js [case]                                     # whole pages: mid-drag, release and cancel screenshots at four sizes (shots/pages/)
node stuck.js && node stuck2.js                          # swipes that start on elements that get redrawn
node armed.js                                            # quick move then hold: armed must drop, no commit
node feel.js                                             # settle speed vs finger speed
node r2/throttle.js                                      # CPU throttle x4 / x8: sparse flicks must commit (slow: several minutes)
node r2/diag.js                                          # release timing under load
node r2/regress.js                                       # flicker, double-firing, long holds, rapid flicks
node r2/vscroll.js && node r2/vscroll2.js                # vertical drags in the iframe scroll the host page
node r3/agree.js                                         # what armed showed vs what the release did
node misc.js; node audio.js; node iframe-scroll.js
```

- `matrix.js` and `tapdial.js` end with `fails: 0` when all is well. The others print what they measured; read the output.
- Set `URL=` to point at another build (a worktree served on another port).
- Screenshots go to `shots/`, which is git-ignored.
- Headless delivery is much slower than a phone, so judge timing by event timestamps, not wall clock. A rare busy-run mismatch that disappears at normal speed is harness noise.
