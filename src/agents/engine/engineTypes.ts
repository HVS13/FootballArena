import { SetPieceWizardSettings } from '../../data/setPieceWizard';
import { RuleDecision } from '../RulesAgent';
import { SimulationState, Vector2 } from '../../domain/simulationTypes';

export type SimPlayer = SimulationState['players'][number];

export type RoleArchetypeProfile = {
  inPossession: {
    axisShift: number;
    widthBias: number;
    roamBias: number;
    runBias: number;
    diagonalShift: number;
    channelBias: number;
    wanderBias: number;
  };
  outOfPossession: {
    axisShift: number;
    widthBias: number;
    pressBias: number;
    wanderBias: number;
  };
  decision: {
    carryBias: number;
    shootBias: number;
    passDistanceBias: number;
    riskBias: number;
  };
};

export type SetPieceAssignments = {
  aerial: SimPlayer[];
  box: SimPlayer[];
  creators: SimPlayer[];
  recovery: SimPlayer[];
  remaining: SimPlayer[];
};

export type SetPieceRoleScores = {
  aerial: number;
  box: number;
  creator: number;
  recovery: number;
};

export type AdaptationWindow = {
  passes: number;
  longPasses: number;
  crosses: number;
  entriesLeft: number;
  entriesRight: number;
  entriesCentral: number;
  shots: number;
  shotsWide: number;
  shotsCentral: number;
};

export type AdaptationState = {
  nextCheck: number;
  window: AdaptationWindow;
};

export type PossessionState = {
  teamId: string;
  playerId: string;
};

export type RestartState = {
  remaining: number;
  teamId: string;
  position: Vector2;
  type: NonNullable<RuleDecision['restartType']>;
  takerId: string | null;
};

export type SetPiecePlan = {
  attacking: SetPieceWizardSettings;
  defending: SetPieceWizardSettings;
};
