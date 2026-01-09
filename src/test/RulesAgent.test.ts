import { describe, expect, test, vi } from 'vitest';
import { RulesAgent } from '../agents/RulesAgent';
import { DEFAULT_PITCH, SimulationState } from '../domain/simulationTypes';

const buildState = (): SimulationState => ({
  time: 0,
  teams: [
    { id: 'home', name: 'Home', primaryColor: '#ffffff', secondaryColor: '#111827' },
    { id: 'away', name: 'Away', primaryColor: '#111827', secondaryColor: '#ffffff' }
  ],
  players: [],
  ball: {
    position: { x: DEFAULT_PITCH.width / 2, y: DEFAULT_PITCH.height / 2 },
    velocity: { x: 0, y: 0 },
    radius: 0.7
  },
  officials: []
});

describe('RulesAgent', () => {
  test('detects offside positions', () => {
    const state = buildState();
    const passer = {
      id: 'p1',
      name: 'Passer',
      teamId: 'home',
      position: { x: 50, y: 34 },
      velocity: { x: 0, y: 0 },
      homePosition: { x: 50, y: 34 },
      targetPosition: { x: 50, y: 34 },
      targetTimer: 1,
      radius: 1.2,
      attributes: {},
      morale: 60,
      injury: null,
      fatigue: 0
    };
    const receiver = {
      ...passer,
      id: 'p2',
      name: 'Receiver',
      position: { x: 60, y: 34 }
    };
    const defender1 = {
      ...passer,
      id: 'd1',
      name: 'Defender',
      teamId: 'away',
      position: { x: 45, y: 34 }
    };
    const defender2 = {
      ...passer,
      id: 'd2',
      name: 'Defender Two',
      teamId: 'away',
      position: { x: 40, y: 30 }
    };
    state.players = [passer, receiver, defender1, defender2];
    state.ball.position = { x: 50, y: 34 };

    const agent = new RulesAgent({ pitch: DEFAULT_PITCH, homeTeamId: 'home' });
    expect(agent.isOffsidePosition(state, 'home', receiver)).toBe(true);
  });

  test('returns offside decisions on passes', () => {
    const state = buildState();
    const passer = {
      id: 'p1',
      name: 'Passer',
      teamId: 'home',
      position: { x: 50, y: 34 },
      velocity: { x: 0, y: 0 },
      homePosition: { x: 50, y: 34 },
      targetPosition: { x: 50, y: 34 },
      targetTimer: 1,
      radius: 1.2,
      attributes: {},
      morale: 60,
      injury: null,
      fatigue: 0
    };
    const receiver = {
      ...passer,
      id: 'p2',
      name: 'Receiver',
      position: { x: 60, y: 34 }
    };
    const defender = {
      ...passer,
      id: 'd1',
      name: 'Defender',
      teamId: 'away',
      position: { x: 45, y: 34 }
    };
    state.players = [passer, receiver, defender];
    state.ball.position = { x: 50, y: 34 };

    const agent = new RulesAgent({ pitch: DEFAULT_PITCH, homeTeamId: 'home' });
    const decision = agent.decidePass(state, 'home', passer, receiver);
    expect(decision.type).toBe('offside');
    expect(decision.restartType).toBe('free_kick');
    expect(decision.restartTeamId).toBe('away');
  });

  test('awards goals when shot chance is guaranteed', () => {
    const state = buildState();
    const shooter = {
      id: 's1',
      name: 'Shooter',
      teamId: 'home',
      position: { x: 100, y: 34 },
      velocity: { x: 0, y: 0 },
      homePosition: { x: 100, y: 34 },
      targetPosition: { x: 100, y: 34 },
      targetTimer: 1,
      radius: 1.2,
      attributes: {
        finishing: 95,
        long_shots: 90,
        technique: 95,
        composure: 95,
        penalty_taking: 90
      },
      morale: 70,
      injury: null,
      fatigue: 0
    };
    state.players = [shooter];
    state.ball.position = { ...shooter.position };

    const agent = new RulesAgent({ pitch: DEFAULT_PITCH, homeTeamId: 'home' });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const decision = agent.decideShot(state, 'home', shooter);
    randomSpy.mockRestore();

    expect(decision.type).toBe('goal');
    expect(decision.restartType).toBe('kick_off');
    expect(decision.restartTeamId).toBe('away');
  });
});
