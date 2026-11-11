// Comfort Layout search: simulated annealing over window centres (continuous yaw/pitch) with
// moves, swaps and edge-snaps, restarted several times; infeasible states (overlap, out of the
// reachable band) are rejected. Deterministic for a given seed.
import { mulberry32, normal } from './rng.js';
import { layoutCost, feasible, overlaps, inBounds } from './ergonomics.js';

const clone = (L) => L.map((p) => ({ ...p }));

function validAt(L, i) {
  if (!inBounds(L[i])) return false;
  for (let j = 0; j < L.length; j++) if (j !== i && overlaps(L[i], L[j])) return false;
  return true;
}

export function optimizeLayout(start, usage, opts = {}) {
  const restarts = opts.restarts ?? 16;
  const iters = opts.iters ?? 6000;
  const rng = mulberry32(opts.seed ?? 1);
  let best = { layout: clone(start), cost: layoutCost(start, usage) };
  const found = [];
  for (let r = 0; r < restarts; r++) {
    // restart 0 begins from the current layout; others from a random shuffle of it
    let L = clone(start);
    if (r > 0) {
      for (let k = 0; k < 40; k++) {
        const i = Math.floor(rng() * L.length);
        const old = { ...L[i] };
        L[i].yaw += normal(rng) * 25;
        L[i].pitch += normal(rng) * 12;
        if (!validAt(L, i)) L[i] = old;
      }
    }
    let cost = layoutCost(L, usage);
    let T = cost * 0.08 + 1e-6;
    const cool = Math.pow(1e-3, 1 / iters);
    let localBest = { layout: clone(L), cost };
    for (let it = 0; it < iters; it++) {
      const u = rng();
      const i = Math.floor(rng() * L.length);
      let undo;
      if (u < 0.7) {
        const old = { ...L[i] };
        const step = 1 + 10 * (1 - it / iters);
        L[i].yaw += normal(rng) * step;
        L[i].pitch += normal(rng) * step * 0.6;
        if (!validAt(L, i)) { L[i] = old; continue; }
        undo = () => { L[i] = old; };
      } else if (u < 0.88) {
        const j = Math.floor(rng() * L.length);
        if (j === i) continue;
        const a = { ...L[i] };
        const b = { ...L[j] };
        L[i] = { ...a, yaw: b.yaw, pitch: b.pitch };
        L[j] = { ...b, yaw: a.yaw, pitch: a.pitch };
        if (!validAt(L, i) || !validAt(L, j)) { L[i] = a; L[j] = b; continue; }
        undo = () => { L[i] = a; L[j] = b; };
      } else {
        // snap window i next to another window j (left/right/below/above)
        const j = Math.floor(rng() * L.length);
        if (j === i) continue;
        const old = { ...L[i] };
        const side = Math.floor(rng() * 4);
        const g = 2;
        if (side === 0) { L[i].yaw = L[j].yaw - (L[j].w + L[i].w) / 2 - g; L[i].pitch = L[j].pitch; }
        if (side === 1) { L[i].yaw = L[j].yaw + (L[j].w + L[i].w) / 2 + g; L[i].pitch = L[j].pitch; }
        if (side === 2) { L[i].pitch = L[j].pitch - (L[j].h + L[i].h) / 2 - g; L[i].yaw = L[j].yaw; }
        if (side === 3) { L[i].pitch = L[j].pitch + (L[j].h + L[i].h) / 2 + g; L[i].yaw = L[j].yaw; }
        if (!validAt(L, i)) { L[i] = old; continue; }
        undo = () => { L[i] = old; };
      }
      const c2 = layoutCost(L, usage);
      if (c2 <= cost || rng() < Math.exp((cost - c2) / T)) {
        cost = c2;
        if (cost < localBest.cost) localBest = { layout: clone(L), cost };
      } else undo();
      T *= cool;
    }
    found.push(localBest.cost);
    if (localBest.cost < best.cost) best = localBest;
  }
  best = polish(best.layout, usage);
  if (!feasible(best.layout)) throw new Error('optimizer returned an infeasible layout');
  const tol = best.cost * 0.01 + 1e-9;
  return { layout: best.layout, cost: best.cost, restarts, agree: found.filter((c) => c <= best.cost + tol).length };
}

// Deterministic finish: coordinate descent on a shrinking grid, then round to 0.5 degrees.
function polish(start, usage) {
  let L = clone(start);
  let cost = layoutCost(L, usage);
  for (const step of [4, 2, 1, 0.5]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < L.length; i++) {
        for (const [dy, dp] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const old = { ...L[i] };
          L[i].yaw += dy;
          L[i].pitch += dp;
          if (validAt(L, i)) {
            const c = layoutCost(L, usage);
            if (c < cost - 1e-9) { cost = c; improved = true; continue; }
          }
          L[i] = old;
        }
      }
    }
  }
  const R = L.map((p) => ({ ...p, yaw: Math.round(p.yaw * 2) / 2, pitch: Math.round(p.pitch * 2) / 2 }));
  if (feasible(R)) L = R;
  return { layout: L, cost: layoutCost(L, usage) };
}
