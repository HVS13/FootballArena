import { describe, expect, test } from 'vitest';
import { GameEngineAgent } from '../agents/GameEngineAgent';
import { StatsAgent } from '../agents/StatsAgent';
import { buildSetupFromTeams } from '../pages/TeamSetupPage';

describe('GameEngineAgent headless stepping', () => {
  test('advances without requestAnimationFrame', () => {
    const engine = new GameEngineAgent({ tickRate: 20 });
    const before = engine.getSnapshot();
    const after = engine.advanceTicks(20);

    expect(before.time).toBe(0);
    expect(after.time).toBeCloseTo(1, 5);
    expect(engine.isMatchComplete()).toBe(false);
  });

  test('returns defensive snapshot copies', () => {
    const engine = new GameEngineAgent();
    const snapshot = engine.getSnapshot();
    snapshot.ball.position.x = -100;

    expect(engine.getSnapshot().ball.position.x).toBeGreaterThanOrEqual(0);
  });

  test('accepts typed playback commands', () => {
    const engine = new GameEngineAgent();
    expect(engine.submitCommand({ type: 'pause' })).toEqual({ ok: true });
    expect(engine.submitCommand({ type: 'set_speed', speed: 8 })).toEqual({ ok: true });
    expect(engine.submitCommand({ type: 'resume' })).toEqual({ ok: true });
  });

  test('produces identical state from the same seed', () => {
    const first = new GameEngineAgent({ tickRate: 20, seed: 20260714 });
    const second = new GameEngineAgent({ tickRate: 20, seed: 20260714 });

    first.advanceTicks(1200);
    second.advanceTicks(1200);

    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    expect(first.getStats()).toEqual(second.getStats());
    expect(first.getCommentary()).toEqual(second.getCommentary());
    expect(first.getEvents()).toEqual(second.getEvents());
  });

  test('playback commands do not change seeded simulation results', () => {
    const normal = new GameEngineAgent({ tickRate: 20, seed: 2026 });
    const controlled = new GameEngineAgent({ tickRate: 20, seed: 2026 });
    controlled.submitCommand({ type: 'set_speed', speed: 16 });
    controlled.submitCommand({ type: 'pause' });
    controlled.submitCommand({ type: 'resume' });

    normal.advanceTicks(2_000);
    controlled.advanceTicks(2_000);
    expect(controlled.getSnapshot()).toEqual(normal.getSnapshot());
    expect(controlled.getEvents()).toEqual(normal.getEvents());
  });

  test('reaches full time and then freezes simulation time', () => {
    const engine = new GameEngineAgent({ tickRate: 2, seed: 99 });

    engine.advanceTicks(12_000);
    expect(engine.isMatchComplete()).toBe(true);
    expect(engine.getEvents().filter((event) => event.type === 'FullTime')).toHaveLength(1);

    const fullTime = engine.getSnapshot().time;
    engine.advanceTicks(100);
    expect(engine.getSnapshot().time).toBe(fullTime);
  });

  test('replays discrete team statistics from the event log', () => {
    const engine = new GameEngineAgent({ tickRate: 2, seed: 1234 });
    engine.advanceTicks(12_000);

    const live = engine.getStats();
    const teamIds = engine.getSnapshot().teams.map((team) => team.id);
    const replayed = StatsAgent.replay(teamIds, engine.getEvents());
    const fields = [
      'passesAttempted', 'passes', 'shots', 'shotsOnTarget', 'shotsOffTarget',
      'shotsBlocked', 'goals', 'fouls', 'yellowCards', 'redCards', 'offsides',
      'corners', 'tacklesWon', 'interceptions', 'saves', 'xg', 'substitutions'
    ] as const;

    teamIds.forEach((teamId) => {
      fields.forEach((field) => {
        expect(replayed.byTeam[teamId][field]).toBeCloseTo(live.byTeam[teamId][field], 8);
      });
      expect(replayed.byTeam[teamId].possessionSeconds).toBeCloseTo(
        live.byTeam[teamId].possessionSeconds,
        0
      );
    });
  });

  test('exports reproducibility metadata and defensive result data', () => {
    const engine = new GameEngineAgent({ tickRate: 2, seed: 42 });
    engine.advanceTicks(20);

    const result = engine.exportMatchResult();
    expect(result.config.seed).toBe(42);
    expect(result.config.rulesProfile).toBe('standard_90');
    expect(result.engineVersion).toBe('0.1.0');
    expect(result.tuningVersion).toBeTruthy();
    expect(result.events.length).toBeGreaterThan(0);

    result.finalSnapshot.state.ball.position.x = -100;
    expect(engine.getSnapshot().ball.position.x).toBeGreaterThanOrEqual(0);
  });

  test('holds at half-time until commanded and does not charge a substitution window', () => {
    const setup = buildSetupFromTeams([]);
    setup.teams[1].controlType = 'ai';
    const engine = new GameEngineAgent({
      tickRate: 2,
      seed: 77,
      teamSetup: setup,
      autoContinueHalftime: false
    });
    engine.advanceTicks(6_000);
    expect(engine.getMatchStatus().phase).toBe('half_time');
    const aiHalfTimeStatus = engine.getSubstitutionStatus()[setup.teams[1].id];
    expect(aiHalfTimeStatus.used).toBeGreaterThanOrEqual(1);
    expect(aiHalfTimeStatus.windowsUsed).toBeLessThan(aiHalfTimeStatus.used);
    const halfTime = engine.getSnapshot().time;
    engine.advanceTicks(100);
    expect(engine.getSnapshot().time).toBe(halfTime);

    const home = setup.teams[0];
    const substitution = engine.submitCommand({
      type: 'substitute',
      teamId: home.id,
      offPlayerId: home.slots[0].playerId!,
      onPlayerId: home.bench[0]
    });
    expect(substitution).toEqual({ ok: true });
    expect(engine.getSubstitutionStatus()[home.id].windowsUsed).toBe(0);
    expect(engine.submitCommand({ type: 'start_second_half' })).toEqual({ ok: true });
    expect(engine.getMatchStatus().phase).toBe('second_half');
  });

  test('abandons the match when a team falls below seven eligible players', () => {
    const engine = new GameEngineAgent({ seed: 8 });
    engine.advanceTicks(1);
    const internal = engine as unknown as {
      state: { players: Array<{ id: string; teamId: string }> };
      applyDiscipline: (teamId: string, playerId: string, card: 'red') => void;
    };
    const players = internal.state.players.filter((player) => player.teamId === 'home');
    players.slice(0, 5).forEach((player) => internal.applyDiscipline('home', player.id, 'red'));

    expect(engine.isMatchComplete()).toBe(true);
    expect(engine.getEvents().filter((event) => event.type === 'MatchAbandoned')).toHaveLength(1);
    expect(engine.getEvents().filter((event) => event.type === 'FullTime')).toHaveLength(1);
  });

  test.each([
    ['human vs human', 'human', 'human'],
    ['human vs AI', 'human', 'ai'],
    ['AI vs AI', 'ai', 'ai']
  ] as const)('completes a full %s match', (_label, homeControl, awayControl) => {
    const setup = buildSetupFromTeams([]);
    setup.teams[0].controlType = homeControl;
    setup.teams[1].controlType = awayControl;
    const engine = new GameEngineAgent({ tickRate: 1, seed: 9102, teamSetup: setup });

    engine.advanceTicks(7_000);

    expect(engine.isMatchComplete()).toBe(true);
    expect(engine.getEvents().filter((event) => event.type === 'FullTime')).toHaveLength(1);
    const substitutions = engine.getEvents().filter((event) => event.type === 'SubstitutionMade');
    if (homeControl === 'human') {
      expect(substitutions.some((event) => event.teamId === setup.teams[0].id)).toBe(false);
    }
    if (awayControl === 'human') {
      expect(substitutions.some((event) => event.teamId === setup.teams[1].id)).toBe(false);
    }
  }, 30_000);
});
