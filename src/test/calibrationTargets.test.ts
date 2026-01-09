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

describe('simulation calibration', () => {
  test('produces baseline activity levels in a short run', () => {
    const frameQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameQueue.push(cb);
      return frameQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let now = 0;
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(buildSeededRandom(123456789));
    let snapshot: MatchStats | null = null;

    const engine = new GameEngineAgent({
      tickRate: 30,
      onMatchUpdate: (stats) => {
        snapshot = stats;
      }
    });
    const engineState = (engine as unknown as { state: { ball: { position: { x: number; y: number } }; players: Array<{ position: { x: number; y: number } }> } })
      .state;
    if (engineState.players.length) {
      engineState.ball.position = { ...engineState.players[0].position };
    }

    engine.start();

    for (let i = 0; i < 600; i += 1) {
      const cb = frameQueue.shift();
      if (!cb) break;
      now += 100;
      cb(now);
    }

    engine.stop();
    randomSpy.mockRestore();
    perfSpy.mockRestore();
    vi.unstubAllGlobals();

    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    const byTeam = snapshot.byTeam;
    const totalPassesAttempted = byTeam.home.passesAttempted + byTeam.away.passesAttempted;
    const totalPasses = byTeam.home.passes + byTeam.away.passes;
    const passAccuracy = totalPassesAttempted > 0 ? totalPasses / totalPassesAttempted : 0;
    expect(snapshot.clockSeconds).toBeGreaterThan(50);
    expect(totalPassesAttempted).toBeGreaterThan(5);
    expect(passAccuracy).toBeGreaterThan(0.2);
    expect(passAccuracy).toBeLessThan(1.01);
  });
});
