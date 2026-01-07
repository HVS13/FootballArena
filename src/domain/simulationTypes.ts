import { PlayerAttributes } from './types';

export type Vector2 = {
  x: number;
  y: number;
};

export type TeamState = {
  id: string;
  name: string;
  color: string;
};

export type PlayerState = {
  id: string;
  name: string;
  teamId: string;
  position: Vector2;
  velocity: Vector2;
  homePosition: Vector2;
  targetPosition: Vector2;
  targetTimer: number;
  radius: number;
  attributes?: PlayerAttributes;
  playstyles?: string[];
  playstylesPlus?: string[];
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
