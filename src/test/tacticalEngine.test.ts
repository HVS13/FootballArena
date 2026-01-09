import { describe, expect, test } from 'vitest';
import {
  applyWidthBias,
  getDefensiveLineAxis,
  getLineOfEngagementAxis,
  getPressBias
} from '../agents/engine/tacticalEngine';

describe('tacticalEngine', () => {
  test('getLineOfEngagementAxis uses expected defaults', () => {
    expect(getLineOfEngagementAxis('High Press')).toBe(62);
    expect(getLineOfEngagementAxis('Low Block')).toBe(42);
    expect(getLineOfEngagementAxis('Mid Block')).toBe(52);
    expect(getLineOfEngagementAxis(undefined)).toBe(52);
  });

  test('getDefensiveLineAxis honors depth presets', () => {
    expect(getDefensiveLineAxis('Deeper')).toBe(22);
    expect(getDefensiveLineAxis('Higher')).toBe(32);
    expect(getDefensiveLineAxis('Much Higher')).toBe(38);
    expect(getDefensiveLineAxis(undefined)).toBe(27);
  });

  test('getPressBias shifts with engagement and press instructions', () => {
    const aggressive = getPressBias({
      line_of_engagement: 'High Press',
      trigger_press: 'More Often',
      defensive_transition: 'Counter-Press',
      pressing_trap: 'Active'
    });
    const passive = getPressBias({
      line_of_engagement: 'Low Block',
      trigger_press: 'Less Often',
      defensive_transition: 'Regroup'
    });

    expect(aggressive).toBeGreaterThan(0);
    expect(passive).toBeLessThan(0);
  });

  test('applyWidthBias expands and narrows from the midline', () => {
    const midY = 34;
    const baseY = 10;
    const wider = applyWidthBias(baseY, 0.4, midY);
    const narrower = applyWidthBias(baseY, -0.4, midY);

    expect(wider).toBeLessThan(baseY);
    expect(narrower).toBeGreaterThan(baseY);
  });
});
