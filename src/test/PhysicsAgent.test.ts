import { describe, expect, test } from 'vitest';
import { PhysicsAgent } from '../agents/PhysicsAgent';
import { DEFAULT_ENVIRONMENT } from '../domain/environmentTypes';
import { DEFAULT_PITCH, SimulationState } from '../domain/simulationTypes';

const buildState = (): SimulationState => ({
  time: 0,
  teams: [
    { id: 'home', name: 'Home', primaryColor: '#ffffff', secondaryColor: '#111827' },
    { id: 'away', name: 'Away', primaryColor: '#111827', secondaryColor: '#ffffff' }
  ],
  players: [
    {
      id: 'p1',
      name: 'Player One',
      teamId: 'home',
      position: { x: 10, y: 10 },
      velocity: { x: 1, y: 1 },
      homePosition: { x: 10, y: 10 },
      targetPosition: { x: 20, y: 20 },
      targetTimer: 1,
      radius: 1.2,
      attributes: { pace: 50, acceleration: 50, agility: 50, stamina: 50, adaptability: 50, injury_proneness: 50 },
      morale: 60,
      injury: null,
      fatigue: 0,
      discipline: { yellow: 0, red: false }
    }
  ],
  ball: {
    position: { x: DEFAULT_PITCH.width / 2, y: DEFAULT_PITCH.height / 2 },
    velocity: { x: 0, y: 0 },
    radius: 0.7
  },
  officials: [{ id: 'ref-1', role: 'referee', position: { x: 50, y: 34 } }]
});

describe('PhysicsAgent', () => {
  test('stops red-carded players immediately', () => {
    const state = buildState();
    state.players[0].discipline = { yellow: 1, red: true };
    state.players[0].velocity = { x: 2, y: 2 };
    state.players[0].targetPosition = { x: 30, y: 30 };
    const agent = new PhysicsAgent();

    agent.step(state, 1);

    expect(state.players[0].velocity.x).toBe(0);
    expect(state.players[0].velocity.y).toBe(0);
    expect(state.players[0].targetPosition).toEqual(state.players[0].position);
  });

  test('bounces the ball off pitch boundaries', () => {
    const state = buildState();
    state.ball.position.x = DEFAULT_PITCH.width - state.ball.radius - 0.1;
    state.ball.velocity.x = 3;
    const agent = new PhysicsAgent();

    agent.step(state, 1);

    expect(state.ball.velocity.x).toBeLessThan(0);
  });

  test('applies wind force to the ball', () => {
    const state = buildState();
    const agent = new PhysicsAgent({
      environment: {
        ...DEFAULT_ENVIRONMENT,
        wind: { x: 1, y: 0 }
      }
    });

    agent.step(state, 1);

    expect(state.ball.velocity.x).toBeGreaterThan(0);
  });
});
