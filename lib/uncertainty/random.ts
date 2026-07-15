export type RandomSource = () => number;

/** Stable browser-safe 32-bit hash for deterministic worker seeds. */
export function stableSeed32(token: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Mulberry32: compact, deterministic, and adequate for simulation draws. */
export function deterministicRandom(seed: number): RandomSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Random seed must be an unsigned 32-bit integer.");
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    // Add one half-unit so the result is strictly between zero and one.
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296 + 1 / 8589934592;
  };
}

export function sampleBeta(
  alpha: number,
  beta: number,
  random: RandomSource,
): number {
  if (!Number.isFinite(alpha) || alpha <= 0 || !Number.isFinite(beta) || beta <= 0) {
    throw new RangeError("Beta shape parameters must be positive and finite.");
  }
  const left = sampleGamma(alpha, random);
  const right = sampleGamma(beta, random);
  return left / (left + right);
}

/** Marsaglia-Tsang gamma sampler, including the shape < 1 transformation. */
export function sampleGamma(shape: number, random: RandomSource): number {
  if (!Number.isFinite(shape) || shape <= 0) {
    throw new RangeError("Gamma shape must be positive and finite.");
  }
  if (shape < 1) {
    return sampleGamma(shape + 1, random) * random() ** (1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const normal = sampleStandardNormal(random);
    const base = 1 + c * normal;
    if (base <= 0) continue;
    const candidate = base ** 3;
    const uniform = random();
    if (
      uniform < 1 - 0.0331 * normal ** 4 ||
      Math.log(uniform) < 0.5 * normal ** 2 + d * (1 - candidate + Math.log(candidate))
    ) {
      return d * candidate;
    }
  }
}

function sampleStandardNormal(random: RandomSource): number {
  const first = random();
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}
