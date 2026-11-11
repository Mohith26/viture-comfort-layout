// Small seeded PRNG utilities. Everything here uses only +, -, *, / and sqrt (all exactly rounded
// in IEEE 754), so results are bit-identical across JS engines. Math.log/exp/cos can differ in the
// last bit between V8 versions, which is enough to send a simulated-annealing run down another path.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive an independent stream from a parent seed and a label (FNV-1a on the label).
export function substream(seed, label) {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  const s = String(label);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mulberry32(h);
}

const LN2 = 0.6931471805599453;

export function detLog(x) {
  if (!(x > 0)) return -Infinity;
  let k = 0;
  let m = x;
  while (m >= 1.5) { m /= 2; k++; }
  while (m < 0.75) { m *= 2; k--; }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = 0;
  for (let n = 1; n < 60; n += 2) { sum += term / n; term *= s2; }
  return 2 * sum + k * LN2;
}

export function detExp(x) {
  if (x < -700) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 30; n++) { term = (term * r) / n; sum += term; }
  let out = sum;
  if (k > 0) for (let i = 0; i < k; i++) out *= 2;
  else for (let i = 0; i < -k; i++) out /= 2;
  return out;
}

// Marsaglia polar method (no trig needed)
export function normal(rng) {
  let u;
  let v;
  let s;
  do {
    u = 2 * rng() - 1;
    v = 2 * rng() - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt((-2 * detLog(s)) / s);
}

export function lognormalMean(rng, mean, cv) {
  const s2 = detLog(1 + cv * cv);
  const mu = detLog(mean) - s2 / 2;
  return detExp(mu + Math.sqrt(s2) * normal(rng));
}

export function poisson(rng, lambda) {
  const L = detExp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function uniform(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}
