import { describe, expect, test } from 'vitest';
import { RulesAgent } from '../agents/RulesAgent';
import { getDesiredPassDistance, getPressureOnPlayer } from '../agents/engine/decisionEngine';
import { DEFAULT_PITCH, SimulationState } from '../domain/simulationTypes';
import { RoleBehavior } from '../data/roleBehavior';
import { RoleArchetypeProfile, SimPlayer } from '../agents/engine/engineTypes';

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

const baseProfile: RoleArchetypeProfile = {
  inPossession: {
    axisShift: 0,
    widthBias: 0,
    roamBias: 0,
    runBias: 0,
    diagonalShift: 0,
    channelBias: 0,
    wanderBias: 0
  },
  outOfPossession: {
    axisShift: 0,
    widthBias: 0,
    pressBias: 0,
    wanderBias: 0
  },
  decision: {
    carryBias: 0,
    shootBias: 0,
    passDistanceBias: 0,
    riskBias: 0
  }
};

const buildPlayer = (id: string, teamId: string, position = { x: 10, y: 10 }): SimPlayer => ({
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

const buildState = (players: SimPlayer[]): SimulationState => ({
  time: 0,
  teams: [
    { id: 'home', name: 'Home', primaryColor: '#ffffff', secondaryColor: '#111827' },
    { id: 'away', name: 'Away', primaryColor: '#111827', secondaryColor: '#ffffff' }
  ],
  players,
  ball: {
    position: { x: DEFAULT_PITCH.width / 2, y: DEFAULT_PITCH.height / 2 },
    velocity: { x: 0, y: 0 },
    spin: { x: 0, y: 0 },
    lastKickPower: 0,
    radius: 0.7
  },
  officials: []
});

const buildContext = (state: SimulationState) => ({
  state,
  pitch: DEFAULT_PITCH,
  rules: new RulesAgent({ pitch: DEFAULT_PITCH, homeTeamId: 'home' }),
  getAttribute: (player: SimPlayer, id: string, fallback = 50) => player.attributes?.[id] ?? fallback,
  getRoleBehavior: () => baseBehavior,
  getRoleArchetypeProfile: () => baseProfile,
  getMoraleFactor: () => 1,
  getCreativeFreedomBias: () => 0,
  getAttackDirection: (teamId: string) => (teamId === 'home' ? 1 : -1),
  getAttackAxis: (x: number, direction: number) => (direction === 1 ? x : DEFAULT_PITCH.width - x),
  getGoalPosition: (teamId: string) =>
    teamId === 'home'
      ? { x: DEFAULT_PITCH.width, y: DEFAULT_PITCH.height / 2 }
      : { x: 0, y: DEFAULT_PITCH.height / 2 },
  getLineDepth: (x: number, direction: number) =>
    (direction === 1 ? x : DEFAULT_PITCH.width - x) / DEFAULT_PITCH.width,
  isInAttackingBox: () => false,
  getTeamScore: () => 0,
  getOpponentTeamId: (teamId: string) => (teamId === 'home' ? 'away' : 'home'),
  hasPlaystyle: () => false,
  hasPlaystylePlus: () => false,
  getPlaystyleBonus: () => 0,
  getPlaystyleMultiplier: () => 1,
  hasTrait: () => false
});

describe('decisionEngine', () => {
  test('getDesiredPassDistance respects directness presets', () => {
    const passer = buildPlayer('p1', 'home');
    const state = buildState([passer]);
    const context = buildContext(state);

    expect(getDesiredPassDistance(context, passer, { passing_directness: 'Much Shorter' })).toBeCloseTo(10);
    expect(getDesiredPassDistance(context, passer, { passing_directness: 'Balanced' })).toBeCloseTo(20);
    expect(getDesiredPassDistance(context, passer, { passing_directness: 'Much More Direct' })).toBeCloseTo(32);
  });

  test('getPressureOnPlayer reflects nearest opponent distance', () => {
    const passer = buildPlayer('p1', 'home', { x: 10, y: 10 });
    const state = buildState([passer]);
    const context = buildContext(state);

    expect(getPressureOnPlayer(context, passer)).toBe(0);

    const opponent = buildPlayer('p2', 'away', { x: 13, y: 10 });
    state.players.push(opponent);

    expect(getPressureOnPlayer(context, passer)).toBeCloseTo(0.5);
  });
});
