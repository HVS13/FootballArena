import { EnvironmentState } from '../../domain/environmentTypes';
import { PlayerAttributes } from '../../domain/types';
import { PitchDimensions, SimulationState, Vector2 } from '../../domain/simulationTypes';
import { CommentaryAgent } from '../CommentaryAgent';
import { StatsAgent } from '../StatsAgent';
import { RoleBehavior } from '../../data/roleBehavior';
import { TeamSetupState } from '../../domain/teamSetupTypes';
import { clamp } from './engineMath';
import { AdaptationState, AdaptationWindow, PossessionState, RestartState, SimPlayer } from './engineTypes';

export const ADAPTATION_INITIAL_DELAY = 300;
export const ADAPTATION_WINDOW_SECONDS = 240;
export const ADAPTATION_MIN_EVENTS = 12;
export const ADAPTATION_LANE_MARGIN = 0.15;

export type EventContext = {
  state: SimulationState;
  pitch: PitchDimensions;
  environment: EnvironmentState;
  matchImportance: number;
  statsAgent: StatsAgent;
  commentaryAgent: CommentaryAgent;
  teamSetup: TeamSetupState | null;
  adaptationState: Record<string, AdaptationState>;
  restartState: RestartState | null;
  possession: PossessionState | null;
  halftimeRecovered: boolean;
  setHalftimeRecovered: (value: boolean) => void;
  getAttribute: (player: SimPlayer, id: string, fallback?: number) => number;
  getAttributeFromMap: (attributes: PlayerAttributes | undefined, id: string, fallback?: number) => number;
  getRoleBehavior: (player: SimPlayer) => RoleBehavior;
  getTeamInstructions: (teamId: string) => Record<string, string> | undefined;
  getOpponentTeamId: (teamId: string) => string;
  getAttackDirection: (teamId: string) => number;
  getAttackAxis: (x: number, direction: number) => number;
  isInAttackingBox: (teamId: string, position: Vector2) => boolean;
};

export const initializePlayerState = (context: EventContext) => {
  context.state.players.forEach((player) => {
    player.morale = getInitialMorale(context, player.attributes);
    if (player.injury === undefined) {
      player.injury = null;
    }
    if (player.fatigue === undefined) {
      player.fatigue = 0;
    }
    if (!player.discipline) {
      player.discipline = { yellow: 0, red: false };
    }
  });
};

export const buildAdaptationState = (context: EventContext) => {
  const state: Record<string, AdaptationState> = {};
  context.state.teams.forEach((team) => {
    state[team.id] = {
      nextCheck: ADAPTATION_INITIAL_DELAY,
      window: createAdaptationWindow()
    };
  });
  return state;
};

export const createAdaptationWindow = (): AdaptationWindow => ({
  passes: 0,
  longPasses: 0,
  crosses: 0,
  entriesLeft: 0,
  entriesRight: 0,
  entriesCentral: 0,
  shots: 0,
  shotsWide: 0,
  shotsCentral: 0
});

export const getInitialMorale = (context: EventContext, attributes?: PlayerAttributes) => {
  const base = 60;
  const leadership = context.getAttributeFromMap(attributes, 'leadership');
  const determination = context.getAttributeFromMap(attributes, 'determination');
  const consistency = context.getAttributeFromMap(attributes, 'consistency');
  const composure = context.getAttributeFromMap(attributes, 'composure');
  let morale = base;
  morale += (leadership - 50) * 0.12;
  morale += (determination - 50) * 0.12;
  morale += (consistency - 50) * 0.06;
  morale += (composure - 50) * 0.05;
  return clamp(morale, 40, 85);
};

export const updateFatigue = (context: EventContext, dt: number) => {
  if (!context.halftimeRecovered && context.state.time >= 2700) {
    applyHalftimeRecovery(context);
    context.setHalftimeRecovered(true);
  }

  const matchProgress = Math.min(context.state.time / 5400, 1);
  const importance = context.matchImportance;
  const envFatigue = getEnvironmentFatigueFactor(context.environment);
  const baseDrain = 0.000055;
  const baseRecovery = 0.00007;
  const ballSpeed = Math.hypot(context.state.ball.velocity.x, context.state.ball.velocity.y);
  const lowIntensityPhase = Boolean(context.restartState) || (ballSpeed < 0.3 && !context.possession);
  const stats = context.statsAgent.getStats();

  context.state.players.forEach((player) => {
    const stamina = context.getAttribute(player, 'stamina');
    const naturalFitness = context.getAttribute(player, 'natural_fitness');
    const workRate = context.getAttribute(player, 'work_rate');
    const behavior = context.getRoleBehavior(player);
    const instructions = context.getTeamInstructions(player.teamId);
    const intensity = getFatigueIntensity(behavior, instructions);
    const age = player.age;
    const weightKg = player.weightKg;

    const staminaFactor = 1 + (1 - stamina / 100) * 0.9;
    const fitnessFactor = 1 + (1 - naturalFitness / 100) * 0.6;
    const workRateFactor = 1 + (workRate / 100) * 0.25;
    const timeScale = 0.6 + matchProgress * 0.7;
    const ageDrain = age >= 30 ? 1 + (age - 30) * 0.015 : age <= 22 ? 1 - (22 - age) * 0.008 : 1;
    const weightDrain = clamp(1 + (weightKg - 75) * 0.006, 0.9, 1.18);
    const bodyFactor = clamp(ageDrain, 0.85, 1.25) * weightDrain;

    let drain =
      baseDrain * intensity * staminaFactor * fitnessFactor * workRateFactor * envFatigue * importance * timeScale;
    drain *= bodyFactor;

    const teamGoals = stats.byTeam[player.teamId]?.goals ?? 0;
    const opponentId = context.getOpponentTeamId(player.teamId);
    const opponentGoals = stats.byTeam[opponentId]?.goals ?? 0;
    const timeWasting = instructions?.time_wasting;
    if (timeWasting === 'More Often' && teamGoals > opponentGoals) {
      drain *= 0.9;
    } else if (timeWasting === 'Less Often' && teamGoals < opponentGoals) {
      drain *= 1.05;
    }

    let delta = drain * dt;
    if (lowIntensityPhase) {
      const ageRecovery =
        age <= 22 ? 1 + (22 - age) * 0.01 : age >= 30 ? 1 - (age - 30) * 0.015 : 1;
      const weightRecovery = clamp(1 - (weightKg - 75) * 0.005, 0.85, 1.05);
      const recovery =
        baseRecovery *
        (1 + (naturalFitness / 100) * 0.4) *
        (1 - (player.fatigue ?? 0)) *
        clamp(ageRecovery, 0.8, 1.1) *
        weightRecovery;
      delta -= recovery * dt;
    }

    player.fatigue = clamp((player.fatigue ?? 0) + delta, 0, 1);
  });
};

export const applyHalftimeRecovery = (context: EventContext) => {
  context.state.players.forEach((player) => {
    const naturalFitness = context.getAttribute(player, 'natural_fitness');
    const recovery = 0.12 + (naturalFitness / 100) * 0.08;
    player.fatigue = clamp((player.fatigue ?? 0) - recovery, 0, 1);
    adjustPlayerMorale(context, player.id, 1);
  });
  context.commentaryAgent.addLine(context.state.time, 'Half-time. Players recover and reset.');
};

export const getFatigueIntensity = (behavior: RoleBehavior, instructions?: Record<string, string>) => {
  let intensity = 1 + behavior.press * 0.25 + behavior.advance * 0.18 + behavior.roam * 0.12;
  const tempo = instructions?.tempo;
  if (tempo === 'Higher') intensity += 0.12;
  if (tempo === 'Lower') intensity -= 0.1;
  if (instructions?.line_of_engagement === 'High Press') intensity += 0.1;
  if (instructions?.line_of_engagement === 'Low Block') intensity -= 0.08;
  if (instructions?.trigger_press === 'More Often') intensity += 0.12;
  if (instructions?.trigger_press === 'Less Often') intensity -= 0.1;
  if (instructions?.defensive_transition === 'Counter-Press') intensity += 0.1;
  if (instructions?.defensive_transition === 'Regroup') intensity -= 0.08;
  if (instructions?.attacking_transition === 'Counter-Attack') intensity += 0.06;
  if (instructions?.attacking_transition === 'Patient Build-Up') intensity -= 0.08;
  return clamp(intensity, 0.7, 1.5);
};

export const updateMorale = (context: EventContext, dt: number) => {
  const base = 60;
  const stats = context.statsAgent.getStats();
  const importance = context.matchImportance;

  context.state.players.forEach((player) => {
    let morale = player.morale ?? base;
    const teamGoals = stats.byTeam[player.teamId]?.goals ?? 0;
    const opponentId = context.getOpponentTeamId(player.teamId);
    const opponentGoals = stats.byTeam[opponentId]?.goals ?? 0;
    const scoreDiff = clamp(teamGoals - opponentGoals, -3, 3);

    morale += scoreDiff * 0.006 * importance * dt;

    const leadership = context.getAttribute(player, 'leadership');
    const determination = context.getAttribute(player, 'determination');
    const resilience = clamp((leadership + determination) / 200, 0, 1);
    const driftRate = 0.006 + resilience * 0.004;
    morale += (base - morale) * driftRate * dt;

    player.morale = clamp(morale, 20, 95);
  });
};

export const isAdaptationEnabled = (context: EventContext, teamId: string) => {
  const team = context.teamSetup?.teams.find((entry) => entry.id === teamId);
  if (!team) return false;
  return team.controlType === 'ai' || team.assistTactics;
};

export const updateOpponentAdaptation = (context: EventContext) => {
  if (!context.teamSetup) return;
  if (context.state.time < ADAPTATION_INITIAL_DELAY) return;

  context.state.teams.forEach((team) => {
    if (!isAdaptationEnabled(context, team.id)) return;
    const state = context.adaptationState[team.id];
    if (!state || context.state.time < state.nextCheck) return;

    const window = state.window;
    const totalEvents = window.passes + window.shots;
    if (totalEvents < ADAPTATION_MIN_EVENTS) {
      state.nextCheck = context.state.time + ADAPTATION_WINDOW_SECONDS;
      state.window = createAdaptationWindow();
      return;
    }

    const longRate = window.passes > 0 ? window.longPasses / window.passes : 0;
    const crossRate = window.passes > 0 ? window.crosses / window.passes : 0;
    const totalEntries = window.entriesLeft + window.entriesRight + window.entriesCentral;
    const leftRate = totalEntries > 0 ? window.entriesLeft / totalEntries : 0;
    const rightRate = totalEntries > 0 ? window.entriesRight / totalEntries : 0;
    const centralRate = totalEntries > 0 ? window.entriesCentral / totalEntries : 0;
    const shotWideRate = window.shots > 0 ? window.shotsWide / window.shots : 0;

    const updates: Record<string, string> = {};

    if (longRate > 0.45) {
      updates.defensive_line = longRate > 0.6 ? 'Deeper' : 'Standard';
      updates.line_of_engagement = longRate > 0.55 ? 'Low Block' : 'Mid Block';
      updates.defensive_transition = 'Regroup';
    } else if (longRate < 0.3) {
      updates.line_of_engagement = 'High Press';
      updates.trigger_press = 'More Often';
      updates.defensive_transition = 'Counter-Press';
    }

    if (crossRate > 0.3 || shotWideRate > 0.45) {
      updates.cross_engagement = 'Contest';
    } else if (crossRate < 0.15 && shotWideRate < 0.2) {
      updates.cross_engagement = 'Hold Position';
    } else {
      updates.cross_engagement = 'Balanced';
    }

    if (centralRate > 0.55) {
      updates.pressing_trap = 'Active';
    } else if (centralRate < 0.35) {
      updates.pressing_trap = 'Balanced';
    }

    if (leftRate > rightRate + ADAPTATION_LANE_MARGIN) {
      updates.progress_through = 'Right';
      updates.attacking_width = 'Wider';
    } else if (rightRate > leftRate + ADAPTATION_LANE_MARGIN) {
      updates.progress_through = 'Left';
      updates.attacking_width = 'Wider';
    } else if (centralRate > 0.55) {
      updates.attacking_width = 'Narrower';
      updates.progress_through = 'Balanced';
    } else {
      updates.progress_through = 'Balanced';
    }

    applyAdaptiveInstructions(context, team.id, updates);
    state.nextCheck = context.state.time + ADAPTATION_WINDOW_SECONDS;
    state.window = createAdaptationWindow();
  });
};

export const applyAdaptiveInstructions = (
  context: EventContext,
  teamId: string,
  updates: Record<string, string>
) => {
  if (!context.teamSetup) return;
  const team = context.teamSetup.teams.find((entry) => entry.id === teamId);
  if (!team) return;

  let changed = false;
  const next = { ...team.instructions };
  Object.entries(updates).forEach(([key, value]) => {
    if (!value) return;
    if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  });

  if (changed) {
    team.instructions = next;
  }
};

export const recordOpponentPassTendency = (
  context: EventContext,
  attackingTeamId: string,
  passer: SimPlayer,
  receiver: SimPlayer
) => {
  const defendingTeamId = context.getOpponentTeamId(attackingTeamId);
  if (!isAdaptationEnabled(context, defendingTeamId)) return;
  const state = context.adaptationState[defendingTeamId];
  if (!state) return;

  const dx = receiver.position.x - passer.position.x;
  const dy = receiver.position.y - passer.position.y;
  const distance = Math.hypot(dx, dy);
  const window = state.window;
  window.passes += 1;
  if (distance >= 24) window.longPasses += 1;
  if (isCrossPass(context, attackingTeamId, passer.position, receiver.position)) {
    window.crosses += 1;
  }

  if (isFinalThird(context, attackingTeamId, receiver.position)) {
    recordLaneEntry(context, window, receiver.position);
  }
};

export const recordOpponentShotTendency = (
  context: EventContext,
  attackingTeamId: string,
  shooter: SimPlayer
) => {
  const defendingTeamId = context.getOpponentTeamId(attackingTeamId);
  if (!isAdaptationEnabled(context, defendingTeamId)) return;
  const state = context.adaptationState[defendingTeamId];
  if (!state) return;

  const window = state.window;
  window.shots += 1;
  const midY = context.pitch.height / 2;
  if (Math.abs(shooter.position.y - midY) > 12) {
    window.shotsWide += 1;
  } else {
    window.shotsCentral += 1;
  }

  if (isFinalThird(context, attackingTeamId, shooter.position)) {
    recordLaneEntry(context, window, shooter.position);
  }
};

export const recordLaneEntry = (context: EventContext, window: AdaptationWindow, position: Vector2) => {
  const midY = context.pitch.height / 2;
  if (position.y < midY - 8) {
    window.entriesLeft += 1;
  } else if (position.y > midY + 8) {
    window.entriesRight += 1;
  } else {
    window.entriesCentral += 1;
  }
};

export const isFinalThird = (context: EventContext, teamId: string, position: Vector2) => {
  const direction = context.getAttackDirection(teamId);
  const axis = context.getAttackAxis(position.x, direction);
  return axis >= context.pitch.width * 0.66;
};

export const isCrossPass = (
  context: EventContext,
  attackingTeamId: string,
  passer: Vector2,
  receiver: Vector2
) => {
  const midY = context.pitch.height / 2;
  const passerWide = Math.abs(passer.y - midY) > 16;
  const receiverInBox = context.isInAttackingBox(attackingTeamId, receiver);
  const distance = Math.hypot(receiver.x - passer.x, receiver.y - passer.y);
  return passerWide && (receiverInBox || distance > 22);
};

export const updateInjuries = (context: EventContext, dt: number) => {
  const matchProgress = Math.min(context.state.time / 5400, 1);
  const importance = context.matchImportance;
  const envFatigue = getEnvironmentFatigueFactor(context.environment);
  const baseRate = 0.000004;

  context.state.players.forEach((player) => {
    if (player.injury) {
      player.injury.remaining -= dt;
      if (player.injury.remaining <= 0) {
        player.injury = null;
        adjustPlayerMorale(context, player.id, 2);
      }
      return;
    }

    const stamina = context.getAttribute(player, 'stamina');
    const naturalFitness = context.getAttribute(player, 'natural_fitness');
    const injuryProneness = context.getAttribute(player, 'injury_proneness');
    const aggression = context.getAttribute(player, 'aggression');
    const bravery = context.getAttribute(player, 'bravery');
    const instructions = context.getTeamInstructions(player.teamId);
    const age = player.age;
    const weightKg = player.weightKg;

    const fatigueLoad = clamp(player.fatigue ?? 0, 0, 1);
    const fatigue = (1 - stamina / 100) * (0.3 + matchProgress * 0.7) + fatigueLoad * 0.5;
    const fitnessPenalty = (1 - naturalFitness / 100) * 0.6;
    const intensity = getInjuryIntensity(instructions);
    const contactFactor = 1 + (aggression / 100) * 0.15;
    const ageRisk = age >= 30 ? 1 + (age - 30) * 0.035 : age <= 22 ? 1 - (22 - age) * 0.02 : 1;
    const weightRisk = 1 + Math.abs(weightKg - 75) * 0.008;
    const bodyRisk = clamp(ageRisk, 0.85, 1.5) * clamp(weightRisk, 0.9, 1.35);

    const risk =
      baseRate *
      (1 + (injuryProneness / 100) * 1.4) *
      (1 + fatigue * 2 + fitnessPenalty) *
      intensity *
      contactFactor *
      envFatigue *
      importance *
      bodyRisk;

    if (Math.random() < risk * dt) {
      const severity = clamp(
        0.18 + Math.random() * 0.45 + injuryProneness / 200 + fatigue * 0.25 - (bravery / 100) * 0.05,
        0.18,
        0.85
      );
      const duration = 20 + severity * 80 + Math.random() * 20;
      player.injury = { severity, remaining: duration };
      adjustPlayerMorale(context, player.id, -6 * importance);
      adjustTeamMorale(context, player.teamId, -2.5 * importance);
      context.commentaryAgent.addLine(context.state.time, `${player.name} picks up a knock.`);
    }
  });
};

export const adjustTeamMorale = (context: EventContext, teamId: string, delta: number) => {
  context.state.players.forEach((player) => {
    if (player.teamId !== teamId) return;
    adjustPlayerMorale(context, player.id, delta);
  });
};

export const adjustPlayerMorale = (context: EventContext, playerId: string, delta: number) => {
  const player = context.state.players.find((entry) => entry.id === playerId);
  if (!player) return;
  const determination = context.getAttribute(player, 'determination');
  const leadership = context.getAttribute(player, 'leadership');
  let adjusted = delta;
  if (delta < 0) {
    adjusted *= 1 - (determination / 100) * 0.25;
  } else if (delta > 0) {
    adjusted *= 1 + (leadership / 100) * 0.1;
  }
  player.morale = clamp((player.morale ?? 60) + adjusted, 20, 95);
};

export const getMoraleFactor = (context: EventContext, player: SimPlayer) => {
  const morale = player.morale ?? 60;
  return clamp(0.9 + (morale / 100) * 0.2, 0.85, 1.15);
};

export const getEnvironmentFatigueFactor = (environment: EnvironmentState) => {
  const { weather, temperatureC } = environment;
  const heatPenalty = temperatureC > 22 ? (temperatureC - 22) / 40 : 0;
  const coldPenalty = temperatureC < 4 ? (4 - temperatureC) / 40 : 0;
  const weatherPenalty =
    weather === 'rain' ? 0.05 : weather === 'snow' ? 0.1 : weather === 'storm' ? 0.12 : 0;
  return 1 + heatPenalty + coldPenalty + weatherPenalty;
};

export const getInjuryIntensity = (instructions?: Record<string, string>) => {
  let intensity = 1;
  if (instructions?.tackling === 'Aggressive') intensity += 0.15;
  if (instructions?.tackling === 'Ease Off') intensity -= 0.1;
  if (instructions?.trigger_press === 'More Often') intensity += 0.1;
  if (instructions?.trigger_press === 'Less Often') intensity -= 0.08;
  if (instructions?.line_of_engagement === 'High Press') intensity += 0.08;
  if (instructions?.line_of_engagement === 'Low Block') intensity -= 0.05;
  if (instructions?.pressing_trap === 'Active') intensity += 0.05;
  return clamp(intensity, 0.85, 1.3);
};
