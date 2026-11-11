// Head-and-neck model for spatial windows on display glasses. Angles in degrees: yaw + is right,
// pitch + is up. The key fact for XR display glasses: the image only exists inside the glasses'
// field of view, which moves with the head, so to read a world-locked window the head has to turn
// until the whole window sits inside that ~44 x 28 degree box. Eyes can only help within the slack
// between the window size and the field of view. Looking up (neck extension) is penalised more
// than looking down, and a seated user's relaxed head pitch is a little below the horizon.

export const MODEL = {
  fovH: 44, // VITURE Luma Ultra: 52 degree diagonal at 16:10 -> about 44 x 28
  fovV: 28,
  neutralPitch: -6,
  comfortYaw: 30, // head-turn limits treated as comfortable for sustained viewing
  comfortUp: 5,
  comfortDown: -25,
  wYaw: 1.0,
  wUp: 2.5,
  wDown: 0.6,
  travelWeight: 0.02, // cost units per degree of head travel per switch
};

// Smallest head rotation (from neutral) that brings the whole window inside the field of view.
export function headPose(yaw, pitch, w = 30, h = 20, m = MODEL) {
  const sy = Math.max(0, (m.fovH - w) / 2);
  const sp = Math.max(0, (m.fovV - h) / 2);
  const hy = Math.sign(yaw) * Math.max(0, Math.abs(yaw) - sy);
  let hp = m.neutralPitch;
  if (pitch > m.neutralPitch + sp) hp = pitch - sp;
  else if (pitch < m.neutralPitch - sp) hp = pitch + sp;
  return { yaw: hy, pitch: hp };
}

// Sustained-posture cost per minute of looking at a window (dimensionless).
export function postureCost(yaw, pitch, w, h0, m = MODEL) {
  const h = headPose(yaw, pitch, w, h0, m);
  const up = Math.max(0, h.pitch - 0);
  const down = Math.max(0, -10 - h.pitch);
  return m.wYaw * (h.yaw / m.comfortYaw) ** 2 + m.wUp * (up / 15) ** 2 + m.wDown * (down / 30) ** 2;
}

// Head rotation (degrees) to move attention from window a to window b.
export function headTravel(a, b, m = MODEL) {
  const ha = headPose(a.yaw, a.pitch, a.w, a.h, m);
  const hb = headPose(b.yaw, b.pitch, b.w, b.h, m);
  const dy = ha.yaw - hb.yaw;
  const dp = ha.pitch - hb.pitch;
  return Math.sqrt(dy * dy + dp * dp);
}

export function outsideComfort(yaw, pitch, w, h0, m = MODEL) {
  const h = headPose(yaw, pitch, w, h0, m);
  return { far: Math.abs(h.yaw) > m.comfortYaw, up: h.pitch > m.comfortUp, down: h.pitch < m.comfortDown };
}

// Angular rectangles: window i occupies [yaw - w/2, yaw + w/2] x [pitch - h/2, pitch + h/2].
// Vertical gap leaves room for SpaceWalker 3.0's title bar, which floats above each window.
export const GAP = { yaw: 1.5, pitch: 5.5 };
export function overlaps(a, b, gap = GAP) {
  return Math.abs(a.yaw - b.yaw) < (a.w + b.w) / 2 + gap.yaw && Math.abs(a.pitch - b.pitch) < (a.h + b.h) / 2 + gap.pitch;
}

export const BOUNDS = { yaw: [-85, 85], pitch: [-42, 48] };

export function inBounds(p) {
  return p.yaw - p.w / 2 >= BOUNDS.yaw[0] && p.yaw + p.w / 2 <= BOUNDS.yaw[1] && p.pitch - p.h / 2 >= BOUNDS.pitch[0] && p.pitch + p.h / 2 <= BOUNDS.pitch[1];
}

export function feasible(layout) {
  for (let i = 0; i < layout.length; i++) {
    if (!inBounds(layout[i])) return false;
    for (let j = i + 1; j < layout.length; j++) if (overlaps(layout[i], layout[j])) return false;
  }
  return true;
}

/**
 * Expected cost per hour of a layout given usage statistics:
 * share[i] = fraction of time on window i, rate[i][j] = switches i->j per hour.
 */
export function layoutCost(layout, usage, m = MODEL) {
  let c = 0;
  for (let i = 0; i < layout.length; i++) c += usage.share[i] * 60 * postureCost(layout[i].yaw, layout[i].pitch, layout[i].w, layout[i].h, m);
  for (let i = 0; i < layout.length; i++) {
    for (let j = 0; j < layout.length; j++) {
      if (i !== j && usage.rate[i][j]) c += m.travelWeight * usage.rate[i][j] * headTravel(layout[i], layout[j], m);
    }
  }
  return c;
}

/**
 * Replay a focus log (sequence of {win, dur} in seconds) on a layout and measure what the
 * neck actually does: degrees of head travel per hour, and the share of time spent with the
 * head turned past the comfort zone or tilted up.
 */
export function replay(layout, log, m = MODEL) {
  let travel = 0;
  let total = 0;
  let up = 0;
  let far = 0;
  let load = 0;
  for (let k = 0; k < log.length; k++) {
    const e = log[k];
    const p = layout[e.win];
    total += e.dur;
    const o = outsideComfort(p.yaw, p.pitch, p.w, p.h, m);
    if (o.up) up += e.dur;
    if (o.far) far += e.dur;
    load += (e.dur / 60) * postureCost(p.yaw, p.pitch, p.w, p.h, m);
    if (k > 0 && log[k - 1].win !== e.win) travel += headTravel(layout[log[k - 1].win], p, m);
  }
  const hours = total / 3600;
  return { travelPerHour: travel / hours, upShare: up / total, farShare: far / total, loadPerHour: load / hours, hours };
}
