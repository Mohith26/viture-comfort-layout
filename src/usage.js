// Synthetic SpaceWalker users: which apps they keep open, how they switch between them, and
// the window layouts they would plausibly have today. Seeded and deterministic.
import { substream, lognormalMean, pick } from './rng.js';

// Angular sizes (degrees) for each app's window at a typical distance and size.
export const APPS = {
  chrome: { name: 'Chrome', kind: 'browser', w: 40, h: 25, color: '#4285f4' },
  docs: { name: 'Google Docs', kind: 'text', w: 34, h: 26, color: '#4285f4' },
  gmail: { name: 'Gmail', kind: 'text', w: 36, h: 23, color: '#ea4335' },
  discord: { name: 'Discord', kind: 'chat', w: 26, h: 28, color: '#5865f2' },
  slack: { name: 'Slack', kind: 'chat', w: 28, h: 24, color: '#4a154b' },
  youtube: { name: 'YouTube', kind: 'video', w: 40, h: 23, color: '#ff0000' },
  steam: { name: 'Steam Link', kind: 'video', w: 44, h: 25, color: '#1b2838' },
  spotify: { name: 'Spotify', kind: 'media', w: 22, h: 20, color: '#1db954' },
  notion: { name: 'Notion', kind: 'text', w: 34, h: 24, color: '#111111' },
  sheets: { name: 'Google Sheets', kind: 'text', w: 40, h: 24, color: '#0f9d58' },
};

export const PRESETS = [
  { id: 'work', label: 'Remote work', apps: ['docs', 'slack', 'chrome', 'gmail', 'spotify'], primary: 0,
    links: [[0, 1, 5], [0, 2, 4], [1, 3, 2], [0, 3, 1], [2, 1, 1]], dwell: [420, 75, 160, 120, 25] },
  { id: 'play', label: 'Gaming night', apps: ['steam', 'discord', 'youtube', 'chrome', 'spotify'], primary: 0,
    links: [[0, 1, 6], [0, 2, 2], [1, 2, 1], [2, 3, 1], [0, 4, 1]], dwell: [600, 45, 240, 90, 20] },
  { id: 'study', label: 'Study session', apps: ['notion', 'youtube', 'chrome', 'discord', 'sheets'], primary: 0,
    links: [[0, 1, 4], [0, 2, 5], [1, 2, 1], [0, 3, 2], [4, 0, 2]], dwell: [360, 300, 140, 50, 200] },
];

const ALL = Object.keys(APPS);

export function makeUser(seed, presetIndex = null) {
  const r = substream(seed, 'user');
  let apps;
  let P;
  let dwell;
  let label;
  if (presetIndex !== null) {
    const pr = PRESETS[presetIndex];
    apps = pr.apps.slice();
    label = pr.label;
    const n = apps.length;
    P = Array.from({ length: n }, () => new Array(n).fill(0.15));
    for (const [a, b, wgt] of pr.links) { P[a][b] += wgt; P[b][a] += wgt * 0.8; }
    dwell = pr.dwell.slice();
  } else {
    const n = 3 + Math.floor(r() * 3);
    const pool = ALL.slice();
    apps = [];
    for (let i = 0; i < n; i++) apps.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    label = 'Synthetic user';
    P = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) P[i][j] = r() < 0.45 ? 0.1 : -Math.log(r() + 1e-9) * (j === 0 || i === 0 ? 2.2 : 1);
    dwell = apps.map((_, i) => (i === 0 ? lognormalMean(r, 360, 0.5) : lognormalMean(r, 110, 0.8)));
  }
  for (let i = 0; i < P.length; i++) {
    P[i][i] = 0;
    const s = P[i].reduce((a, b) => a + b, 0);
    P[i] = P[i].map((x) => x / s);
  }
  return { seed, label, apps, P, dwell };
}

// Focus log: sessions of window focus with dwell times (seconds), tagged by day.
export function makeLog(user, days, seed) {
  const r = substream(seed, 'log');
  const log = [];
  for (let d = 0; d < days; d++) {
    const sessions = 1 + Math.floor(r() * 3);
    for (let s = 0; s < sessions; s++) {
      let left = 60 * (25 + r() * 95);
      let cur = r() < 0.7 ? 0 : Math.floor(r() * user.apps.length);
      while (left > 0) {
        const dur = Math.min(left, Math.max(4, lognormalMean(r, user.dwell[cur], 0.9)));
        log.push({ win: cur, dur, day: d });
        left -= dur;
        const u = r();
        let acc = 0;
        let nxt = cur;
        for (let j = 0; j < user.apps.length; j++) { acc += user.P[cur][j]; if (u <= acc) { nxt = j; break; } }
        cur = nxt;
      }
      log.push({ win: -1, dur: 0, day: d }); // session break: no head travel across sessions
    }
  }
  return log;
}

// Usage statistics learned from a log: time share and switches per hour (with light smoothing).
export function learnUsage(log, n) {
  const time = new Array(n).fill(0);
  const cnt = Array.from({ length: n }, () => new Array(n).fill(0));
  let total = 0;
  let prev = -1;
  for (const e of log) {
    if (e.win < 0) { prev = -1; continue; }
    time[e.win] += e.dur;
    total += e.dur;
    if (prev >= 0 && prev !== e.win) cnt[prev][e.win]++;
    prev = e.win;
  }
  const hours = total / 3600;
  return {
    hours,
    // 1% prior per window: rarely used windows still shouldn't land somewhere painful
    share: time.map((t) => (t + 0.01 * total) / (total * (1 + 0.01 * n))),
    rate: cnt.map((row) => row.map((c, j) => (c + 0.05) / hours)),
  };
}

export function splitSessions(log) {
  // break markers -> separate replay segments so travel isn't counted across sessions
  const out = [];
  let cur = [];
  for (const e of log) {
    if (e.win < 0) { if (cur.length) out.push(cur); cur = []; } else cur.push(e);
  }
  if (cur.length) out.push(cur);
  return out;
}

const size = (user, i) => ({ w: APPS[user.apps[i]].w, h: APPS[user.apps[i]].h });

/**
 * "Current" layout a user plausibly built by hand in SpaceWalker 3.0: windows open into a row at
 * eye level, and once the row holds three, later windows get pulled up above it (as in the launch
 * video). Opening order is the primary app first most of the time.
 */
export function manualLayout(user, seed) {
  const r = substream(seed, 'manual');
  const n = user.apps.length;
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  if (r() < 0.6) { order.splice(order.indexOf(0), 1); order.unshift(0); }
  const row1 = order.slice(0, Math.min(3, n));
  const row2 = order.slice(3);
  const layout = new Array(n);
  placeRow(user, row1, -3, layout, true);
  if (row2.length) {
    const top = Math.max(...row1.map((i) => size(user, i).h)) / 2 - 3;
    const h2 = Math.max(...row2.map((i) => size(user, i).h));
    placeRow(user, row2, top + h2 / 2 + 6, layout, false);
  }
  return layout;
}

// SpaceWalker's "snap every window back into one tidy panel": one centred row.
export function tidyLayout(user) {
  const n = user.apps.length;
  const layout = new Array(n);
  placeRow(user, [...Array(n).keys()], -4, layout, false);
  return layout;
}

function placeRow(user, idx, pitch, layout, centerFirst) {
  const gap = 2;
  let seq = idx.slice();
  if (centerFirst && seq.length === 3) seq = [seq[1], seq[0], seq[2]]; // first-opened window in the middle
  const widths = seq.map((i) => size(user, i).w);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (seq.length - 1);
  let x = -total / 2;
  seq.forEach((i, k) => {
    const s = size(user, i);
    layout[i] = { yaw: x + s.w / 2, pitch, w: s.w, h: s.h };
    x += s.w + gap;
  });
}

// A strong hand-made rule for comparison: most-used window in the centre at eye level, the rest
// alternating left/right by how much they are used (one row).
export function sortedRowLayout(user, usage) {
  const n = user.apps.length;
  const byUse = [...Array(n).keys()].sort((a, b) => usage.share[b] - usage.share[a]);
  const seq = [];
  byUse.forEach((i, k) => { if (k % 2 === 0) seq.push(i); else seq.unshift(i); });
  const layout = new Array(n);
  placeRow(user, seq, -8, layout, false);
  return layout;
}
