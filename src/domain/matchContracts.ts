import { EnvironmentState } from './environmentTypes';
import { MatchStats } from './matchTypes';
import { RenderState, Vector2 } from './simulationTypes';
import { TeamSetupState } from './teamSetupTypes';

export type MatchPhase = 'pre_kickoff' | 'first_half' | 'half_time' | 'second_half' | 'full_time';

export type MatchConfig = {
  version: 1;
  seed: number;
  rulesProfile: 'standard_90';
  teams: TeamSetupState | null;
  environment: EnvironmentState;
};

export type MatchCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set_speed'; speed: 2 | 4 | 8 | 16 }
  | { type: 'start_second_half' }
  | { type: 'substitute'; teamId: string; offPlayerId: string; onPlayerId: string };

export type MatchEvent = {
  id: string;
  sequence: number;
  timeSeconds: number;
  type: string;
  teamId?: string;
  playerId?: string;
  position?: Vector2;
  data?: Record<string, string | number | boolean | null>;
};

export type MatchSnapshot = {
  phase: MatchPhase;
  state: RenderState;
  stats: MatchStats;
};

export type MatchResult = {
  engineVersion: string;
  tuningVersion: string;
  exportedAt: string;
  config: MatchConfig;
  finalSnapshot: MatchSnapshot;
  events: MatchEvent[];
};
