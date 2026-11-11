# Comfort Layout for VITURE SpaceWalker (concept demo)

**Live demo:** https://mohith26.github.io/viture-comfort-layout/

SpaceWalker 3.0 lets you open up to five windows and place them anywhere around you. Where people put them is mostly where they landed when opened: a row in front, extra windows pulled up above it. On display glasses that has a cost, because the glasses only show about a 44° × 28° slice of the world. To read a window pinned in space, your head has to turn until the whole window is inside that slice, every time you switch to it.

Comfort Layout learns which windows you actually use and which ones you jump between, then proposes a layout that keeps the busiest window straight ahead, puts frequent pairs next to each other, and keeps anything you read for long out of the "look up" zone.

Unofficial concept demo by Mohith Gajjela. Not affiliated with VITURE. All usage data is synthetic. Room photo: Shixart1985, CC BY 2.0, via Wikimedia Commons.

## What the demo shows

* The room view with SpaceWalker-style windows (title pill above, grab bar below). Each window shows its share of time and the head turn it needs. The corner brackets mark what the glasses show at once with your head relaxed; purple lines are the switches you make most.
* The Comfort Layout panel: three example users (Remote work, Gaming night, Study session), a toggle between **Your layout** and **Comfort Layout** (windows animate between them), head turning per hour, time spent looking up, time turned past 30°, and a plain explanation of why the layout looks the way it does.
* A backtest over 400 synthetic users.

## How it works

1. **Head model** (`src/ergonomics.js`). For a window centred at (yaw, pitch) with angular size (w, h), the head turns by the smallest amount that brings the whole window inside the field of view (44° × 28°, from Luma Ultra's 52° diagonal at 16:10). The eyes cover the rest. Sustained cost is quadratic in the head angle away from a relaxed, slightly-downward pose (-6°), with looking up weighted 2.5× and looking down 0.6×. Switching costs the head rotation between the two poses.
2. **Usage** (`src/usage.js`). From a focus log (which window is in front, for how long, and what comes next) it learns the share of time per window and the switch rate between every pair. A 1% prior keeps rarely used windows from landing somewhere painful.
3. **Search** (`src/optimize.js`). Simulated annealing over window centres with three moves (nudge, swap two windows, snap a window next to another), 16 restarts, no overlaps (with room for the title bar), then a deterministic coordinate-descent finish rounded to 0.5°. It minimises `sum(time share x posture cost) + 0.02 x sum(switch rate x head travel)`.
4. **Determinism.** The random generator and the annealer use only exactly rounded arithmetic (own log/exp, polar-method normals), so the browser and Node produce bit-identical layouts; Math.log differs in the last bit between V8 versions, which is enough to change an annealing run.
5. **Scoring** is always on held-out days: each user has 7 days of logs; the layout is learned on days 1-5 and scored by replaying days 6-7.

## Backtest

`node scripts/evaluate.mjs` (400 synthetic users, 3-5 windows each, 1,939 held-out hours). Median head turning per hour on held-out days:

| Layout | Median head turning | Time looking up | Time turned past 30° |
|---|---|---|---|
| Your layout (as opened in SpaceWalker 3.0) | 819°/h | 18.3% | 22.4% |
| One tidy panel (SpaceWalker's snap-to-panel) | 1,191°/h | 0% | 66.3% |
| Most-used window in the middle (a strong hand rule) | 990°/h | 0% | 22.1% |
| **Comfort Layout** | **593°/h** | **0.1%** | **2.5%** |
| Hindsight best (same search on the held-out days) | 589°/h | 0.1% | 2.1% |

Median reduction in head turning: 28% vs. the user's own layout (98.0% of users turn less), 49% vs. one tidy panel, 39% vs. most-used-in-the-middle. The gap to the hindsight-best layout is 0.1%, so five days of usage is enough to learn a stable layout in this simulation.

## Tests

```
npm test          # node --test test/*.test.mjs (11 tests)
npm run evaluate
```

Tests cover the head model (exact head turns for hand-computed cases, up vs. down asymmetry, symmetric travel), exact replay numbers on a hand-built log, usage learning across session breaks, feasibility of baseline and optimized layouts, that the optimizer never ends worse than its start, that the busiest window ends up in view, held-out separation, and the backtest file.

## Honest limitations

* All usage data is synthetic and the generator is mine. The backtest shows the method works when users behave like the generator, not that real users would see 28%.
* The neck-cost weights are a reasonable model, not a validated one. The 2.5× penalty for looking up follows the common ergonomics guidance that neck extension is worse than flexion; real tuning would need user studies or VITURE's own comfort data.
* "Your layout" is my reconstruction of how windows land when opened in SpaceWalker 3.0 (from the launch video), not real user layouts.
* The model treats windows as flat rectangles at one distance. Real windows sit 2-10 m away and can be resized; adding distance and size to the search is straightforward.
* It needs a focus log. SpaceWalker presumably knows which window is focused, but I don't know whether it records it.

## Novelty

I checked VITURE's SpaceWalker 3.0 launch post (Nov 4 2026) and video, SpaceWalker release notes (iOS/Android, through Dec 2025 and the Nov 2026 Play Store notes), the Academy pages for SpaceWalker Desktop/Mobile/Windows, and the Glasses SDK docs. SpaceWalker has fixed layouts (single, dual, triple, stacked), drag/resize, recenter, calibration and a gesture that snaps every window into one panel. I found nothing that arranges windows from usage or models neck posture. visionOS and Quest place new windows relative to the head but don't learn layouts from use, as far as I could find. Research systems have optimized mixed-reality UI placement before (for example Lindlbauer et al., "Context-Aware Online Adaptation of Mixed Reality Interfaces", UIST 2019); the new part here is a field-of-view-aware neck cost for display glasses, learned from SpaceWalker-style window focus and shipped as a one-tap layout.

## Files

```
index.html, styles.css, app.js   the scene, panel and backtest section (static, CDN fonts/icons only)
src/ergonomics.js                head model, costs, replay
src/usage.js                     synthetic users, focus logs, usage learning, baseline layouts
src/optimize.js                  simulated annealing + coordinate-descent polish
src/engine.js                    view model for the three example users
scripts/evaluate.mjs             backtest -> data/eval.json, data/eval.js
test/core.test.mjs               unit tests
assets/room.jpg                  CC BY 2.0 photo (Shixart1985, Wikimedia Commons)
```
