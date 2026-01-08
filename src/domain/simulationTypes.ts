import { PlayerAttributes } from './types';

export type Vector2 = {
  x: number;
  y: number;
};

export type PlayerInjury = {
  severity: number;
  remaining: number;
};

export type TeamState = {
  id: string;
  name: string;
  color: string;
};

export type PlayerState = {
  id: string;
  name: string;
  shirtNo?: number;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  leftFoot?: number;
  rightFoot?: number;
  nationality?: string;
  roleId?: string | null;
  dutyId?: string | null;
  teamId: string;
  position: Vector2;
  velocity: Vector2;
  homePosition: Vector2;
  targetPosition: Vector2;
  targetTimer: number;
  tacticalPosition?: Vector2;
  tacticalWander?: number;
  radius: number;
  attributes?: PlayerAttributes;
  playstyles?: string[];
  playstylesPlus?: string[];
  traits?: string[];
  morale: number;
  injury: PlayerInjury | null;
  fatigue: number;
  discipline?: {
    yellow: number;
    red: boolean;
  };
};

export type BallState = {
  position: Vector2;
  velocity: Vector2;
  radius: number;
};

export type OfficialState = {
  id: string;
  role: 'referee' | 'assistant';
  position: Vector2;
};

export type SimulationState = {
  time: number;
  teams: TeamState[];
  players: PlayerState[];
  ball: BallState;
  officials: OfficialState[];
};

export type RenderState = SimulationState;

export type PitchDimensions = {
  width: number;
  height: number;
};

export const DEFAULT_PITCH: PitchDimensions = {
  width: 105,
  height: 68
};
