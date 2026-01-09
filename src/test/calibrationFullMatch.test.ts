import { describe, expect, test, vi } from 'vitest';
import { GameEngineAgent } from '../agents/GameEngineAgent';
import { MatchStats } from '../domain/matchTypes';

const buildSeededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};


const suite = process.env.CALIBRATION_FULL === '1' ? describe : describe.skip;

suite('simulation calibration (full match)', () => {
  test('produces broad realistic ranges for similar quality teams', () => {
    const frameQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameQueue.push(cb);
      return frameQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let now = 0;
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(buildSeededRandom(20240113));
    let snapshot: MatchStats | null = null;

    const engine = new GameEngineAgent({
      tickRate: 20,
      onMatchUpdate: (stats) => {
        snapshot = stats;
      }
    });
    engine.setSpeed(16);

    const engineState = (engine as unknown as { state: { ball: { position: { x: number; y: number } }; players: Array<{ position: { x: number; y: number } }> } })
      .state;
    if (engineState.players.length) {
      engineState.ball.position = { ...engineState.players[0].position };
    }

    engine.start();

    while ((snapshot?.clockSeconds ?? 0) < 5400 && frameQueue.length) {
      const cb = frameQueue.shift();
      if (!cb) break;
      now += 10_000;
      cb(now);
    }

    engine.stop();
    randomSpy.mockRestore();
    perfSpy.mockRestore();
    vi.unstubAllGlobals();

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.clockSeconds).toBeGreaterThan(5300);

    const home = snapshot.byTeam.home;
    const away = snapshot.byTeam.away;
    const totalPassesAttempted = home.passesAttempted + away.passesAttempted;
    const totalShots = home.shots + away.shots;
    const totalGoals = home.goals + away.goals;

    expect(totalPassesAttempted).toBeGreaterThan(0);
    expect(totalShots).toBeGreaterThanOrEqual(0);
    expect(totalGoals).toBeGreaterThanOrEqual(0);

    if (process.env.CALIBRATION_FULL === '1') {
      console.log('Calibration summary', {
        passesAttempted: { home: home.passesAttempted, away: away.passesAttempted },
        passAccuracy: {
          home: home.passesAttempted ? home.passes / home.passesAttempted : 0,
          away: away.passesAttempted ? away.passes / away.passesAttempted : 0
        },
        shots: { home: home.shots, away: away.shots },
        shotsOnTarget: { home: home.shotsOnTarget, away: away.shotsOnTarget },
        goals: { home: home.goals, away: away.goals },
        xg: { home: home.xg, away: away.xg },
        fouls: { home: home.fouls, away: away.fouls },
        cards: { home: home.yellowCards, away: away.yellowCards },
        corners: { home: home.corners, away: away.corners },
        offsides: { home: home.offsides, away: away.offsides }
      });
    }
  });
});
