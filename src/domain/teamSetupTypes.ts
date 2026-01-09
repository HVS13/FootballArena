import { Vector2 } from './simulationTypes';
import { PlayerImport } from './types';
import { SetPieceWizardSettings } from '../data/setPieceWizard';

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
  formationId: string;
  primaryColor: string;
  secondaryColor: string;
  controlType: 'human' | 'ai';
  assistTactics: boolean;
  roster: PlayerImport[];
  slots: LineupSlot[];
  bench: string[];
  instructions: Record<string, string>;
  setPieces: SetPieceWizardSettings;
};

export type TeamSetupState = {
  teams: TeamSetup[];
};
