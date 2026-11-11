import EVAL from './data/eval.js';
import { buildView } from './src/engine.js';
import { PRESETS } from './src/usage.js';
import { MODEL } from './src/ergonomics.js';

const q = new URLSearchParams(location.search);
const state = { preset: Math.min(2, Math.max(0, Number(q.get('p') ?? 1))), mode: q.get('mode') === 'current' ? 'current' : 'comfort' };
const cache = new Map();
const $ = (id) => document.getElementById(id);
const icon = (n) => `<i data-lucide="${n}"></i>`;

// angular space -> scene pixels (area left of the panel)
const PX = 6.6;
const CX = 560;
const CY = 395;
const X = (yaw) => CX + yaw * PX;
const Y = (pitch) => CY - pitch * PX;

const view = () => {
  if (!cache.has(state.preset)) cache.set(state.preset, buildView(state.preset));
  return cache.get(state.preset);
};

const SURF = {
  chrome: { bg: '#f5f6f8', fg: '#1f1f1f' }, docs: { bg: '#f8f9fa', fg: '#202124' }, gmail: { bg: '#f6f8fc', fg: '#202124' },
  discord: { bg: '#313338', fg: '#dbdee1' }, slack: { bg: '#1a1d21', fg: '#d1d2d3' }, youtube: { bg: '#0f0f0f', fg: '#f1f1f1' },
  steam: { bg: 'linear-gradient(135deg,#1a6dba,#0d3b6a 70%)', fg: '#e6f0ff' }, spotify: { bg: '#121212', fg: '#f1f1f1' },
  notion: { bg: '#ffffff', fg: '#37352f' }, sheets: { bg: '#ffffff', fg: '#202124' },
};
function mock(id) {
  const s = SURF[id];
  const lines = (arr) => arr.map((c) => `<div class="ln ${c}"></div>`).join('');
  let inner = '';
  if (id === 'youtube') inner = `<div class="main"><div class="hero" style="background:linear-gradient(135deg,#3a4a63,#141a26)"></div><div class="thumbs">${['#5b3a3a', '#2f4f4f', '#4a4a6a'].map((c) => `<i style="background:${c}"></i>`).join('')}</div>${lines(['m', 's'])}</div>`;
  else if (id === 'steam') inner = `<div class="main"><div class="logo">Steam Link</div><div class="hero" style="background:rgba(255,255,255,.12);flex-basis:38%"></div>${lines(['m', 's', 'm'])}</div>`;
  else if (id === 'discord' || id === 'slack') inner = `<div class="rail" style="background:${id === 'slack' ? '#3f0e40' : '#1e1f22'}"><i></i><i></i><i></i><i></i></div><div class="main">${['#5865f2', '#f0b232', '#23a55a', '#eb459e', '#3d8bff', '#9b59b6'].map((c, i) => `<div class="msg"><b style="background:${c}"></b><div class="ln ${i % 2 ? 's' : 'm'}" style="flex:1"></div></div>`).join('')}</div>`;
  else if (id === 'spotify') inner = `<div class="main"><div class="ln h" style="background:#1db954;opacity:.9"></div>${lines(['m', 's'])}<div class="eq">${[5, 9, 6, 11, 7, 10, 4, 8].map((h) => `<i style="height:${h * 9}%"></i>`).join('')}</div></div>`;
  else if (id === 'sheets') inner = `<div class="main" style="padding:4% 0 0"><div class="ln h" style="margin-left:5%"></div><div class="cells"></div></div>`;
  else if (id === 'chrome') inner = `<div class="main" style="padding-top:0"><div style="height:16px;margin:0 -7%;background:#dfe1e5"></div><div class="hero" style="background:linear-gradient(135deg,#c9d6ea,#e9eef6);flex-basis:40%"></div>${lines(['h', 'm', '', 's'])}</div>`;
  else inner = `<div class="main" style="padding-left:12%;padding-right:12%">${lines(['h', '', 'm', '', '', 's', '', 'm', ''])}</div>`;
  return `<div class="app" style="background:${s.bg};color:${s.fg}">${inner}</div>`;
}

function windows(v, layout, heads) {
  const focus = v.usage.share.indexOf(Math.max(...v.usage.share));
  const total = v.usage.share.reduce((a, b) => a + b, 0);
  return layout.map((p, i) => {
    const a = v.apps[i];
    const h = heads[i];
    const turn = Math.round(Math.sqrt(h.yaw * h.yaw + (h.pitch - MODEL.neutralPitch) ** 2));
    const up = h.pitch > MODEL.comfortUp;
    const far = Math.abs(h.yaw) > MODEL.comfortYaw;
    const cls = up || far ? 'bad' : turn > 12 ? 'warn' : 'ok';
    const label = turn <= 1 ? 'No head turn' : `${up ? 'Look up' : far ? 'Turn' : 'Turn'} ${turn}°`;
    const w = p.w * PX;
    const hh = p.h * PX;
    return `<div class="win" style="left:${X(p.yaw) - w / 2}px;top:${Y(p.pitch) - hh / 2}px;width:${w}px;height:${hh}px;transform:perspective(1400px) rotateY(${(-p.yaw * 0.45).toFixed(1)}deg)">
      <div class="bar ${i === focus ? 'focus' : ''}"><span class="ic" style="background:${a.color}">${a.name[0]}</span>${a.name}${i === focus ? `<span class="ctl"><span>${icon('maximize-2')}</span><span>${icon('box')}</span><span>${icon('volume-2')}</span></span>` : ''}</div>
      <div class="body">${mock(a.id)}<span class="share">${Math.round((100 * v.usage.share[i]) / total)}% of time</span><span class="tag ${cls}">${icon(cls === 'ok' ? 'check' : up ? 'arrow-up' : 'move-horizontal')}${label}</span></div><span class="grab"></span></div>`;
  }).join('');
}

function links(v, layout) {
  const n = layout.length;
  let maxR = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) maxR = Math.max(maxR, v.usage.rate[i][j] + v.usage.rate[j][i]);
  let s = '';
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = v.usage.rate[i][j] + v.usage.rate[j][i];
      if (r < maxR * 0.12) continue;
      const a = layout[i];
      const b = layout[j];
      s += `<line x1="${X(a.yaw)}" y1="${Y(a.pitch)}" x2="${X(b.yaw)}" y2="${Y(b.pitch)}" stroke="url(#lg)" stroke-width="${1.5 + 7 * (r / maxR)}" stroke-linecap="round" opacity=".75"/>`;
    }
  }
  return `<defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#3d8bff"/></linearGradient></defs>${s}`;
}

const fmtPct = (x) => (x < 0.005 ? '0%' : `${Math.round(x * 100)}%`);

function panel(v) {
  const cur = v.scores.current;
  const cmf = v.scores.comfort;
  const s = state.mode === 'comfort' ? cmf : cur;
  const travelDelta = 1 - cmf.travel / cur.travel;
  const rows = [
    ['Your layout', v.scores.current.travel, '#9ca3af'],
    ['One panel', v.scores.tidy.travel, '#6b7280'],
    ['Comfort', v.scores.comfort.travel, 'linear-gradient(90deg,#7c5cff,#3d8bff)'],
  ];
  const maxT = Math.max(...rows.map((r) => r[1]));
  const primary = v.apps[v.usage.share.indexOf(Math.max(...v.usage.share))].name;
  let pairI = 0;
  let pairJ = 1;
  let best = -1;
  for (let i = 0; i < v.apps.length; i++) for (let j = i + 1; j < v.apps.length; j++) {
    const r = v.usage.rate[i][j] + v.usage.rate[j][i];
    if (r > best) { best = r; pairI = i; pairJ = j; }
  }
  $('panel').innerHTML = `
    <div class="p-head"><div class="sw-icon"><b>S</b></div><div><h1>Comfort Layout</h1><p>SpaceWalker Mode · Luma Ultra</p></div><span class="beta">BETA</span></div>
    <div class="seg">${PRESETS.map((p, i) => `<button class="${i === state.preset ? 'on' : ''}" data-p="${i}">${p.label}</button>`).join('')}</div>
    <div class="toggle"><button class="${state.mode === 'current' ? 'on' : ''}" data-m="current">${icon('layout-grid')}Your layout</button><button class="${state.mode === 'comfort' ? 'on' : ''}" data-m="comfort">${icon('sparkles')}Comfort Layout</button></div>
    <div class="metrics">
      <div class="m"><div class="l">Head turning per hour</div><div class="v"><b>${Math.round(s.travel).toLocaleString()}°</b><span>${(s.travel / 360).toFixed(1)} full turns</span>${state.mode === 'comfort' ? `<span class="delta good">−${Math.round(travelDelta * 100)}%</span>` : ''}</div>
        <div class="bars">${rows.map((r) => `<div class="r"><span>${r[0]}</span><span class="t"><i style="width:${(100 * r[1]) / maxT}%;background:${r[2]}"></i></span><span>${Math.round(r[1])}°</span></div>`).join('')}</div></div>
      <div class="m"><div class="l">Time looking up (neck extended)</div><div class="v"><b>${fmtPct(s.up)}</b><span>was ${fmtPct(cur.up)} with your layout</span></div></div>
      <div class="m"><div class="l">Time turned past 30°</div><div class="v"><b>${fmtPct(s.far)}</b><span>was ${fmtPct(cur.far)} with your layout</span></div></div>
    </div>
    <div class="why">${state.mode === 'comfort'
      ? `<b>${primary}</b> gets the spot straight ahead, and <b>${v.apps[pairI].name}</b> sits next to <b>${v.apps[pairJ].name}</b> because you switch between them ${Math.round(best)} times an hour. Nothing you use often sits above eye level.`
      : currentWhy(v)}</div>
    <button class="apply">${icon('wand-sparkles')}Apply layout</button>
    <div class="legend"><span class="br"></span>What the glasses show at once (${MODEL.fovH}° × ${MODEL.fovV}°)<span class="ln2"></span>Frequent switches</div>
    <div class="learned">Learned from ${v.trainHours.toFixed(1)} h of use over 5 days · scored on 2 later days (${cmf.hours.toFixed(1)} h)</div>`;
}

function currentWhy(v) {
  const L = v.layouts.current;
  const H = v.heads(L);
  const total = v.usage.share.reduce((a, b) => a + b, 0);
  const up = [];
  const far = [];
  L.forEach((p, i) => {
    if (H[i].pitch > MODEL.comfortUp) up.push(i);
    else if (Math.abs(H[i].yaw) > MODEL.comfortYaw) far.push(i);
  });
  const name = (i) => `<b>${v.apps[i].name}</b>`;
  const parts = [];
  if (up.length) parts.push(`${up.map(name).join(' and ')} ${up.length > 1 ? 'sit' : 'sits'} above eye level, so you tilt your head back to read ${up.length > 1 ? 'them' : 'it'}`);
  if (far.length) {
    const i = far.sort((a, b) => v.usage.share[b] - v.usage.share[a])[0];
    parts.push(`${name(i)}, open ${Math.round((100 * v.usage.share[i]) / total)}% of the time, needs a ${Math.round(Math.abs(H[i].yaw))}° turn`);
  }
  return parts.length ? `This is how your windows landed as you opened them. ${parts.join('; ')}.` : 'This is how your windows landed as you opened them.';
}

function render() {
  const v = view();
  const layout = v.layouts[state.mode];
  const heads = v.heads(layout);
  $('windows').innerHTML = windows(v, layout, heads);
  $('links').innerHTML = links(v, layout);
  const f = $('fov');
  f.style.left = `${X(-MODEL.fovH / 2)}px`;
  f.style.top = `${Y(MODEL.neutralPitch + MODEL.fovV / 2)}px`;
  f.style.width = `${MODEL.fovH * PX}px`;
  f.style.height = `${MODEL.fovV * PX}px`;
  panel(v);
  if (window.lucide) window.lucide.createIcons();
}

function evalSection() {
  const s = EVAL.summary;
  const red = EVAL.medianTravelReduction;
  const rows = [['Your layout (hand-placed)', s.current, '#9ca3af'], ['One tidy panel', s.tidy, '#6b7280'], ['Most-used in the middle', s.sorted, '#6b7280'], ['Comfort Layout', s.comfort, 'url(#eg)'], ['Hindsight best', s.oracle, '#3a3a3a']];
  const maxT = Math.max(...rows.map((r) => r[1].travelMedian));
  const bar = rows.map((r, i) => `<text x="0" y="${22 + i * 36}" fill="#bdbdbd" font-size="12">${r[0]}</text>
    <rect x="0" y="${28 + i * 36}" width="${(380 * r[1].travelMedian) / maxT}" height="10" rx="5" fill="${r[2]}"/>
    <text x="${(380 * r[1].travelMedian) / maxT + 8}" y="${37 + i * 36}" fill="#fff" font-size="12" font-weight="600">${Math.round(r[1].travelMedian)}°/h</text>`).join('');
  $('eval').innerHTML = `
    <h2>Does it hold up? <em>Backtest on ${EVAL.config.users} synthetic users</em></h2>
    <div class="sub">Each user's layout was learned from 5 days of window use, then scored by replaying 2 later days it never saw (${Math.round(EVAL.heldOutHours).toLocaleString()} hours in total).</div>
    <div class="ecards">
      <div class="ecard"><h3>Median head turning per hour, held-out days</h3><svg width="100%" viewBox="0 0 470 190" font-family="Figtree"><defs><linearGradient id="eg"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#3d8bff"/></linearGradient></defs>${bar}</svg></div>
      <div class="ecard"><h3>Head turning vs. the user's own layout</h3><div class="big">−${Math.round(red.vsCurrent * 100)}%<small>median</small></div>
        <div class="kv"><span>Users who turn their head less</span><b>${(EVAL.betterThanCurrent * 100).toFixed(1)}%</b><span>vs. one tidy panel</span><b>−${Math.round(red.vsTidy * 100)}%</b><span>vs. most-used in the middle</span><b>−${Math.round(red.vsSorted * 100)}%</b><span>Gap to hindsight-best layout</span><b>${(EVAL.oracleGap * 100).toFixed(1)}%</b></div></div>
      <div class="ecard"><h3>Neck posture, share of viewing time</h3>
        <div class="kv" style="margin-top:0"><span>Looking up, your layout</span><b>${(s.current.upShare * 100).toFixed(1)}%</b><span>Looking up, Comfort Layout</span><b>${(s.comfort.upShare * 100).toFixed(1)}%</b><span>Turned past 30°, your layout</span><b>${(s.current.farShare * 100).toFixed(1)}%</b><span>Turned past 30°, Comfort Layout</span><b>${(s.comfort.farShare * 100).toFixed(1)}%</b></div></div>
    </div>
    <p class="method"><b>How it works.</b> The glasses only show a ${MODEL.fovH}° × ${MODEL.fovV}° window of the world, so to read a window pinned in space your head has to turn until the whole window fits in view. From a focus log (which window is in front, for how long, and what you switch to next), Comfort Layout learns how much time each window gets and how often you jump between each pair. It then searches window positions with simulated annealing (moves, swaps and snapping next to another window, ${16} restarts, no overlaps) to minimise a neck cost: time-weighted head rotation away from a relaxed, slightly-downward pose, with looking up weighted 2.5× and looking down 0.6×, plus the head travel of every switch. "Your layout" is how windows land when opened one by one in SpaceWalker 3.0 (a row of three, then extras pulled above it). Hindsight best is the same search run on the held-out days themselves.</p>`;
}

document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-p]');
  if (p) { state.preset = Number(p.dataset.p); render(); return; }
  const m = e.target.closest('[data-m]');
  if (m) { state.mode = m.dataset.m; render(); }
});

evalSection();
render();
window.__ready = true;
