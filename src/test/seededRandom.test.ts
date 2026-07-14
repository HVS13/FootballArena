import { describe, expect, test } from 'vitest';
import { createSeededRandom } from '../agents/engine/seededRandom';

describe('createSeededRandom', () => {
  test('repeats the same sequence for the same seed', () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second));
  });

  test('keeps values in the unit interval', () => {
    const random = createSeededRandom(7);
    const values = Array.from({ length: 100 }, random);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
