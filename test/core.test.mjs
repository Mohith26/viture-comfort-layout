import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { headPose, postureCost, headTravel, layoutCost, replay, feasible, overlaps, MODEL } from '../src/ergonomics.js';
import { makeUser, makeLog, learnUsage, manualLayout, splitSessions } from '../src/usage.js';
import { optimizeLayout } from '../src/optimize.js';
import { buildView } from '../src/engine.js';

test('a window that fits in the field of view needs no head turn', () => {
  const h = headPose(5, MODEL.neutralPitch, 30, 20);
  assert.equal(h.yaw, 0); // slack = (44 - 30) / 2 = 7 degrees
  assert.equal(h.pitch, MODEL.neutralPitch);
  assert.equal(postureCost(5, MODEL.neutralPitch, 30, 20), 0);
});

test('head turn is the minimum rotation that brings the whole window into view', () => {
  const h = headPose(30, MODEL.neutralPitch, 30, 20);
  assert.equal(h.yaw, 23); // 30 - 7
  const up = headPose(0, 20, 30, 20); // vertical slack = 4
  assert.equal(up.pitch, 16);
  const down = headPose(0, -30, 30, 20);
  assert.equal(down.pitch, -26);
});

test('looking up costs more than looking down by the same amount', () => {
  const upC = postureCost(0, MODEL.neutralPitch + 20, 30, 20);
  const downC = postureCost(0, MODEL.neutralPitch - 20, 30, 20);
  assert.ok(upC > 3 * downC, `${upC} vs ${downC}`);
});

test('head travel is symmetric and zero for the same window', () => {
  const a = { yaw: -30, pitch: 0, w: 30, h: 20 };
  const b = { yaw: 25, pitch: -20, w: 40, h: 24 };
  assert.equal(headTravel(a, a), 0);
  assert.ok(Math.abs(headTravel(a, b) - headTravel(b, a)) < 1e-12);
});

test('replay measures travel per hour exactly on a hand-built log', () => {
  const L = [{ yaw: 0, pitch: MODEL.neutralPitch, w: 30, h: 20 }, { yaw: 37, pitch: MODEL.neutralPitch, w: 30, h: 20 }];
  // window 1 needs a 30 degree head turn; 4 switches in 1 hour -> 120 degrees per hour
  const log = [0, 1, 0, 1, 0].map((win) => ({ win, dur: 720 }));
  const r = replay(L, log);
  assert.ok(Math.abs(r.travelPerHour - 120) < 1e-9);
  assert.ok(Math.abs(r.farShare - 0) < 1e-12); // 30 is not past 30
  assert.equal(r.upShare, 0);
});

test('learned usage matches the log', () => {
  const log = [{ win: 0, dur: 600 }, { win: 1, dur: 300 }, { win: 0, dur: 300 }, { win: -1, dur: 0 }, { win: 1, dur: 600 }];
  const u = learnUsage(log, 2);
  assert.ok(Math.abs(u.hours - 0.5) < 1e-12);
  assert.ok(u.share[0] > 0.49 && u.share[0] < 0.51);
  // 2 switches in 0.5 h (none across the session break)
  assert.ok(Math.abs(u.rate[0][1] - (1 + 0.05) / 0.5) < 1e-12);
  assert.ok(Math.abs(u.rate[1][0] - (1 + 0.05) / 0.5) < 1e-12);
});

test('baseline layouts are feasible (no overlaps, in reach)', () => {
  for (let s = 0; s < 60; s++) {
    const u = makeUser(1000 + s, null);
    assert.ok(feasible(manualLayout(u, s)), `manual ${s}`);
    // the one-panel baseline is scored as-is; with 5 wide windows it can run past the reachable band
  }
});

test('optimizer returns a feasible layout no worse than where it started', () => {
  for (let s = 0; s < 15; s++) {
    const u = makeUser(2000 + s, null);
    const usage = learnUsage(makeLog(u, 5, s), u.apps.length);
    const start = manualLayout(u, s);
    const r = optimizeLayout(start, usage, { seed: s, restarts: 4, iters: 1500 });
    assert.ok(feasible(r.layout));
    assert.ok(r.cost <= layoutCost(start, usage) + 1e-9);
    for (let i = 0; i < r.layout.length; i++) for (let j = i + 1; j < r.layout.length; j++) assert.ok(!overlaps(r.layout[i], r.layout[j]));
  }
});

test('the most-used window ends up in view without a big turn', () => {
  for (const p of [0, 1, 2]) {
    const v = buildView(p);
    const i = v.usage.share.indexOf(Math.max(...v.usage.share));
    const h = v.heads(v.layouts.comfort)[i];
    assert.ok(Math.abs(h.yaw) <= 12 && h.pitch <= MODEL.comfortUp, `preset ${p}: ${JSON.stringify(h)}`);
  }
});

test('held-out scoring uses only days the optimizer never saw', () => {
  const u = makeUser(11, 0);
  const log = makeLog(u, 7, 11);
  const segs = splitSessions(log.filter((e) => e.day >= 5));
  assert.ok(segs.every((s) => s.every((e) => e.day >= 5)));
  assert.ok(log.some((e) => e.day < 5));
});

test('backtest file is internally consistent', () => {
  const ev = JSON.parse(readFileSync(new URL('../data/eval.json', import.meta.url)));
  assert.equal(ev.config.users, 400);
  assert.ok(ev.summary.comfort.travelMedian < ev.summary.current.travelMedian);
  assert.ok(ev.summary.oracle.travelMean <= ev.summary.comfort.travelMean * 1.05);
  assert.ok(ev.medianTravelReduction.vsCurrent > 0 && ev.medianTravelReduction.vsCurrent < 1);
  assert.ok(ev.betterThanCurrent > 0.5 && ev.betterThanCurrent <= 1);
});
