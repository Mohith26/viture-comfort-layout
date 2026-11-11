// View model for one preset user: learn from 5 days, propose a layout, score on 2 held-out days.
import { makeUser, makeLog, learnUsage, manualLayout, tidyLayout, sortedRowLayout, splitSessions, APPS } from './usage.js';
import { optimizeLayout } from './optimize.js';
import { replay, headPose, MODEL } from './ergonomics.js';

export const PRESET_SEEDS = [11, 12, 13];

export function scoreSegments(layout, segs) {
  let t = 0;
  let h = 0;
  let up = 0;
  let far = 0;
  let load = 0;
  let switches = 0;
  for (const s of segs) {
    const r = replay(layout, s);
    t += r.travelPerHour * r.hours;
    up += r.upShare * r.hours;
    far += r.farShare * r.hours;
    load += r.loadPerHour * r.hours;
    h += r.hours;
    for (let k = 1; k < s.length; k++) if (s[k].win !== s[k - 1].win) switches++;
  }
  return { travel: t / h, up: up / h, far: far / h, load: load / h, hours: h, switchesPerHour: switches / h };
}

export function buildView(presetIndex) {
  const seed = PRESET_SEEDS[presetIndex];
  const user = makeUser(seed, presetIndex);
  const log = makeLog(user, 7, seed);
  const train = log.filter((e) => e.day < 5);
  const test = log.filter((e) => e.day >= 5);
  const usage = learnUsage(train, user.apps.length);
  const segs = splitSessions(test);
  const current = manualLayout(user, seed);
  const opt = optimizeLayout(current, usage, { seed });
  const layouts = { current, comfort: opt.layout, tidy: tidyLayout(user), sorted: sortedRowLayout(user, usage) };
  const scores = Object.fromEntries(Object.entries(layouts).map(([k, L]) => [k, scoreSegments(L, segs)]));
  const trainHours = usage.hours;
  return { seed, user, usage, layouts, scores, opt, trainHours, apps: user.apps.map((a) => ({ id: a, ...APPS[a] })), heads: (L) => L.map((p) => headPose(p.yaw, p.pitch, p.w, p.h)), fov: { h: MODEL.fovH, v: MODEL.fovV } };
}
