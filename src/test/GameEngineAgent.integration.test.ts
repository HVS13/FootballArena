import { describe, expect, test, vi } from 'vitest';
import { GameEngineAgent } from '../agents/GameEngineAgent';
import { MatchStats } from '../domain/matchTypes';

describe('GameEngineAgent integration', () => {
  test('advances simulation and reports stats', () => {
    const frameQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameQueue.push(cb);
      return frameQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let now = 0;
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    let lastStats: MatchStats['byTeam'] | null = null;
    let clockSeconds = 0;

    const engine = new GameEngineAgent({
      onMatchUpdate: (stats) => {
        clockSeconds = stats.clockSeconds;
        lastStats = stats.byTeam;
      }
    });

    engine.start();

    for (let i = 0; i < 12; i += 1) {
      const cb = frameQueue.shift();
      if (!cb) break;
      now += 16;
      cb(now);
    }

    engine.stop();
    perfSpy.mockRestore();
    vi.unstubAllGlobals();

    expect(clockSeconds).toBeGreaterThan(0);
    expect(lastStats).not.toBeNull();
    expect(lastStats && Object.keys(lastStats)).toEqual(expect.arrayContaining(['home', 'away']));
  });
});
