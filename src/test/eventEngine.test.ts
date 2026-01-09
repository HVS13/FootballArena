import { describe, expect, test, vi } from 'vitest';
import { CommentaryAgent } from '../agents/CommentaryAgent';
import { StatsAgent } from '../agents/StatsAgent';
import {
  createAdaptationWindow,
  getEnvironmentFatigueFactor,
  getInjuryIntensity,
  getInitialMorale,
  recordLaneEntry
} from '../agents/engine/eventEngine';
import { DEFAULT_ENVIRONMENT } from '../domain/environmentTypes';
import { DEFAULT_PITCH, SimulationState, Vector2 } from '../domain/simulationTypes';
import { RoleBehavior } from '../data/roleBehavior';
import { EventContext } from '../agents/engine/eventEngine';
import { SimPlayer } from '../agents/engine/engineTypes';

const baseBehavior: RoleBehavior = {
  advance: 0,
  retreat: 0,
  press: 0,
  width: 0,
  roam: 0,
  risk: 0,
  pass: 0,
  shoot: 0,
  carry: 0,
  cross: 0,
  hold: 0
};

const buildPlayer = (id: string, teamId: string, position: Vector2): SimPlayer => ({
  id,
  name: id,
  teamId,
  position: { ...position },
  velocity: { x: 0, y: 0 },
  homePosition: { ...position },
  targetPosition: { ...position },
  targetTimer: 0,
  radius: 1.2,
  age: 24,
  heightCm: 180,
  weightKg: 75,
  leftFoot: 50,
  rightFoot: 50,
  nationality: 'Testland',
  attributes: {},
  morale: 60,
  injury: null,
  fatigue: 0
});

const buildState = (): SimulationState => ({
  time: 0,
  teams: [
    { id: 'home', name: 'Home', primaryColor: '#ffffff', secondaryColor: '#111827' },
    { id: 'away', name: 'Away', primaryColor: '#111827', secondaryColor: '#ffffff' }
  ],
  players: [buildPlayer('p1', 'home', { x: 10, y: 10 })],
  ball: {
    position: { x: DEFAULT_PITCH.width / 2, y: DEFAULT_PITCH.height / 2 },
    velocity: { x: 0, y: 0 },
    radius: 0.7
  },
  officials: []
});

const buildContext = (): EventContext => {
  const state = buildState();
  const statsAgent = new StatsAgent(state.teams.map((team) => team.id));
  const commentaryAgent = new CommentaryAgent();

  return {
    state,
    pitch: DEFAULT_PITCH,
    environment: DEFAULT_ENVIRONMENT,
    matchImportance: 1,
    statsAgent,
    commentaryAgent,
    teamSetup: null,
    adaptationState: {
      home: { nextCheck: 0, window: createAdaptationWindow() },
      away: { nextCheck: 0, window: createAdaptationWindow() }
    },
    restartState: null,
    possession: null,
    halftimeRecovered: false,
    setHalftimeRecovered: vi.fn(),
    getAttribute: (player, id, fallback = 50) => player.attributes?.[id] ?? fallback,
    getAttributeFromMap: (attributes, id, fallback = 50) => attributes?.[id] ?? fallback,
    getRoleBehavior: () => baseBehavior,
    getTeamInstructions: () => undefined,
    getOpponentTeamId: (teamId) => (teamId === 'home' ? 'away' : 'home'),
    getAttackDirection: (teamId) => (teamId === 'home' ? 1 : -1),
    getAttackAxis: (x, direction) => (direction === 1 ? x : DEFAULT_PITCH.width - x),
    isInAttackingBox: () => false
  };
};

describe('eventEngine', () => {
  test('getInitialMorale scales with core mental attributes', () => {
    const context = buildContext();
    const morale = getInitialMorale(context, {
      leadership: 80,
      determination: 80,
      consistency: 50,
      composure: 50
    });

    expect(morale).toBeGreaterThan(60);
    expect(morale).toBeLessThanOrEqual(85);
  });

  test('recordLaneEntry splits left, central, and right entries', () => {
    const context = buildContext();
    const window = createAdaptationWindow();

    recordLaneEntry(context, window, { x: 80, y: 20 });
    recordLaneEntry(context, window, { x: 80, y: 34 });
    recordLaneEntry(context, window, { x: 80, y: 50 });

    expect(window.entriesLeft).toBe(1);
    expect(window.entriesCentral).toBe(1);
    expect(window.entriesRight).toBe(1);
  });

  test('getEnvironmentFatigueFactor increases in heat and storms', () => {
    const factor = getEnvironmentFatigueFactor({
      ...DEFAULT_ENVIRONMENT,
      weather: 'storm',
      temperatureC: 30
    });

    expect(factor).toBeGreaterThan(1);
  });

  test('getInjuryIntensity rises with aggressive tackling and press', () => {
    const intensity = getInjuryIntensity({
      tackling: 'Aggressive',
      trigger_press: 'More Often',
      line_of_engagement: 'High Press',
      pressing_trap: 'Active'
    });

    expect(intensity).toBeGreaterThan(1);
  });
});
