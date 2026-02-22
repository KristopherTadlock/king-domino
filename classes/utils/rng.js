// Small deterministic RNG for multiplayer sync.
// mulberry32: fast, stable for game shuffles (not crypto).

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  // Prefer crypto in browser; fallback to Math.random.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return (Math.random() * 2 ** 32) >>> 0;
}
