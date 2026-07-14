export type RandomSource = () => number;

export const normalizeSeed = (seed: number) => {
  if (!Number.isFinite(seed)) return 1;
  return (Math.trunc(seed) >>> 0) || 1;
};

export const createSeededRandom = (seed: number): RandomSource => {
  let state = normalizeSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
