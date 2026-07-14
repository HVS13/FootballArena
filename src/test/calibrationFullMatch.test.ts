import { describe, expect, test } from 'vitest';
import { GameEngineAgent } from '../agents/GameEngineAgent';
import { TeamMatchStats } from '../domain/matchTypes';

const suite = process.env.CALIBRATION_FULL === '1' ? describe : describe.skip;
const seeds = [20240113, 20240129, 20240211, 20240303, 20240417];

type TeamSample = TeamMatchStats & { seed: number; side: 'home' | 'away'; passAccuracy: number };

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
};

const summarize = (samples: TeamSample[], field: keyof TeamSample) => {
  const values = samples.map((sample) => Number(sample[field]));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    mean: Number(mean.toFixed(3)),
    median: Number(percentile(values, 0.5).toFixed(3)),
    p10: Number(percentile(values, 0.1).toFixed(3)),
    p90: Number(percentile(values, 0.9).toFixed(3)),
    standardDeviation: Number(Math.sqrt(variance).toFixed(3))
  };
};

const inRange = (value: number, min: number, max: number) => value >= min && value <= max;

suite('simulation calibration (multi-seed full matches)', () => {
  test('keeps equal-team output inside broad local-v0.1 bands', () => {
    const samples: TeamSample[] = [];

    seeds.forEach((seed) => {
      const engine = new GameEngineAgent({ tickRate: 20, seed });
      engine.advanceTicks(120_000);
      expect(engine.isMatchComplete()).toBe(true);
      const stats = engine.getStats();
      (['home', 'away'] as const).forEach((side) => {
        const team = stats.byTeam[side];
        samples.push({
          ...team,
          seed,
          side,
          passAccuracy: team.passesAttempted ? team.passes / team.passesAttempted : 0
        });
      });
    });

    const fields: Array<keyof TeamSample> = [
      'passesAttempted', 'passAccuracy', 'shots', 'goals', 'fouls', 'yellowCards',
      'redCards', 'corners', 'offsides', 'xg', 'tacklesWon', 'interceptions'
    ];
    const report = Object.fromEntries(fields.map((field) => [field, summarize(samples, field)]));
    console.log('Multi-seed calibration report', report);

    const bands = {
      passesAttempted: [300, 750],
      passAccuracy: [0.55, 0.9],
      shots: [5, 30],
      fouls: [5, 25],
      yellowCards: [0, 5],
      redCards: [0, 2],
      corners: [0, 12],
      offsides: [0, 8],
      tacklesWon: [10, 45],
      interceptions: [3, 30]
    } as const;

    Object.entries(bands).forEach(([field, [min, max]]) => {
      const passing = samples.filter((sample) => inRange(Number(sample[field as keyof TeamSample]), min, max));
      expect(passing.length / samples.length, `${field} samples inside target band`).toBeGreaterThanOrEqual(0.8);
    });

    samples.forEach((sample) => {
      expect(sample.passes).toBeLessThanOrEqual(sample.passesAttempted);
      expect(sample.goals).toBeLessThanOrEqual(sample.shotsOnTarget);
      expect(Number.isFinite(sample.xg)).toBe(true);
    });

    const homeGoals = samples.filter((sample) => sample.side === 'home').reduce((sum, sample) => sum + sample.goals, 0);
    const awayGoals = samples.filter((sample) => sample.side === 'away').reduce((sum, sample) => sum + sample.goals, 0);
    expect(Math.abs(homeGoals - awayGoals) / Math.max(1, homeGoals + awayGoals)).toBeLessThan(0.35);
  }, 120_000);
});
