import { Vector2 } from './simulationTypes';
import { PlayerImport } from './types';

export type LineupSlot = {
  id: string;
  label: string;
  position: Vector2;
  playerId: string | null;
  roleId: string | null;
  dutyId: string | null;
};

export type TeamSetup = {
  id: string;
  name: string;
  color: string;
  roster: PlayerImport[];
  slots: LineupSlot[];
  bench: string[];
  instructions: Record<string, string>;
};

export type TeamSetupState = {
  formationId: string;
  teams: TeamSetup[];
};
