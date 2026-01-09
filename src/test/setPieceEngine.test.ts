import { describe, expect, test } from 'vitest';
import { DEFAULT_SET_PIECE_SETTINGS } from '../data/setPieceWizard';
import {
  assignSetPieceTargets,
  getRecoveryPositions,
  getSetPieceAssignments
} from '../agents/engine/setPieceEngine';
import { DEFAULT_PITCH } from '../domain/simulationTypes';
import { SetPieceContext } from '../agents/engine/setPieceEngine';
import { SimPlayer } from '../agents/engine/engineTypes';

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

const buildContext = (players: SimPlayer[]): SetPieceContext => ({
  pitch: DEFAULT_PITCH,
  getAttackDirection: (teamId) => (teamId === 'home' ? 1 : -1),
  getGoalPosition: (teamId) =>
    teamId === 'home'
      ? { x: DEFAULT_PITCH.width, y: DEFAULT_PITCH.height / 2 }
      : { x: 0, y: DEFAULT_PITCH.height / 2 },
  getAttribute: (player, id, fallback = 50) => player.attributes?.[id] ?? fallback,
  getPlaystyleBonus: () => 0,
  getPlaystyleMultiplier: () => 1,
  hasPlaystyle: () => false,
  hasPlaystylePlus: () => false,
  hasTrait: () => false,
  isGoalkeeperRole: (player) => player.roleId === 'goalkeeper',
  getActiveTeamPlayers: (teamId) => players.filter((player) => player.teamId === teamId)
});

describe('setPieceEngine', () => {
  test('getRecoveryPositions returns requested count within pitch bounds', () => {
    const positions = getRecoveryPositions(buildContext([]), 'home', 3);
    expect(positions).toHaveLength(3);
    positions.forEach((pos) => {
      expect(pos.x).toBeGreaterThanOrEqual(1);
      expect(pos.x).toBeLessThanOrEqual(DEFAULT_PITCH.width - 1);
      expect(pos.y).toBeGreaterThanOrEqual(1);
      expect(pos.y).toBeLessThanOrEqual(DEFAULT_PITCH.height - 1);
    });
  });

  test('assignSetPieceTargets assigns players to target positions', () => {
    const playerA = buildPlayer('a', 'home');
    const playerB = buildPlayer('b', 'home');
    const positions = new Map<string, { x: number; y: number }>();
    const targets = [
      { x: 5, y: 5 },
      { x: 6, y: 6 }
    ];

    assignSetPieceTargets([playerA, playerB], targets, positions);

    expect(positions.get('a')).toEqual({ x: 5, y: 5 });
    expect(positions.get('b')).toEqual({ x: 6, y: 6 });
  });

  test('getSetPieceAssignments produces role buckets for available players', () => {
    const players = [
      buildPlayer('a', 'home'),
      buildPlayer('b', 'home'),
      buildPlayer('c', 'home'),
      buildPlayer('d', 'home'),
      buildPlayer('e', 'home')
    ];
    const context = buildContext(players);
    const assignments = getSetPieceAssignments(context, 'home', null, DEFAULT_SET_PIECE_SETTINGS);

    expect(assignments.aerial.length + assignments.box.length + assignments.creators.length).toBeGreaterThan(0);
    expect(assignments.remaining.length).toBeGreaterThanOrEqual(0);
  });
});
