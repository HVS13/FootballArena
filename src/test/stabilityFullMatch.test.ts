import { describe, expect, test } from 'vitest';
import { GameEngineAgent } from '../agents/GameEngineAgent';
import { DEFAULT_PITCH } from '../domain/simulationTypes';

const runFullStability = process.env.STABILITY_FULL === '1';

describe('full-match seeded stability', () => {
  test.skipIf(!runFullStability)('preserves lifecycle and state invariants across 500 seeds', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = new GameEngineAgent({ tickRate: 1, seed });
      engine.advanceTicks(7_000);

      const snapshot = engine.getSnapshot();
      const events = engine.getEvents();
      const stats = engine.getStats();

      expect(engine.isMatchComplete(), `seed ${seed} did not finish`).toBe(true);
      expect(events.filter((event) => event.type === 'MatchStarted')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'HalfTime')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'FullTime')).toHaveLength(1);
      expect(events.at(-1)?.type, `seed ${seed} emitted an event after full time`).toBe('FullTime');

      for (let index = 1; index < events.length; index += 1) {
        expect(events[index].sequence).toBe(events[index - 1].sequence + 1);
        expect(events[index].timeSeconds).toBeGreaterThanOrEqual(events[index - 1].timeSeconds);
      }

      for (const player of snapshot.players) {
        expect(Number.isFinite(player.position.x) && Number.isFinite(player.position.y)).toBe(true);
        expect(player.position.x).toBeGreaterThanOrEqual(0);
        expect(player.position.x).toBeLessThanOrEqual(DEFAULT_PITCH.width);
        expect(player.position.y).toBeGreaterThanOrEqual(0);
        expect(player.position.y).toBeLessThanOrEqual(DEFAULT_PITCH.height);
      }

      expect(Number.isFinite(snapshot.ball.position.x) && Number.isFinite(snapshot.ball.position.y)).toBe(true);
      for (const team of snapshot.teams) {
        const teamStats = stats.byTeam[team.id];
        expect(teamStats.passes).toBeLessThanOrEqual(teamStats.passesAttempted);
        expect(teamStats.goals).toBeLessThanOrEqual(teamStats.shotsOnTarget);
        expect(Number.isFinite(teamStats.xg)).toBe(true);
      }
    }
  }, 420_000);
});
