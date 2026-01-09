import { DEFAULT_PITCH, PitchDimensions, RenderState, SimulationState, TeamState, Vector2 } from '../domain/simulationTypes';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { CommentaryLine, MatchStats } from '../domain/matchTypes';
import { PlayerAttributes } from '../domain/types';
import { TeamSetupState } from '../domain/teamSetupTypes';
import { getRoleDutyBehavior, RoleBehavior } from '../data/roleBehavior';
import { getMatchImportanceWeight } from '../data/matchImportance';
import { DEFAULT_SET_PIECE_SETTINGS, SetPieceWizardSettings } from '../data/setPieceWizard';
import { clamp, cloneState, interpolateState } from './engine/engineMath';
import {
  DecisionContext,
  chooseGoalkeeperTarget,
  choosePassTarget,
  getActionCooldown,
  getAerialTargetScore,
  getDesiredPassDistance,
  getOpponentDistance,
  getPassLeadPosition,
  getPressureOnPlayer,
  getShotSkill,
  handleGoalkeeperPossession,
  shouldCarryBall,
  shouldShoot,
  buildGoalkeeperInstructions,
  getGoalkeeperCooldown
} from './engine/decisionEngine';
import {
  TacticalContext,
  getAttackAxis,
  getCreativeFreedomBias,
  getDefendingGoalX,
  getLineDepth,
  getPressBias,
  isGoalkeeperRole,
  isInAttackingBox,
  updateTacticalTargets
} from './engine/tacticalEngine';
import {
  EventContext,
  adjustPlayerMorale,
  adjustTeamMorale,
  applyAdaptiveInstructions,
  buildAdaptationState,
  createAdaptationWindow,
  getInitialMorale,
  getMoraleFactor,
  initializePlayerState,
  isAdaptationEnabled,
  isCrossPass,
  isFinalThird,
  recordLaneEntry,
  recordOpponentPassTendency,
  recordOpponentShotTendency,
  updateFatigue,
  updateInjuries,
  updateMorale,
  updateOpponentAdaptation
} from './engine/eventEngine';
import {
  SetPieceContext,
  assignCounterOutlets,
  assignPostCoverage,
  assignRecoveryPositions,
  assignSetPieceTargets,
  assignZonalMarkers,
  buildWallPositions,
  getCornerDeliverySpot,
  getCornerTargetPositions,
  getFreeKickDeliverySpot,
  getSetPieceAssignments,
  pickSetPieceTargetBySpot,
  pickThrowInTarget
} from './engine/setPieceEngine';
import {
  AdaptationState,
  AdaptationWindow,
  PossessionState,
  RestartState,
  RoleArchetypeProfile,
  SetPieceAssignments,
  SimPlayer
} from './engine/engineTypes';
import { CommentaryAgent } from './CommentaryAgent';
import { PhysicsAgent } from './PhysicsAgent';
import { RuleDecision, RulesAgent } from './RulesAgent';
import { StatsAgent } from './StatsAgent';

type EngineConfig = {
  pitch?: PitchDimensions;
  tickRate?: number;
  onRender?: (state: RenderState) => void;
  teamSetup?: TeamSetupState;
  environment?: EnvironmentState;
  onMatchUpdate?: (stats: MatchStats, commentary: CommentaryLine[], restart: RestartInfo | null) => void;
};

type LoopState = {
  running: boolean;
  paused: boolean;
  speed: number;
};

type PlayerMeta = {
  name: string;
  shirtNo?: number;
  age: number;
  heightCm: number;
  weightKg: number;
  leftFoot: number;
  rightFoot: number;
  nationality: string;
  attributes?: PlayerAttributes;
  playstyles?: string[];
  playstylesPlus?: string[];
  traits?: string[];
};

type SubstitutionTracker = {
  used: number;
  windowsUsed: number;
  lastWindowStart: number | null;
  bench: Set<string>;
  lineup: Set<string>;
  rosterMeta: Map<string, PlayerMeta>;
};

export type SubstitutionStatus = Record<
  string,
  {
    used: number;
    windowsUsed: number;
    remainingSubs: number;
    remainingWindows: number;
    maxSubs: number;
    maxWindows: number;
  }
>;

export type RestartInfo = {
  type: NonNullable<RuleDecision['restartType']>;
  teamId: string;
  teamName: string;
  remaining: number;
  position: Vector2;
};

const MAX_SUBS = 5;
const MAX_WINDOWS = 3;
const WINDOW_GRACE_SECONDS = 30;
const CONTROL_DISTANCE = 2.2;
const CONTROL_SPEED = 2.4;
const buildRoleArchetypeProfile = (): RoleArchetypeProfile => ({
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
});

const buildDefaultTeams = (): TeamState[] => [
  { id: 'home', name: 'Home', primaryColor: '#f43f5e', secondaryColor: '#f8fafc' },
  { id: 'away', name: 'Away', primaryColor: '#38bdf8', secondaryColor: '#0f172a' }
];

const formation442 = [
  { x: 0.08, y: 0.5 },
  { x: 0.22, y: 0.18 },
  { x: 0.22, y: 0.4 },
  { x: 0.22, y: 0.6 },
  { x: 0.22, y: 0.82 },
  { x: 0.45, y: 0.18 },
  { x: 0.45, y: 0.4 },
  { x: 0.45, y: 0.6 },
  { x: 0.45, y: 0.82 },
  { x: 0.7, y: 0.35 },
  { x: 0.7, y: 0.65 }
];

const buildPlayers = (teamId: string, pitch: PitchDimensions, isHome: boolean) => {
  return formation442.map((slot, index) => {
    const x = isHome ? slot.x : 1 - slot.x;
    const position = {
      x: x * pitch.width,
      y: slot.y * pitch.height
    };

    return {
      id: `${teamId}-${index + 1}`,
      name: `Player ${index + 1}`,
      teamId,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      homePosition: { ...position },
      targetPosition: { ...position },
      targetTimer: Math.random() * 3,
      radius: 1.2,
      shirtNo: index + 1,
      age: 24,
      heightCm: 180,
      weightKg: 75,
      leftFoot: 50,
      rightFoot: 50,
      nationality: 'Unknown',
      roleId: null,
      dutyId: null,
      attributes: {},
      playstyles: [],
      playstylesPlus: [],
      traits: [],
      tacticalPosition: { ...position },
      tacticalWander: 1,
      morale: 60,
      injury: null,
      fatigue: 0,
      discipline: { yellow: 0, red: false }
    };
  });
};

const buildOfficials = (pitch: PitchDimensions) => [
  {
    id: 'ref-1',
    role: 'referee' as const,
    position: { x: pitch.width / 2, y: pitch.height / 2 }
  },
  {
    id: 'assistant-1',
    role: 'assistant' as const,
    position: { x: pitch.width / 2, y: 2 }
  },
  {
    id: 'assistant-2',
    role: 'assistant' as const,
    position: { x: pitch.width / 2, y: pitch.height - 2 }
  }
];

const buildDefaultState = (pitch: PitchDimensions): SimulationState => {
  const teams = buildDefaultTeams();
  const players = [
    ...buildPlayers(teams[0].id, pitch, true),
    ...buildPlayers(teams[1].id, pitch, false)
  ];

  return {
    time: 0,
    teams,
    players,
    ball: {
      position: { x: pitch.width / 2, y: pitch.height / 2 },
      velocity: { x: 0, y: 0 },
      radius: 0.7
    },
    officials: buildOfficials(pitch)
  };
};

const buildStateFromSetup = (pitch: PitchDimensions, setup: TeamSetupState): SimulationState => {
  const teams = setup.teams.map((team) => ({
    id: team.id,
    name: team.name,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor
  }));

  const players = setup.teams.flatMap((team) => {
    return team.slots.map((slot, index) => {
      const rosterPlayer =
        team.roster.find((player) => player.id === slot.playerId) || team.roster[index] || null;
      const name = rosterPlayer?.name ?? `${team.name} Player ${index + 1}`;
      const age = rosterPlayer?.age ?? 24;
      const heightCm = rosterPlayer?.heightCm ?? 180;
      const weightKg = rosterPlayer?.weightKg ?? 75;
      const leftFoot = rosterPlayer?.leftFoot ?? 50;
      const rightFoot = rosterPlayer?.rightFoot ?? 50;
      const nationality = rosterPlayer?.nationality ?? 'Unknown';
      const position = {
        x: slot.position.x * pitch.width,
        y: slot.position.y * pitch.height
      };

      return {
        id: rosterPlayer?.id ?? `${team.id}-${slot.id}`,
        name,
        shirtNo: rosterPlayer?.shirtNo,
        age,
        heightCm,
        weightKg,
        leftFoot,
        rightFoot,
        nationality,
        roleId: slot.roleId ?? null,
        dutyId: slot.dutyId ?? null,
        teamId: team.id,
        position: { ...position },
        velocity: { x: 0, y: 0 },
        homePosition: { ...position },
        targetPosition: { ...position },
        targetTimer: Math.random() * 3,
        radius: 1.2,
        attributes: rosterPlayer?.attributes ?? {},
        playstyles: rosterPlayer?.playstyles ?? [],
        playstylesPlus: rosterPlayer?.playstylesPlus ?? [],
        traits: rosterPlayer?.traits ?? [],
        tacticalPosition: { ...position },
        tacticalWander: 1,
        morale: 60,
        injury: null,
        fatigue: 0,
        discipline: { yellow: 0, red: false }
      };
    });
  });

  return {
    time: 0,
    teams,
    players,
    ball: {
      position: { x: pitch.width / 2, y: pitch.height / 2 },
      velocity: { x: 0, y: 0 },
      radius: 0.7
    },
    officials: buildOfficials(pitch)
  };
};

const createRosterMetaMap = (setup: TeamSetupState | null, state: SimulationState) => {
  const rosterMeta: Record<string, Map<string, PlayerMeta>> = {};
  setup?.teams.forEach((team) => {
    const meta = new Map<string, PlayerMeta>();
    team.roster.forEach((player) => {
      if (player.id) {
        meta.set(player.id, {
          name: player.name,
          shirtNo: player.shirtNo,
          age: player.age ?? 24,
          heightCm: player.heightCm ?? 180,
          weightKg: player.weightKg ?? 75,
          leftFoot: player.leftFoot ?? 50,
          rightFoot: player.rightFoot ?? 50,
          nationality: player.nationality ?? 'Unknown',
          attributes: player.attributes,
          playstyles: player.playstyles ?? [],
          playstylesPlus: player.playstylesPlus ?? [],
          traits: player.traits ?? []
        });
      }
    });
    rosterMeta[team.id] = meta;
  });

  state.players.forEach((player) => {
    if (!rosterMeta[player.teamId]) {
      rosterMeta[player.teamId] = new Map<string, PlayerMeta>();
    }
    if (!rosterMeta[player.teamId].has(player.id)) {
      rosterMeta[player.teamId].set(player.id, {
        name: player.name,
        shirtNo: player.shirtNo,
        age: player.age,
        heightCm: player.heightCm,
        weightKg: player.weightKg,
        leftFoot: player.leftFoot,
        rightFoot: player.rightFoot,
        nationality: player.nationality,
        attributes: player.attributes,
        playstyles: player.playstyles ?? [],
        playstylesPlus: player.playstylesPlus ?? [],
        traits: player.traits ?? []
      });
    }
  });

  return rosterMeta;
};

const buildSubstitutionTrackers = (state: SimulationState, setup: TeamSetupState | null) => {
  const rosterMeta = createRosterMetaMap(setup, state);
  const trackers: Record<string, SubstitutionTracker> = {};
  state.teams.forEach((team) => {
    const lineup = new Set<string>();
    state.players
      .filter((player) => player.teamId === team.id)
      .forEach((player) => lineup.add(player.id));

    const bench = new Set<string>();
    if (setup) {
      const setupTeam = setup.teams.find((item) => item.id === team.id);
      setupTeam?.bench.forEach((playerId) => bench.add(playerId));
      setupTeam?.slots.forEach((slot) => {
        if (slot.playerId) lineup.add(slot.playerId);
      });
    }

    trackers[team.id] = {
      used: 0,
      windowsUsed: 0,
      lastWindowStart: null,
      bench,
      lineup,
      rosterMeta: rosterMeta[team.id] ?? new Map<string, PlayerMeta>()
    };
  });

  return trackers;
};

export class GameEngineAgent {
  private pitch: PitchDimensions;
  private tickRate: number;
  private physics: PhysicsAgent;
  private rules: RulesAgent;
  private state: SimulationState;
  private prevState: SimulationState;
  private loopState: LoopState;
  private accumulator = 0;
  private lastTime = 0;
  private onRender?: (state: RenderState) => void;
  private onMatchUpdate?: (stats: MatchStats, commentary: CommentaryLine[], restart: RestartInfo | null) => void;
  private statsAgent: StatsAgent;
  private commentaryAgent: CommentaryAgent;
  private substitutionTrackers: Record<string, SubstitutionTracker>;
  private teamSetup: TeamSetupState | null;
  private restartState: RestartState | null = null;
  private possession: PossessionState | null = null;
  private actionCooldown = 0;
  private environment: EnvironmentState;
  private matchImportance: number;
  private halftimeRecovered = false;
  private adaptationState: Record<string, AdaptationState>;

  constructor(config: EngineConfig = {}) {
    this.pitch = config.pitch ?? DEFAULT_PITCH;
    this.tickRate = config.tickRate ?? 60;
    this.environment = config.environment ?? DEFAULT_ENVIRONMENT;
    this.matchImportance = getMatchImportanceWeight(this.environment.matchImportance);
    this.physics = new PhysicsAgent({
      pitchWidth: this.pitch.width,
      pitchHeight: this.pitch.height,
      environment: this.environment
    });
    this.teamSetup = config.teamSetup ?? null;
    this.state = this.teamSetup ? buildStateFromSetup(this.pitch, this.teamSetup) : buildDefaultState(this.pitch);
    this.prevState = cloneState(this.state);
    this.rules = new RulesAgent({
      pitch: this.pitch,
      homeTeamId: this.state.teams[0]?.id ?? 'home',
      matchImportance: this.matchImportance,
      environment: this.environment
    });
    this.loopState = { running: false, paused: false, speed: 2 };
    this.onRender = config.onRender;
    this.onMatchUpdate = config.onMatchUpdate;
    this.statsAgent = new StatsAgent(this.state.teams.map((team) => team.id));
    this.commentaryAgent = new CommentaryAgent();
    this.actionCooldown = 0;
    this.substitutionTrackers = buildSubstitutionTrackers(this.state, this.teamSetup);
    this.adaptationState = this.buildAdaptationState();
    this.initializePlayerState();
  }

  private getDecisionContext(): DecisionContext {
    return {
      state: this.state,
      pitch: this.pitch,
      rules: this.rules,
      getAttribute: this.getAttribute.bind(this),
      getRoleBehavior: this.getRoleBehavior.bind(this),
      getRoleArchetypeProfile: this.getRoleArchetypeProfile.bind(this),
      getMoraleFactor: this.getMoraleFactor.bind(this),
      getCreativeFreedomBias: this.getCreativeFreedomBias.bind(this),
      getAttackDirection: this.getAttackDirection.bind(this),
      getAttackAxis: this.getAttackAxis.bind(this),
      getGoalPosition: this.getGoalPosition.bind(this),
      getLineDepth: this.getLineDepth.bind(this),
      isInAttackingBox: this.isInAttackingBox.bind(this),
      hasPlaystyle: this.hasPlaystyle.bind(this),
      hasPlaystylePlus: this.hasPlaystylePlus.bind(this),
      getPlaystyleBonus: this.getPlaystyleBonus.bind(this),
      getPlaystyleMultiplier: this.getPlaystyleMultiplier.bind(this),
      hasTrait: this.hasTrait.bind(this)
    };
  }

  private getTacticalContext(): TacticalContext {
    return {
      state: this.state,
      pitch: this.pitch,
      possession: this.possession,
      restartState: this.restartState,
      getTeamInstructions: this.getTeamInstructions.bind(this),
      getRoleBehavior: this.getRoleBehavior.bind(this),
      getRoleArchetypeProfile: this.getRoleArchetypeProfile.bind(this),
      getAttackDirection: this.getAttackDirection.bind(this),
      getAttribute: this.getAttribute.bind(this),
      hasTrait: this.hasTrait.bind(this)
    };
  }

  private getEventContext(): EventContext {
    return {
      state: this.state,
      pitch: this.pitch,
      environment: this.environment,
      matchImportance: this.matchImportance,
      statsAgent: this.statsAgent,
      commentaryAgent: this.commentaryAgent,
      teamSetup: this.teamSetup,
      adaptationState: this.adaptationState,
      restartState: this.restartState,
      possession: this.possession,
      halftimeRecovered: this.halftimeRecovered,
      setHalftimeRecovered: (value) => {
        this.halftimeRecovered = value;
      },
      getAttribute: this.getAttribute.bind(this),
      getAttributeFromMap: this.getAttributeFromMap.bind(this),
      getRoleBehavior: this.getRoleBehavior.bind(this),
      getTeamInstructions: this.getTeamInstructions.bind(this),
      getOpponentTeamId: this.getOpponentTeamId.bind(this),
      getAttackDirection: this.getAttackDirection.bind(this),
      getAttackAxis: this.getAttackAxis.bind(this),
      isInAttackingBox: this.isInAttackingBox.bind(this)
    };
  }

  private getSetPieceContext(): SetPieceContext {
    return {
      pitch: this.pitch,
      getAttackDirection: this.getAttackDirection.bind(this),
      getGoalPosition: this.getGoalPosition.bind(this),
      getAttribute: this.getAttribute.bind(this),
      getPlaystyleBonus: this.getPlaystyleBonus.bind(this),
      getPlaystyleMultiplier: this.getPlaystyleMultiplier.bind(this),
      hasPlaystyle: this.hasPlaystyle.bind(this),
      hasPlaystylePlus: this.hasPlaystylePlus.bind(this),
      hasTrait: this.hasTrait.bind(this),
      isGoalkeeperRole: this.isGoalkeeperRole.bind(this),
      getActiveTeamPlayers: this.getActiveTeamPlayers.bind(this)
    };
  }

  start(onRender?: (state: RenderState) => void) {
    if (onRender) {
      this.onRender = onRender;
    }

    if (this.loopState.running) return;
    this.loopState.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.loopState.running = false;
  }

  setPaused(paused: boolean) {
    this.loopState.paused = paused;
  }

  setSpeed(speed: number) {
    this.loopState.speed = speed;
  }

  getPitch() {
    return this.pitch;
  }

  getEnvironment() {
    return this.environment;
  }

  getSubstitutionStatus(): SubstitutionStatus {
    const status: SubstitutionStatus = {};
    Object.entries(this.substitutionTrackers).forEach(([teamId, tracker]) => {
      status[teamId] = {
        used: tracker.used,
        windowsUsed: tracker.windowsUsed,
        remainingSubs: Math.max(0, MAX_SUBS - tracker.used),
        remainingWindows: Math.max(0, MAX_WINDOWS - tracker.windowsUsed),
        maxSubs: MAX_SUBS,
        maxWindows: MAX_WINDOWS
      };
    });
    return status;
  }

  applySubstitution(teamId: string, offPlayerId: string, onPlayerId: string) {
    const tracker = this.substitutionTrackers[teamId];
    if (!tracker) {
      return { ok: false, error: 'Unknown team.' };
    }
    if (tracker.used >= MAX_SUBS) {
      return { ok: false, error: 'No substitutions remaining.' };
    }
    if (!tracker.lineup.has(offPlayerId)) {
      return { ok: false, error: 'Selected player is not on the pitch.' };
    }
    if (!tracker.bench.has(onPlayerId)) {
      return { ok: false, error: 'Selected substitute is not on the bench.' };
    }

    const requiresNewWindow = this.requiresNewWindow(tracker);
    if (requiresNewWindow && tracker.windowsUsed >= MAX_WINDOWS) {
      return { ok: false, error: 'No substitution windows remaining.' };
    }

    const playerIndex = this.state.players.findIndex((player) => player.id === offPlayerId);
    if (playerIndex < 0) {
      return { ok: false, error: 'Player not found in simulation.' };
    }

    const offPlayer = this.state.players[playerIndex];
    const onMeta = tracker.rosterMeta.get(onPlayerId);
    const onName = onMeta?.name ?? `Player ${onPlayerId}`;
    const incomingPlayer = {
      ...offPlayer,
      id: onPlayerId,
      name: onName,
      shirtNo: onMeta?.shirtNo ?? offPlayer.shirtNo,
      age: onMeta?.age ?? offPlayer.age,
      heightCm: onMeta?.heightCm ?? offPlayer.heightCm,
      weightKg: onMeta?.weightKg ?? offPlayer.weightKg,
      leftFoot: onMeta?.leftFoot ?? offPlayer.leftFoot,
      rightFoot: onMeta?.rightFoot ?? offPlayer.rightFoot,
      nationality: onMeta?.nationality ?? offPlayer.nationality,
      position: { ...offPlayer.position },
      velocity: { x: 0, y: 0 },
      homePosition: { ...offPlayer.homePosition },
      targetPosition: { ...offPlayer.homePosition },
      targetTimer: Math.random() * 3,
      tacticalPosition: { ...offPlayer.homePosition },
      tacticalWander: offPlayer.tacticalWander ?? 1,
      attributes: onMeta?.attributes ?? offPlayer.attributes,
      playstyles: onMeta?.playstyles ?? offPlayer.playstyles,
      playstylesPlus: onMeta?.playstylesPlus ?? offPlayer.playstylesPlus,
      traits: onMeta?.traits ?? offPlayer.traits,
      morale: this.getInitialMorale(onMeta?.attributes ?? offPlayer.attributes),
      injury: null,
      fatigue: 0,
      discipline: { yellow: 0, red: false }
    };

    this.state.players[playerIndex] = incomingPlayer;
    tracker.lineup.delete(offPlayerId);
    tracker.lineup.add(onPlayerId);
    tracker.bench.delete(onPlayerId);
    tracker.bench.add(offPlayerId);
    tracker.used += 1;
    if (requiresNewWindow) {
      tracker.windowsUsed += 1;
      tracker.lastWindowStart = this.state.time;
    }

    const offName = tracker.rosterMeta.get(offPlayerId)?.name ?? offPlayer.name;
    this.statsAgent.recordSubstitution(teamId);
    this.commentaryAgent.addLine(
      this.state.time,
      `Substitution for ${this.resolveTeamName(teamId)}: ${onName} replaces ${offName}.`
    );

    return { ok: true };
  }

  private loop = (now: number) => {
    if (!this.loopState.running) return;

    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (!this.loopState.paused) {
      this.accumulator += delta * this.loopState.speed;
      const dt = 1 / this.tickRate;

      while (this.accumulator >= dt) {
        this.prevState = cloneState(this.state);
        this.updateTacticalTargets();
        this.physics.step(this.state, dt);
        this.state.time += dt;
        this.statsAgent.step(this.state, dt);
        this.tickEvents(dt);
        this.accumulator -= dt;
      }
    }

    const alpha = this.accumulator * this.tickRate;
    const renderState = interpolateState(this.prevState, this.state, alpha);
    this.onRender?.(renderState);
    this.onMatchUpdate?.(this.statsAgent.getStats(), this.commentaryAgent.getLines(), this.getRestartInfo());
    requestAnimationFrame(this.loop);
  };

  private tickEvents(dt: number) {
    this.updateFatigue(dt);
    this.updateMorale(dt);
    this.updateInjuries(dt);
    this.updateOpponentAdaptation();
    if (this.restartState) {
      this.handleRestart(dt);
      return;
    }
    this.updatePossession();
    if (!this.possession) {
      this.actionCooldown = 0;
      return;
    }

    this.syncBallToPossessor();
    if (this.attemptDefensiveChallenge()) {
      return;
    }
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    if (this.actionCooldown > 0) return;

    this.handlePossessionAction();
  }

  private updateTacticalTargets() {
    updateTacticalTargets(this.getTacticalContext());
  }

  private initializePlayerState() {
    initializePlayerState(this.getEventContext());
  }

  private buildAdaptationState() {
    return buildAdaptationState(this.getEventContext());
  }

  private createAdaptationWindow(): AdaptationWindow {
    return createAdaptationWindow();
  }

  private getInitialMorale(attributes?: PlayerAttributes) {
    return getInitialMorale(this.getEventContext(), attributes);
  }

  private updateFatigue(dt: number) {
    updateFatigue(this.getEventContext(), dt);
  }

  private updateMorale(dt: number) {
    updateMorale(this.getEventContext(), dt);
  }

  private isAdaptationEnabled(teamId: string) {
    return isAdaptationEnabled(this.getEventContext(), teamId);
  }

  private updateOpponentAdaptation() {
    updateOpponentAdaptation(this.getEventContext());
  }

  private applyAdaptiveInstructions(teamId: string, updates: Record<string, string>) {
    applyAdaptiveInstructions(this.getEventContext(), teamId, updates);
  }

  private recordOpponentPassTendency(
    attackingTeamId: string,
    passer: typeof this.state.players[number],
    receiver: typeof this.state.players[number]
  ) {
    recordOpponentPassTendency(this.getEventContext(), attackingTeamId, passer, receiver);
  }

  private recordOpponentShotTendency(attackingTeamId: string, shooter: typeof this.state.players[number]) {
    recordOpponentShotTendency(this.getEventContext(), attackingTeamId, shooter);
  }

  private recordLaneEntry(window: AdaptationWindow, position: Vector2) {
    recordLaneEntry(this.getEventContext(), window, position);
  }

  private isFinalThird(teamId: string, position: Vector2) {
    return isFinalThird(this.getEventContext(), teamId, position);
  }

  private isCrossPass(attackingTeamId: string, passer: Vector2, receiver: Vector2) {
    return isCrossPass(this.getEventContext(), attackingTeamId, passer, receiver);
  }

  private updateInjuries(dt: number) {
    updateInjuries(this.getEventContext(), dt);
  }

  private adjustTeamMorale(teamId: string, delta: number) {
    adjustTeamMorale(this.getEventContext(), teamId, delta);
  }

  private adjustPlayerMorale(playerId: string, delta: number) {
    adjustPlayerMorale(this.getEventContext(), playerId, delta);
  }

  private getMoraleFactor(player: typeof this.state.players[number]) {
    return getMoraleFactor(this.getEventContext(), player);
  }

  private handleGoalkeeperPossession(
    goalkeeper: typeof this.state.players[number],
    instructions: Record<string, string> | undefined,
    pressure: number
  ) {
    return handleGoalkeeperPossession(this.getDecisionContext(), goalkeeper, instructions, pressure);
  }

  private chooseGoalkeeperTarget(
    goalkeeper: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    return chooseGoalkeeperTarget(this.getDecisionContext(), goalkeeper, instructions);
  }

  private getAerialTargetScore(player: typeof this.state.players[number], direction: number) {
    return getAerialTargetScore(this.getDecisionContext(), player, direction);
  }

  private buildGoalkeeperInstructions(instructions: Record<string, string> | undefined) {
    return buildGoalkeeperInstructions(instructions);
  }

  private getGoalkeeperCooldown(instructions: Record<string, string> | undefined) {
    return getGoalkeeperCooldown(instructions);
  }

  private updatePossession() {
    if (this.restartState) {
      this.possession = null;
      return;
    }

    const closest = this.findNearestPlayerToBall();
    if (!closest) {
      this.possession = null;
      return;
    }

    const dx = closest.position.x - this.state.ball.position.x;
    const dy = closest.position.y - this.state.ball.position.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.hypot(this.state.ball.velocity.x, this.state.ball.velocity.y);

    if (distance <= CONTROL_DISTANCE) {
      if (speed > CONTROL_SPEED && this.possession?.playerId !== closest.id) {
        return;
      }
      this.possession = { teamId: closest.teamId, playerId: closest.id };
    } else {
      this.possession = null;
    }
  }

  private syncBallToPossessor() {
    if (!this.possession) return;
    const possessor = this.state.players.find((player) => player.id === this.possession?.playerId);
    if (!possessor) {
      this.possession = null;
      return;
    }

    const velLen = Math.hypot(possessor.velocity.x, possessor.velocity.y);
    const dirX = velLen > 0.1 ? possessor.velocity.x / velLen : 1;
    const dirY = velLen > 0.1 ? possessor.velocity.y / velLen : 0;
    const offset = possessor.radius * 0.7;
    const nextX = clamp(possessor.position.x + dirX * offset, 0.5, this.pitch.width - 0.5);
    const nextY = clamp(possessor.position.y + dirY * offset, 0.5, this.pitch.height - 0.5);

    this.state.ball.position = { x: nextX, y: nextY };
    this.state.ball.velocity = { ...possessor.velocity };
  }

  private attemptDefensiveChallenge() {
    if (!this.possession) return false;
    const possessor = this.state.players.find((player) => player.id === this.possession?.playerId);
    if (!possessor) return false;

    const defender = this.findNearestOpponent(possessor.position, possessor.teamId);
    if (!defender) return false;

    const distance = Math.hypot(
      defender.position.x - possessor.position.x,
      defender.position.y - possessor.position.y
    );
    if (distance > 2.8) return false;

    const proximity = clamp(1 - distance / 2.8, 0, 1);
    const defenderBehavior = this.getRoleBehavior(defender);
    const defenderInstructions = this.getTeamInstructions(defender.teamId);
    const pressBias = getPressBias(defenderInstructions);
    const attemptChance = clamp(
      0.03 + proximity * 0.2 + defenderBehavior.press * 0.12 + pressBias * 0.08,
      0,
      0.35
    );
    if (Math.random() > attemptChance) return false;

    const outcome = this.resolveTackleOutcome(possessor, defender, proximity, defenderInstructions);
    if (outcome === 'foul') {
      const decision = this.rules.resolveFoul(this.state, defender, possessor.position);
      this.applyRuleDecision(decision);
      return true;
    }

    if (outcome === 'win') {
      this.state.ball.position = { ...defender.position };
      this.state.ball.velocity = { x: 0, y: 0 };
      this.possession = { teamId: defender.teamId, playerId: defender.id };
      this.actionCooldown = 0.35;
      this.statsAgent.recordTackle(defender.teamId);

      this.adjustPlayerMorale(defender.id, 1.2);
      this.adjustPlayerMorale(possessor.id, -1.6);
      if (Math.random() < 0.35) {
        this.commentaryAgent.addLine(
          this.state.time,
          `${defender.name} wins the ball from ${possessor.name}.`
        );
      }
      return true;
    }

    return false;
  }

  private resolveTackleOutcome(
    possessor: typeof this.state.players[number],
    defender: typeof this.state.players[number],
    proximity: number,
    instructions?: Record<string, string>
  ) {
    const tackling = this.getAttribute(defender, 'tackling');
    const aggression = this.getAttribute(defender, 'aggression');
    const bravery = this.getAttribute(defender, 'bravery');
    const strength = this.getAttribute(defender, 'strength');
    const positioning = this.getAttribute(defender, 'positioning');
    const defenderSkill = (tackling + aggression + bravery + strength + positioning) / 5;

    const dribbling = this.getAttribute(possessor, 'dribbling');
    const agility = this.getAttribute(possessor, 'agility');
    const balance = this.getAttribute(possessor, 'balance');
    const composure = this.getAttribute(possessor, 'composure');
    const carrierStrength = this.getAttribute(possessor, 'strength');
    const attackerSkill = (dribbling + agility + balance + composure + carrierStrength) / 5;

    let tackleChance = 0.08 + proximity * 0.3 + (defenderSkill - attackerSkill) / 200;
    tackleChance *= 1 - (defender.fatigue ?? 0) * 0.25;
    tackleChance *= 1 + (possessor.fatigue ?? 0) * 0.2;
    tackleChance *= this.getMoraleFactor(defender);
    tackleChance *= 1 / this.getMoraleFactor(possessor);

    tackleChance *= this.getPlaystyleMultiplier(defender, 'anticipate', 1.08, 1.12);
    tackleChance *= this.getPlaystyleMultiplier(defender, 'jockey', 1.05, 1.08);
    tackleChance *= this.getPlaystyleMultiplier(defender, 'bruiser', 1.06, 1.1);
    tackleChance *= this.getPlaystyleMultiplier(defender, 'enforcer', 1.04, 1.07);
    if (this.hasTrait(defender, 'dives_into_tackles')) tackleChance *= 1.08;
    if (this.hasTrait(defender, 'does_not_dive_into_tackles')) tackleChance *= 0.9;
    tackleChance *= this.getPlaystyleMultiplier(possessor, 'press_proven', 0.95, 0.92);
    tackleChance *= this.getPlaystyleMultiplier(possessor, 'rapid', 0.96, 0.93);
    tackleChance *= this.getPlaystyleMultiplier(possessor, 'technical', 0.96, 0.93);

    tackleChance = clamp(tackleChance, 0.04, 0.55);

    let foulChance = 0.04 + (aggression / 100) * 0.08;
    foulChance += (this.getAttribute(defender, 'dirtiness') / 100) * 0.12;
    foulChance -= (tackling / 100) * 0.04;
    if (instructions?.tackling === 'Aggressive') foulChance += 0.06;
    if (instructions?.tackling === 'Ease Off') foulChance -= 0.04;
    if (this.hasTrait(defender, 'dives_into_tackles')) foulChance *= 1.2;
    if (this.hasTrait(defender, 'does_not_dive_into_tackles')) foulChance *= 0.85;

    foulChance = clamp(foulChance, 0.02, 0.35);

    if (Math.random() < tackleChance) {
      return Math.random() < foulChance ? 'foul' : 'win';
    }
    if (Math.random() < foulChance * 0.25) {
      return 'foul';
    }
    return 'miss';
  }

  private handlePossessionAction() {
    if (!this.possession) return;
    const possessor = this.state.players.find((player) => player.id === this.possession?.playerId);
    if (!possessor) {
      this.possession = null;
      return;
    }

    const instructions = this.getTeamInstructions(this.possession.teamId);
    const pressure = this.getPressureOnPlayer(possessor);
    if (this.isGoalkeeperRole(possessor)) {
      const decision = this.handleGoalkeeperPossession(possessor, instructions, pressure);
      if (decision) {
        this.applyRuleDecision(decision);
        this.actionCooldown = this.getGoalkeeperCooldown(instructions);
        return;
      }
    }
    const passTarget = this.choosePassTarget(this.possession.teamId, possessor, instructions);
    const shouldShoot = this.shouldShoot(possessor, instructions, pressure, passTarget !== null);

    if (shouldShoot) {
      this.recordOpponentShotTendency(this.possession.teamId, possessor);
      const decision = this.rules.decideShot(this.state, this.possession.teamId, possessor, instructions);
      this.applyRuleDecision(decision);
      this.actionCooldown = this.getActionCooldown(possessor, instructions, decision.type, pressure);
      return;
    }

    if (passTarget) {
      this.recordOpponentPassTendency(this.possession.teamId, possessor, passTarget);
      const leadPosition = this.getPassLeadPosition(possessor, passTarget, instructions);
      const decision = this.rules.decidePass(
        this.state,
        this.possession.teamId,
        possessor,
        passTarget,
        instructions,
        leadPosition ? { passLeadPosition: leadPosition } : undefined
      );
      this.applyRuleDecision(decision);
      this.actionCooldown = this.getActionCooldown(possessor, instructions, decision.type, pressure);
      return;
    }

    if (this.shouldCarryBall(possessor, instructions, pressure)) {
      this.actionCooldown = this.getActionCooldown(possessor, instructions, 'carry', pressure);
      if (Math.random() < 0.08) {
        this.commentaryAgent.addLine(this.state.time, `${possessor.name} carries the ball forward.`);
      }
      return;
    }

    this.actionCooldown = this.getActionCooldown(possessor, instructions, 'carry', pressure);
  }

  private shouldCarryBall(
    player: typeof this.state.players[number],
    instructions?: Record<string, string>,
    pressure = 0
  ) {
    return shouldCarryBall(this.getDecisionContext(), player, instructions, pressure);
  }

  private getActionCooldown(
    player: typeof this.state.players[number],
    instructions: Record<string, string> | undefined,
    actionType: RuleDecision['type'] | 'carry',
    pressure = 0
  ) {
    return getActionCooldown(this.getDecisionContext(), player, instructions, actionType, pressure);
  }

  private shouldShoot(
    player: typeof this.state.players[number],
    instructions: Record<string, string> | undefined,
    pressure: number,
    hasPassOption: boolean
  ) {
    return shouldShoot(this.getDecisionContext(), player, instructions, pressure, hasPassOption);
  }

  private getShotSkill(player: typeof this.state.players[number]) {
    return getShotSkill(this.getDecisionContext(), player);
  }

  private choosePassTarget(
    teamId: string,
    passer: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    return choosePassTarget(this.getDecisionContext(), teamId, passer, instructions);
  }

  private getPassLeadPosition(
    passer: typeof this.state.players[number],
    receiver: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    return getPassLeadPosition(this.getDecisionContext(), passer, receiver, instructions);
  }

  private getDesiredPassDistance(
    passer: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    return getDesiredPassDistance(this.getDecisionContext(), passer, instructions);
  }

  private getOpponentDistance(position: Vector2, teamId: string) {
    return getOpponentDistance(this.getDecisionContext(), position, teamId);
  }

  private findNearestOpponent(position: Vector2, teamId: string) {
    return findNearestOpponent(this.getDecisionContext(), position, teamId);
  }

  private getPressureOnPlayer(player: typeof this.state.players[number]) {
    return getPressureOnPlayer(this.getDecisionContext(), player);
  }

  private getAttackDirection(teamId: string) {
    return teamId === this.state.teams[0]?.id ? 1 : -1;
  }

  private getGoalPosition(teamId: string) {
    const attackRight = teamId === this.state.teams[0]?.id;
    return {
      x: attackRight ? this.pitch.width : 0,
      y: this.pitch.height / 2
    };
  }

  private getTeamInstructions(teamId: string) {
    return this.teamSetup?.teams.find((team) => team.id === teamId)?.instructions;
  }

  private getSetPieceSettings(teamId: string): SetPieceWizardSettings {
    return (
      this.teamSetup?.teams.find((team) => team.id === teamId)?.setPieces ?? {
        ...DEFAULT_SET_PIECE_SETTINGS
      }
    );
  }

  private getOpponentTeamId(teamId: string) {
    return this.state.teams.find((team) => team.id !== teamId)?.id ?? teamId;
  }

  private getRoleBehavior(player: typeof this.state.players[number]): RoleBehavior {
    return getRoleDutyBehavior(player.roleId, player.dutyId);
  }

  private getRoleArchetypeProfile(player: typeof this.state.players[number]): RoleArchetypeProfile {
    const profile = buildRoleArchetypeProfile();
    const roleId = player.roleId ?? null;
    if (!roleId) return profile;

    switch (roleId) {
      case 'ball_playing_cb':
        profile.decision.passDistanceBias += 2;
        profile.decision.riskBias += 0.05;
        break;
      case 'overlapping_cb':
        profile.inPossession.widthBias += 0.12;
        profile.inPossession.axisShift += 1.1;
        profile.inPossession.runBias += 0.06;
        break;
      case 'advanced_cb':
        profile.inPossession.axisShift += 1.3;
        profile.inPossession.runBias += 0.05;
        profile.inPossession.roamBias += 0.06;
        break;
      case 'wide_cb':
        profile.inPossession.widthBias += 0.18;
        profile.outOfPossession.widthBias += 0.12;
        break;
      case 'no_nonsense_cb':
        profile.decision.passDistanceBias += 2.5;
        profile.decision.riskBias -= 0.05;
        profile.outOfPossession.wanderBias -= 0.05;
        break;
      case 'covering_cb':
        profile.outOfPossession.axisShift -= 0.6;
        break;
      case 'stopping_cb':
        profile.outOfPossession.pressBias += 0.08;
        profile.outOfPossession.axisShift += 0.3;
        break;
      case 'full_back':
        profile.inPossession.widthBias += 0.12;
        profile.inPossession.runBias += 0.05;
        break;
      case 'holding_full_back':
        profile.outOfPossession.axisShift -= 0.8;
        profile.outOfPossession.wanderBias -= 0.08;
        break;
      case 'inside_full_back':
      case 'inverted_full_back':
        profile.inPossession.widthBias -= 0.2;
        profile.inPossession.channelBias += 0.35;
        profile.inPossession.axisShift -= 0.4;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'pressing_full_back':
        profile.outOfPossession.pressBias += 0.12;
        profile.inPossession.runBias += 0.04;
        break;
      case 'wing_back':
        profile.inPossession.widthBias += 0.18;
        profile.inPossession.axisShift += 1.1;
        profile.inPossession.runBias += 0.08;
        break;
      case 'holding_wing_back':
        profile.outOfPossession.axisShift -= 0.8;
        profile.outOfPossession.wanderBias -= 0.08;
        break;
      case 'inside_wing_back':
      case 'inverted_wing_back':
        profile.inPossession.widthBias -= 0.22;
        profile.inPossession.channelBias += 0.4;
        profile.inPossession.axisShift -= 0.4;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'pressing_wing_back':
        profile.outOfPossession.pressBias += 0.12;
        profile.inPossession.runBias += 0.05;
        break;
      case 'playmaking_wing_back':
        profile.inPossession.roamBias += 0.08;
        profile.decision.passDistanceBias -= 1;
        profile.decision.riskBias += 0.05;
        break;
      case 'advanced_wing_back':
        profile.inPossession.widthBias += 0.22;
        profile.inPossession.axisShift += 1.6;
        profile.inPossession.runBias += 0.1;
        profile.decision.carryBias += 0.05;
        break;
      case 'defensive_midfielder':
        profile.outOfPossession.axisShift -= 0.4;
        profile.outOfPossession.wanderBias -= 0.04;
        break;
      case 'dropping_dm':
        profile.inPossession.axisShift -= 1.6;
        profile.outOfPossession.axisShift -= 1;
        profile.outOfPossession.wanderBias -= 0.05;
        break;
      case 'screening_dm':
        profile.outOfPossession.axisShift -= 0.6;
        profile.outOfPossession.pressBias += 0.05;
        break;
      case 'wide_covering_dm':
        profile.outOfPossession.widthBias += 0.12;
        break;
      case 'half_back':
        profile.inPossession.axisShift -= 2.6;
        profile.outOfPossession.axisShift -= 1.6;
        profile.outOfPossession.wanderBias -= 0.1;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'pressing_dm':
        profile.outOfPossession.pressBias += 0.12;
        profile.outOfPossession.axisShift += 0.3;
        break;
      case 'deep_lying_playmaker':
        profile.inPossession.axisShift -= 1.1;
        profile.inPossession.roamBias += 0.1;
        profile.decision.passDistanceBias -= 2;
        profile.decision.riskBias += 0.06;
        break;
      case 'central_midfielder':
        profile.inPossession.runBias += 0.04;
        break;
      case 'screening_cm':
        profile.outOfPossession.axisShift -= 0.4;
        profile.outOfPossession.pressBias += 0.04;
        break;
      case 'wide_covering_cm':
        profile.outOfPossession.widthBias += 0.12;
        break;
      case 'box_to_box_midfielder':
        profile.inPossession.runBias += 0.12;
        profile.inPossession.axisShift += 0.6;
        profile.outOfPossession.pressBias += 0.06;
        break;
      case 'box_to_box_playmaker':
        profile.inPossession.runBias += 0.1;
        profile.inPossession.roamBias += 0.08;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'channel_midfielder':
        profile.inPossession.channelBias += 0.35;
        profile.inPossession.runBias += 0.08;
        break;
      case 'midfield_playmaker':
        profile.inPossession.roamBias += 0.15;
        profile.decision.passDistanceBias -= 2;
        profile.decision.riskBias += 0.08;
        break;
      case 'pressing_cm':
        profile.outOfPossession.pressBias += 0.14;
        profile.outOfPossession.axisShift += 0.4;
        break;
      case 'wide_midfielder':
        profile.inPossession.widthBias += 0.18;
        profile.inPossession.runBias += 0.06;
        break;
      case 'tracking_wide_midfielder':
        profile.outOfPossession.pressBias += 0.08;
        profile.outOfPossession.axisShift -= 0.4;
        profile.outOfPossession.wanderBias -= 0.05;
        break;
      case 'wide_central_midfielder':
        profile.inPossession.channelBias += 0.3;
        profile.inPossession.widthBias += 0.1;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'wide_outlet_midfielder':
        profile.inPossession.axisShift += 1.2;
        profile.inPossession.widthBias += 0.18;
        profile.inPossession.runBias += 0.12;
        profile.decision.shootBias += 0.04;
        break;
      case 'attacking_midfielder':
        profile.inPossession.axisShift += 1.2;
        profile.inPossession.runBias += 0.1;
        profile.decision.shootBias += 0.06;
        break;
      case 'tracking_am':
        profile.outOfPossession.pressBias += 0.1;
        profile.outOfPossession.axisShift -= 0.4;
        break;
      case 'advanced_playmaker':
        profile.inPossession.roamBias += 0.18;
        profile.decision.passDistanceBias -= 2;
        profile.decision.riskBias += 0.1;
        break;
      case 'central_outlet_am':
        profile.inPossession.axisShift += 1.6;
        profile.inPossession.runBias += 0.08;
        profile.decision.shootBias += 0.08;
        profile.inPossession.wanderBias -= 0.05;
        break;
      case 'splitting_outlet_am':
        profile.inPossession.channelBias += 0.35;
        profile.inPossession.axisShift += 1.4;
        profile.inPossession.runBias += 0.1;
        profile.decision.shootBias += 0.06;
        break;
      case 'free_role':
        profile.inPossession.roamBias += 0.2;
        profile.inPossession.runBias += 0.08;
        profile.decision.riskBias += 0.08;
        break;
      case 'winger':
        profile.inPossession.widthBias += 0.22;
        profile.inPossession.runBias += 0.08;
        profile.decision.carryBias += 0.06;
        profile.decision.passDistanceBias += 1;
        break;
      case 'half_space_winger':
        profile.inPossession.channelBias += 0.4;
        profile.inPossession.diagonalShift += 1.6;
        profile.inPossession.runBias += 0.1;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'inside_winger':
        profile.inPossession.widthBias -= 0.15;
        profile.inPossession.channelBias += 0.25;
        profile.inPossession.diagonalShift += 2;
        profile.inPossession.runBias += 0.12;
        profile.decision.shootBias += 0.05;
        profile.decision.carryBias += 0.06;
        break;
      case 'inverting_outlet_winger':
        profile.inPossession.widthBias -= 0.2;
        profile.inPossession.axisShift += 1.2;
        profile.inPossession.runBias += 0.16;
        profile.decision.shootBias += 0.08;
        profile.decision.carryBias += 0.06;
        break;
      case 'tracking_winger':
        profile.outOfPossession.pressBias += 0.1;
        profile.outOfPossession.axisShift -= 0.5;
        profile.outOfPossession.wanderBias -= 0.05;
        break;
      case 'wide_outlet_winger':
        profile.inPossession.axisShift += 1.8;
        profile.inPossession.widthBias += 0.24;
        profile.inPossession.runBias += 0.18;
        profile.decision.shootBias += 0.08;
        profile.decision.carryBias += 0.06;
        break;
      case 'wide_playmaker':
        profile.inPossession.widthBias += 0.12;
        profile.inPossession.roamBias += 0.12;
        profile.decision.passDistanceBias -= 2;
        profile.decision.riskBias += 0.08;
        break;
      case 'wide_forward':
        profile.inPossession.axisShift += 1.6;
        profile.inPossession.widthBias += 0.15;
        profile.inPossession.runBias += 0.16;
        profile.decision.shootBias += 0.1;
        profile.decision.carryBias += 0.06;
        break;
      case 'inside_forward':
        profile.inPossession.widthBias -= 0.18;
        profile.inPossession.channelBias += 0.3;
        profile.inPossession.diagonalShift += 2.4;
        profile.inPossession.runBias += 0.18;
        profile.decision.shootBias += 0.1;
        profile.decision.carryBias += 0.08;
        break;
      case 'false_nine':
        profile.inPossession.axisShift -= 2.6;
        profile.inPossession.roamBias += 0.2;
        profile.inPossession.runBias -= 0.1;
        profile.decision.shootBias -= 0.05;
        profile.decision.passDistanceBias -= 2;
        break;
      case 'deep_lying_forward':
        profile.inPossession.axisShift -= 1.6;
        profile.inPossession.roamBias += 0.1;
        profile.inPossession.runBias -= 0.05;
        profile.decision.passDistanceBias -= 1;
        profile.decision.shootBias -= 0.02;
        break;
      case 'half_space_forward':
        profile.inPossession.channelBias += 0.4;
        profile.inPossession.diagonalShift += 1.8;
        profile.inPossession.axisShift += 1.3;
        profile.inPossession.runBias += 0.15;
        profile.decision.shootBias += 0.08;
        break;
      case 'second_striker':
        profile.inPossession.axisShift += 1.1;
        profile.inPossession.runBias += 0.12;
        profile.inPossession.roamBias += 0.1;
        profile.decision.shootBias += 0.06;
        break;
      case 'channel_forward':
        profile.inPossession.channelBias += 0.45;
        profile.inPossession.axisShift += 1.5;
        profile.inPossession.runBias += 0.18;
        profile.decision.shootBias += 0.08;
        break;
      case 'centre_forward':
        profile.inPossession.axisShift += 1.2;
        profile.inPossession.runBias += 0.12;
        profile.decision.shootBias += 0.07;
        break;
      case 'central_outlet_cf':
        profile.inPossession.axisShift += 1.8;
        profile.inPossession.runBias += 0.1;
        profile.decision.shootBias += 0.08;
        profile.inPossession.wanderBias -= 0.05;
        profile.decision.carryBias -= 0.02;
        break;
      case 'splitting_outlet_cf':
        profile.inPossession.axisShift += 1.5;
        profile.inPossession.channelBias += 0.3;
        profile.inPossession.runBias += 0.12;
        profile.decision.shootBias += 0.06;
        break;
      case 'tracking_cf':
        profile.outOfPossession.pressBias += 0.1;
        profile.outOfPossession.axisShift -= 0.4;
        break;
      case 'target_forward':
        profile.inPossession.axisShift += 0.8;
        profile.inPossession.runBias -= 0.08;
        profile.inPossession.wanderBias -= 0.1;
        profile.decision.carryBias -= 0.04;
        profile.decision.shootBias += 0.05;
        profile.decision.passDistanceBias -= 1;
        break;
      case 'poacher':
        profile.inPossession.axisShift += 2;
        profile.inPossession.runBias += 0.25;
        profile.inPossession.roamBias -= 0.1;
        profile.decision.shootBias += 0.12;
        profile.decision.passDistanceBias -= 1;
        break;
      default:
        break;
    }

    const dutyId = player.dutyId ?? null;
    if (dutyId === 'attack') {
      profile.inPossession.axisShift += 0.6;
      profile.inPossession.runBias += 0.05;
      profile.decision.shootBias += 0.03;
      profile.outOfPossession.pressBias += 0.03;
    } else if (dutyId === 'support') {
      profile.inPossession.runBias += 0.02;
      profile.decision.passDistanceBias -= 0.5;
    } else if (dutyId === 'defend') {
      profile.inPossession.axisShift -= 0.8;
      profile.inPossession.runBias -= 0.08;
      profile.outOfPossession.axisShift -= 0.6;
      profile.outOfPossession.pressBias += 0.05;
      profile.decision.shootBias -= 0.05;
      profile.decision.carryBias -= 0.04;
      profile.inPossession.wanderBias -= 0.05;
    } else if (dutyId === 'stopper') {
      profile.outOfPossession.pressBias += 0.1;
      profile.outOfPossession.axisShift += 0.3;
      profile.inPossession.runBias -= 0.02;
    } else if (dutyId === 'cover') {
      profile.outOfPossession.axisShift -= 0.7;
      profile.outOfPossession.wanderBias -= 0.04;
      profile.inPossession.runBias -= 0.04;
    } else if (dutyId === 'automatic') {
      profile.inPossession.runBias += 0.02;
      profile.outOfPossession.pressBias += 0.02;
    }

    return profile;
  }

  private getLineDepth(x: number, direction: number) {
    return getLineDepth(this.getTacticalContext(), x, direction);
  }

  private getAttackAxis(x: number, direction: number) {
    return getAttackAxis(this.getTacticalContext(), x, direction);
  }

  private getDefendingGoalX(teamId: string) {
    return getDefendingGoalX(this.getTacticalContext(), teamId);
  }

  private isGoalkeeperRole(player: typeof this.state.players[number]) {
    return isGoalkeeperRole(player);
  }

  private getCreativeFreedomBias(instructions?: Record<string, string>) {
    return getCreativeFreedomBias(instructions);
  }

  private isInAttackingBox(teamId: string, position: Vector2) {
    return isInAttackingBox(this.getTacticalContext(), teamId, position);
  }

  private getAttribute(player: typeof this.state.players[number], id: string, fallback = 50) {
    return player.attributes?.[id] ?? fallback;
  }

  private getAttributeFromMap(attributes: PlayerAttributes | undefined, id: string, fallback = 50) {
    return attributes?.[id] ?? fallback;
  }

  private hasPlaystyle(player: typeof this.state.players[number], id: string) {
    return Boolean(player.playstyles?.includes(id) || player.playstylesPlus?.includes(id));
  }

  private hasPlaystylePlus(player: typeof this.state.players[number], id: string) {
    return Boolean(player.playstylesPlus?.includes(id));
  }

  private getPlaystyleBonus(
    player: typeof this.state.players[number],
    id: string,
    standard: number,
    plus: number
  ) {
    if (player.playstylesPlus?.includes(id)) return plus;
    if (player.playstyles?.includes(id)) return standard;
    return 0;
  }

  private getPlaystyleMultiplier(
    player: typeof this.state.players[number],
    id: string,
    standard: number,
    plus: number
  ) {
    if (player.playstylesPlus?.includes(id)) return plus;
    if (player.playstyles?.includes(id)) return standard;
    return 1;
  }

  private hasTrait(player: typeof this.state.players[number], id: string) {
    return Boolean(player.traits?.includes(id));
  }

  private findNearestPlayerToBall() {
    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const player of this.state.players) {
      if (player.discipline?.red) continue;
      const dx = player.position.x - this.state.ball.position.x;
      const dy = player.position.y - this.state.ball.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = player;
      }
    }

    return closest;
  }

  private applyRuleDecision(decision: RuleDecision) {
    if (decision.type === 'pass' || decision.type === 'out' || decision.type === 'offside') {
      this.statsAgent.recordPassAttempt(decision.teamId);
    }
    if (decision.stats.pass) {
      this.statsAgent.recordPass(decision.teamId);
    }
    if (decision.stats.shot) {
      this.statsAgent.recordShot(decision.teamId);
      this.recordShotDetail(decision);
    }
    if (decision.stats.goal) {
      this.statsAgent.recordGoal(decision.teamId);
    }
    if (decision.stats.foul) {
      this.statsAgent.recordFoul(decision.teamId);
    }
    if (decision.type === 'offside') {
      this.statsAgent.recordOffside(decision.teamId);
    }
    if (decision.restartType === 'corner' && decision.restartTeamId) {
      this.statsAgent.recordCorner(decision.restartTeamId);
    }
    if (decision.turnoverReason === 'interception' && decision.turnoverTeamId) {
      this.statsAgent.recordInterception(decision.turnoverTeamId);
    }
    if (decision.shotOutcome === 'on_target' && decision.turnoverPlayerId && decision.turnoverTeamId) {
      const saver = this.state.players.find((player) => player.id === decision.turnoverPlayerId);
      if (saver && this.isGoalkeeperRole(saver)) {
        this.statsAgent.recordSave(decision.turnoverTeamId);
      }
    }
    if (decision.card) {
      this.applyDiscipline(decision.teamId, decision.playerId, decision.card);
    }

    const importance = this.matchImportance;
    if (decision.type === 'goal') {
      this.adjustTeamMorale(decision.teamId, 7 * importance);
      this.adjustTeamMorale(this.getOpponentTeamId(decision.teamId), -7 * importance);
      this.adjustPlayerMorale(decision.playerId, 4 * importance);
    } else if (decision.type === 'shot') {
      const onTarget = decision.restartType === 'corner';
      const bigChance = decision.chanceQuality === 'big';
      if (onTarget) {
        this.adjustPlayerMorale(decision.playerId, bigChance ? -1.8 : 1.2);
      } else {
        this.adjustPlayerMorale(decision.playerId, bigChance ? -3.6 : -1.5);
      }
    } else if (decision.type === 'pass') {
      const passRisk = decision.passRisk ?? 0.3;
      const delta = decision.stats.pass ? 0.3 + passRisk * 0.6 : -(0.6 + passRisk * 1.2);
      this.adjustPlayerMorale(decision.playerId, delta);
    } else if (decision.type === 'out') {
      const passRisk = decision.passRisk ?? 0.3;
      this.adjustPlayerMorale(decision.playerId, -(0.5 + passRisk * 0.8));
    } else if (decision.type === 'foul') {
      this.adjustPlayerMorale(decision.playerId, -1.8 * importance);
      this.adjustTeamMorale(decision.teamId, -0.6 * importance);
      this.adjustTeamMorale(this.getOpponentTeamId(decision.teamId), 0.3 * importance);
      if (decision.card) {
        const cardPenalty = decision.card === 'red' ? -6 : -2;
        this.adjustPlayerMorale(decision.playerId, cardPenalty);
      }
    } else if (decision.type === 'offside') {
      this.adjustPlayerMorale(decision.playerId, -0.8 * importance);
    }

    if (decision.ballPosition) {
      this.state.ball.position = { ...decision.ballPosition };
    }
    if (decision.ballVelocity) {
      this.state.ball.velocity = { ...decision.ballVelocity };
    }
    if (decision.restartPosition) {
      this.state.ball.position = { ...decision.restartPosition };
      this.state.ball.velocity = { x: 0, y: 0 };
    }
    const stats = this.statsAgent.getStats();
    const opponentId = this.getOpponentTeamId(decision.teamId);
    const scoreFor = stats.byTeam[decision.teamId]?.goals ?? 0;
    const scoreAgainst = stats.byTeam[opponentId]?.goals ?? 0;
    const scoreForBefore = decision.type === 'goal' ? Math.max(0, scoreFor - 1) : scoreFor;
    const scoreAgainstBefore = scoreAgainst;
    this.commentaryAgent.addDecision(decision, {
      timeSeconds: this.state.time,
      teamName: this.resolveTeamName(decision.teamId),
      opponentName: this.resolveTeamName(opponentId),
      scoreFor,
      scoreAgainst,
      scoreForBefore,
      scoreAgainstBefore,
      chanceQuality: decision.chanceQuality
    });

    const hasTurnover =
      !decision.restartType && decision.turnoverPlayerId && decision.turnoverTeamId;
    if (hasTurnover) {
      const turnoverPlayer = this.state.players.find((player) => player.id === decision.turnoverPlayerId);
      if (turnoverPlayer) {
        this.state.ball.position = { ...turnoverPlayer.position };
        this.state.ball.velocity = { x: 0, y: 0 };
        this.possession = { teamId: turnoverPlayer.teamId, playerId: turnoverPlayer.id };
      }
    }

    if (decision.type === 'goal') {
      this.resetAfterGoal();
    }

    if (decision.restartPosition && decision.restartType && decision.restartTeamId && !decision.advantage) {
      this.startRestart(decision);
    }

    if (
      decision.type === 'pass' ||
      decision.type === 'shot' ||
      decision.type === 'out' ||
      decision.type === 'offside' ||
      decision.type === 'foul' ||
      decision.type === 'goal'
    ) {
      if (!hasTurnover) {
        if (!decision.advantage) {
          this.possession = null;
        }
      }
      if (!decision.advantage) {
        this.actionCooldown = 0;
      } else {
        this.actionCooldown = Math.max(this.actionCooldown, 0.4);
      }
    }
  }

  private recordShotDetail(decision: RuleDecision) {
    if (!decision.shotOutcome) return;
    if (decision.shotOutcome === 'goal' || decision.shotOutcome === 'on_target') {
      this.statsAgent.recordShotOnTarget(decision.teamId);
    } else if (decision.shotOutcome === 'off_target') {
      this.statsAgent.recordShotOffTarget(decision.teamId);
    } else if (decision.shotOutcome === 'blocked') {
      this.statsAgent.recordShotBlocked(decision.teamId);
    }

    const xg = this.estimateXg(decision.playerId, decision.teamId, decision.chanceQuality);
    if (xg > 0) {
      this.statsAgent.recordXg(decision.teamId, xg);
    }
  }

  private estimateXg(playerId: string, teamId: string, chanceQuality?: 'big' | 'normal') {
    const shooter = this.state.players.find((player) => player.id === playerId);
    if (!shooter) return 0;
    const goal = this.getGoalPosition(teamId);
    const distance = Math.hypot(goal.x - shooter.position.x, goal.y - shooter.position.y);
    const base = chanceQuality === 'big' ? 0.28 : 0.08;
    const distanceFactor = clamp(1 - distance / 36, 0.15, 1);
    const boxBoost = distance <= 12 ? 0.08 : 0;
    return clamp(base + distanceFactor * 0.18 + boxBoost, 0.02, 0.65);
  }

  private resetAfterGoal() {
    this.state.ball.position = { x: this.pitch.width / 2, y: this.pitch.height / 2 };
    this.state.ball.velocity = { x: 0, y: 0 };
    this.state.players.forEach((player) => {
      player.position = { ...player.homePosition };
      player.velocity = { x: 0, y: 0 };
      player.targetPosition = { ...player.homePosition };
      player.tacticalPosition = { ...player.homePosition };
      player.tacticalWander = 1;
    });
  }

  private startRestart(decision: RuleDecision) {
    const restartPosition = decision.restartPosition;
    const restartTeamId = decision.restartTeamId;
    const restartType = decision.restartType;
    if (!restartPosition || !restartTeamId || !restartType) return;

    const taker = this.pickRestartTaker(restartTeamId, restartType, restartPosition);
    this.restartState = {
      remaining: this.getRestartDuration(restartType),
      teamId: restartTeamId,
      position: restartPosition,
      type: restartType,
      takerId: taker?.id ?? null
    };
    this.possession = null;
    this.actionCooldown = 0;

    this.state.ball.position = { ...restartPosition };
    this.state.ball.velocity = { x: 0, y: 0 };
    this.alignPlayersForRestart();
    this.commentaryAgent.addLine(
      this.state.time,
      `${this.getRestartLabel(restartType)} for ${this.resolveTeamName(restartTeamId)}.`
    );
  }

  private handleRestart(dt: number) {
    if (!this.restartState) return;
    this.restartState.remaining -= dt;
    this.alignPlayersForRestart();
    if (this.restartState.remaining > 0) return;
    const restart = this.restartState;
    this.restartState = null;
    this.executeRestart(restart);
  }

  private alignPlayersForRestart() {
    if (!this.restartState) return;
    switch (this.restartState.type) {
      case 'corner':
        this.alignCornerPositions(this.restartState);
        return;
      case 'free_kick':
        this.alignFreeKickPositions(this.restartState);
        return;
      case 'throw_in':
        this.alignThrowInPositions(this.restartState);
        return;
      case 'penalty':
        this.alignPenaltyPositions(this.restartState);
        return;
      case 'kick_off':
        this.alignKickOffPositions(this.restartState);
        return;
      default:
        this.alignDefaultRestart(this.restartState);
    }
  }

  private alignDefaultRestart(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    if (restart.takerId) {
      positions.set(restart.takerId, restart.position);
    }
    this.applyRestartPositions(positions, restart.remaining + 0.5, 0.7);
  }

  private alignKickOffPositions(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    const mid = { x: this.pitch.width / 2, y: this.pitch.height / 2 };
    if (restart.takerId) positions.set(restart.takerId, mid);
    const direction = this.getAttackDirection(restart.teamId);
    const support = this.findNearestTeammate(restart.teamId, mid, restart.takerId);
    if (support) {
      positions.set(support.id, {
        x: clamp(mid.x - direction * 2, 1, this.pitch.width - 1),
        y: clamp(mid.y + 2, 1, this.pitch.height - 1)
      });
    }
    this.applyRestartPositions(positions, restart.remaining + 0.5, 0.6);
  }

  private alignThrowInPositions(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    if (restart.takerId) positions.set(restart.takerId, restart.position);
    const inward = restart.position.y < this.pitch.height / 2 ? 6 : -6;
    const direction = this.getAttackDirection(restart.teamId);
    const shortOptions = [
      {
        x: clamp(restart.position.x + direction * 3, 1, this.pitch.width - 1),
        y: clamp(restart.position.y + inward, 1, this.pitch.height - 1)
      },
      {
        x: clamp(restart.position.x - direction * 2, 1, this.pitch.width - 1),
        y: clamp(restart.position.y + inward * 0.6, 1, this.pitch.height - 1)
      }
    ];

    const candidates = this.getActiveTeamPlayers(restart.teamId).filter(
      (player) => player.id !== restart.takerId && !this.isGoalkeeperRole(player)
    );
    shortOptions.forEach((pos) => {
      const target = this.pickClosestPlayerToPosition(candidates, pos, positions);
      if (target) {
        positions.set(target.id, pos);
      }
    });

    this.applyRestartPositions(positions, restart.remaining + 0.5, 0.65);
  }

  private getSetPieceAssignments(
    teamId: string,
    takerId: string | null,
    settings: SetPieceWizardSettings
  ): SetPieceAssignments {
    return getSetPieceAssignments(this.getSetPieceContext(), teamId, takerId, settings);
  }

  private assignSetPieceTargets(players: SimPlayer[], targets: Vector2[], positions: Map<string, Vector2>) {
    assignSetPieceTargets(players, targets, positions);
  }

  private assignRecoveryPositions(
    teamId: string,
    players: SimPlayer[],
    positions: Map<string, Vector2>
  ) {
    assignRecoveryPositions(this.getSetPieceContext(), teamId, players, positions);
  }

  private alignCornerPositions(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    if (restart.takerId) positions.set(restart.takerId, restart.position);
    const attackingTeamId = restart.teamId;
    const defendingTeamId = this.getOpponentTeamId(attackingTeamId);
    const settings = this.getSetPieceSettings(attackingTeamId);
    const defendingSettings = this.getSetPieceSettings(defendingTeamId);
    const goal = this.getGoalPosition(attackingTeamId);
    const midY = this.pitch.height / 2;
    const cornerSide = restart.position.y < midY ? -1 : 1;
    const attackCount =
      settings.numbersCommitted === 'stay_high' ? 6 : settings.numbersCommitted === 'defend_transition' ? 3 : 5;
    const attackTargets = this.getCornerTargetPositions(goal.x, midY, cornerSide, settings, attackCount);
    const assignments = this.getSetPieceAssignments(attackingTeamId, restart.takerId, settings);
    const edgeCount = Math.min(2, Math.max(0, attackTargets.length - 3));
    const primaryTargets = attackTargets.slice(0, attackTargets.length - edgeCount);
    const edgeTargets = attackTargets.slice(-edgeCount);

    this.assignSetPieceTargets(assignments.aerial, primaryTargets, positions);
    this.assignSetPieceTargets(assignments.box, primaryTargets, positions);
    this.assignSetPieceTargets(assignments.remaining, primaryTargets, positions);
    this.assignSetPieceTargets(assignments.creators, edgeTargets, positions);
    this.assignSetPieceTargets(assignments.remaining, edgeTargets, positions);
    this.assignRecoveryPositions(attackingTeamId, assignments.recovery, positions);

    const defenders = this.getActiveTeamPlayers(defendingTeamId).filter(
      (player) => !this.isGoalkeeperRole(player)
    );
    this.assignPostCoverage(defenders, positions, goal.x, midY, cornerSide, defendingSettings);
    this.assignZonalMarkers(defenders, positions, goal.x, midY, cornerSide, defendingSettings);

    if (defendingSettings.markingSystem !== 'zonal') {
      attackTargets.forEach((pos) => {
        const marker = this.pickClosestPlayerToPosition(defenders, pos, positions);
        if (marker) {
          const offset = goal.x === 0 ? -1.2 : 1.2;
          positions.set(marker.id, {
            x: clamp(pos.x + offset, 1, this.pitch.width - 1),
            y: clamp(pos.y, 1, this.pitch.height - 1)
          });
        }
      });
    }

    const outletCount =
      defendingSettings.defensivePosture === 'counter_attack'
        ? 2
        : defendingSettings.defensivePosture === 'balanced'
          ? 1
          : 0;
    if (outletCount > 0) {
      this.assignCounterOutlets(defendingTeamId, defenders, positions, outletCount);
    }

    this.applyRestartPositions(positions, restart.remaining + 0.6, 0.6);
  }

  private alignFreeKickPositions(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    if (restart.takerId) positions.set(restart.takerId, restart.position);
    const attackingTeamId = restart.teamId;
    const defendingTeamId = this.getOpponentTeamId(attackingTeamId);
    const goal = this.getGoalPosition(attackingTeamId);
    const distance = Math.hypot(goal.x - restart.position.x, goal.y - restart.position.y);
    const wideAngle = Math.abs(restart.position.y - this.pitch.height / 2) > 18;
    const isCross = distance > 25 || wideAngle;

    if (isCross) {
      this.alignCornerPositions(restart);
      return;
    }

    const wallCount = 3;
    const wall = this.buildWallPositions(restart.position, goal, wallCount);
    const defenders = this.getActiveTeamPlayers(defendingTeamId).filter(
      (player) => !this.isGoalkeeperRole(player)
    );
    wall.forEach((pos) => {
      const marker = this.pickClosestPlayerToPosition(defenders, pos, positions);
      if (marker) {
        positions.set(marker.id, pos);
      }
    });

    this.applyRestartPositions(positions, restart.remaining + 0.6, 0.65);
  }

  private alignPenaltyPositions(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    if (restart.takerId) positions.set(restart.takerId, restart.position);
    const defendingTeamId = this.getOpponentTeamId(restart.teamId);
    const goalkeeper = this.getGoalkeeperForTeam(defendingTeamId);
    const goalX = this.getDefendingGoalX(defendingTeamId);
    if (goalkeeper) {
      positions.set(goalkeeper.id, { x: goalX, y: this.pitch.height / 2 });
    }
    this.applyRestartPositions(positions, restart.remaining + 0.6, 0.5);
  }

  private applyRestartPositions(positions: Map<string, Vector2>, holdTimer: number, wander = 0.7) {
    this.state.players.forEach((player) => {
      const target = positions.get(player.id) ?? player.homePosition;
      player.targetPosition = { ...target };
      player.tacticalPosition = { ...target };
      player.targetTimer = Math.max(player.targetTimer, holdTimer);
      player.tacticalWander = wander;
    });
  }

  private executeRestart(restart: RestartState) {
    switch (restart.type) {
      case 'goal_kick':
        this.executeGoalKick(restart);
        return;
      case 'corner':
        this.executeCorner(restart);
        return;
      case 'free_kick':
        this.executeFreeKick(restart);
        return;
      case 'throw_in':
        this.executeThrowIn(restart);
        return;
      case 'penalty':
        this.executePenalty(restart);
        return;
      case 'kick_off':
        this.executeKickOff(restart);
        return;
      default:
        this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
    }
  }

  private executeCorner(restart: RestartState) {
    const taker = this.state.players.find((player) => player.id === restart.takerId);
    if (!taker) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const instructions = this.getTeamInstructions(restart.teamId);
    const settings = this.getSetPieceSettings(restart.teamId);
    const deliverySpot = this.getCornerDeliverySpot(restart.position, restart.teamId, settings);
    const target = this.pickSetPieceTargetBySpot(restart.teamId, deliverySpot, new Set([taker.id]));
    this.possession = { teamId: restart.teamId, playerId: taker.id };

    if (!target) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const decision = this.rules.decidePass(
      this.state,
      restart.teamId,
      taker,
      target,
      instructions,
      { ignoreOffside: true, forceAerial: true, setPiece: 'corner', passLeadPosition: deliverySpot }
    );
    decision.commentary = `${taker.name} swings in the corner.`;
    this.applyRuleDecision(decision);
  }

  private executeFreeKick(restart: RestartState) {
    const taker = this.state.players.find((player) => player.id === restart.takerId);
    if (!taker) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const instructions = this.getTeamInstructions(restart.teamId);
    const settings = this.getSetPieceSettings(restart.teamId);
    const goal = this.getGoalPosition(restart.teamId);
    const distance = Math.hypot(goal.x - restart.position.x, goal.y - restart.position.y);
    const wideAngle = Math.abs(restart.position.y - this.pitch.height / 2) > 18;
    const setPieceSkill = this.getAttribute(taker, 'free_kick_taking');
    const directChance = distance < 30
      ? 0.15 + (setPieceSkill / 100) * 0.45
      : 0.05 + (setPieceSkill / 100) * 0.1;
    let shotChance = directChance;
    shotChance *= this.getPlaystyleMultiplier(taker, 'dead_ball', 1.12, 1.18);
    if (this.hasTrait(taker, 'hits_free_kicks_with_power')) shotChance *= 1.08;
    if (this.hasTrait(taker, 'tries_long_range_free_kicks') && distance > 30) shotChance *= 1.25;
    const shouldShoot = !wideAngle && Math.random() < clamp(shotChance, 0.05, 0.85);

    this.possession = { teamId: restart.teamId, playerId: taker.id };

    if (shouldShoot) {
      const decision = this.rules.decideShot(
        this.state,
        restart.teamId,
        taker,
        instructions,
        { setPiece: 'free_kick' }
      );
      decision.commentary = `${taker.name} strikes the free kick.`;
      this.applyRuleDecision(decision);
      return;
    }

    const deliverySpot = this.getFreeKickDeliverySpot(restart.position, restart.teamId, settings);
    const target = this.pickSetPieceTargetBySpot(restart.teamId, deliverySpot, new Set([taker.id]));
    if (!target) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const decision = this.rules.decidePass(
      this.state,
      restart.teamId,
      taker,
      target,
      instructions,
      { ignoreOffside: true, forceAerial: true, setPiece: 'free_kick', passLeadPosition: deliverySpot }
    );
    decision.commentary = `${taker.name} delivers the free kick.`;
    this.applyRuleDecision(decision);
  }

  private executeThrowIn(restart: RestartState) {
    const taker = this.state.players.find((player) => player.id === restart.takerId);
    if (!taker) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const instructions = this.getTeamInstructions(restart.teamId);
    const settings = this.getSetPieceSettings(restart.teamId);
    const target = this.pickThrowInTarget(restart.teamId, taker, settings);
    this.possession = { teamId: restart.teamId, playerId: taker.id };

    if (!target) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const decision = this.rules.decidePass(
      this.state,
      restart.teamId,
      taker,
      target,
      instructions,
      { ignoreOffside: true, setPiece: 'throw_in' }
    );
    decision.commentary = `${taker.name} takes the throw-in.`;
    this.applyRuleDecision(decision);
  }

  private executePenalty(restart: RestartState) {
    const taker = this.state.players.find((player) => player.id === restart.takerId);
    if (!taker) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const instructions = this.getTeamInstructions(restart.teamId);
    this.possession = { teamId: restart.teamId, playerId: taker.id };
    const decision = this.rules.decideShot(
      this.state,
      restart.teamId,
      taker,
      instructions,
      { setPiece: 'penalty' }
    );
    decision.commentary = `${taker.name} steps up for the penalty.`;
    this.applyRuleDecision(decision);
  }

  private executeKickOff(restart: RestartState) {
    const taker = this.state.players.find((player) => player.id === restart.takerId);
    if (!taker) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const instructions = this.getTeamInstructions(restart.teamId);
    const target = this.findNearestTeammate(restart.teamId, restart.position, taker.id);
    this.possession = { teamId: restart.teamId, playerId: taker.id };

    if (!target) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const decision = this.rules.decidePass(
      this.state,
      restart.teamId,
      taker,
      target,
      instructions,
      { ignoreOffside: true, setPiece: 'kick_off' }
    );
    decision.commentary = `${taker.name} gets the match restarted.`;
    this.applyRuleDecision(decision);
  }

  private executeGoalKick(restart: RestartState) {
    const taker = this.state.players.find((player) => player.id === restart.takerId);
    if (!taker) {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
      return;
    }

    const instructions = this.getTeamInstructions(restart.teamId);
    this.possession = { teamId: restart.teamId, playerId: taker.id };
    const decision = this.handleGoalkeeperPossession(taker, instructions, 0);
    if (decision) {
      decision.commentary = `${taker.name} takes the goal kick.`;
      this.applyRuleDecision(decision);
    } else {
      this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
    }
  }

  private getRestartDuration(restartType: NonNullable<RuleDecision['restartType']>) {
    const jitter = Math.random() * 0.8;
    switch (restartType) {
      case 'penalty':
        return 6 + jitter;
      case 'corner':
      case 'free_kick':
        return 4.5 + jitter;
      case 'goal_kick':
        return 4 + jitter;
      case 'throw_in':
        return 3 + jitter;
      case 'kick_off':
        return 3 + jitter;
      default:
        return 3 + jitter;
    }
  }

  private getRestartLabel(restartType: NonNullable<RuleDecision['restartType']>) {
    switch (restartType) {
      case 'throw_in':
        return 'Throw-in';
      case 'corner':
        return 'Corner';
      case 'goal_kick':
        return 'Goal kick';
      case 'free_kick':
        return 'Free kick';
      case 'penalty':
        return 'Penalty';
      case 'kick_off':
        return 'Kick-off';
      default:
        return 'Restart';
    }
  }

  private getRestartInfo(): RestartInfo | null {
    if (!this.restartState) return null;
    return {
      type: this.restartState.type,
      teamId: this.restartState.teamId,
      teamName: this.resolveTeamName(this.restartState.teamId),
      remaining: Math.max(0, this.restartState.remaining),
      position: { ...this.restartState.position }
    };
  }

  private findNearestPlayer(teamId: string, position: Vector2) {
    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.state.players) {
      if (player.teamId !== teamId || player.discipline?.red) continue;
      const dx = player.position.x - position.x;
      const dy = player.position.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = player;
      }
    }
    return closest;
  }

  private findNearestTeammate(teamId: string, position: Vector2, excludeId?: string | null) {
    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.state.players) {
      if (player.teamId !== teamId || player.id === excludeId || player.discipline?.red) continue;
      const dx = player.position.x - position.x;
      const dy = player.position.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = player;
      }
    }
    return closest;
  }

  private getActiveTeamPlayers(teamId: string) {
    return this.state.players.filter((player) => player.teamId === teamId && !player.discipline?.red);
  }

  private pickRestartTaker(
    teamId: string,
    restartType: NonNullable<RuleDecision['restartType']>,
    position: Vector2
  ) {
    if (restartType === 'goal_kick') {
      return this.getGoalkeeperForTeam(teamId) ?? this.findNearestPlayer(teamId, position);
    }
    if (restartType === 'penalty') {
      return this.pickBestSetPieceTaker(teamId, 'penalty_taking') ?? this.findNearestPlayer(teamId, position);
    }
    if (restartType === 'corner') {
      return this.pickBestSetPieceTaker(teamId, 'corners') ?? this.findNearestPlayer(teamId, position);
    }
    if (restartType === 'free_kick') {
      return this.pickBestSetPieceTaker(teamId, 'free_kick_taking') ?? this.findNearestPlayer(teamId, position);
    }
    if (restartType === 'throw_in') {
      return this.pickBestSetPieceTaker(teamId, 'long_throws') ?? this.findNearestPlayer(teamId, position);
    }
    return this.findNearestPlayer(teamId, position);
  }

  private pickBestSetPieceTaker(teamId: string, attributeId: string) {
    const candidates = this.getActiveTeamPlayers(teamId).filter((player) => !this.isGoalkeeperRole(player));
    if (!candidates.length) return null;
    return candidates.reduce((best, player) => {
      let score = this.getAttribute(player, attributeId);
      score += this.getPlaystyleBonus(player, 'dead_ball', 6, 10);
      if (!best || score > best.score) {
        return { player, score };
      }
      return best;
    }, null as null | { player: typeof this.state.players[number]; score: number })?.player ?? null;
  }

  private pickClosestPlayerToPosition(
    candidates: Array<typeof this.state.players[number]>,
    position: Vector2,
    reserved: Map<string, Vector2>
  ) {
    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of candidates) {
      if (reserved.has(player.id)) continue;
      const dx = player.position.x - position.x;
      const dy = player.position.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = player;
      }
    }
    return closest;
  }

  private getGoalkeeperForTeam(teamId: string) {
    const candidates = this.getActiveTeamPlayers(teamId);
    const explicit = candidates.find((player) => this.isGoalkeeperRole(player));
    if (explicit) return explicit;
    const goalX = this.getDefendingGoalX(teamId);
    let closest: typeof this.state.players[number] | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const player of candidates) {
      const dist = Math.hypot(player.position.x - goalX, player.position.y - this.pitch.height / 2);
      if (dist < closestDist) {
        closestDist = dist;
        closest = player;
      }
    }
    return closest;
  }

  private pickThrowInTarget(
    teamId: string,
    taker: typeof this.state.players[number],
    settings: SetPieceWizardSettings
  ) {
    return pickThrowInTarget(this.getSetPieceContext(), teamId, taker, settings);
  }

  private pickSetPieceTargetBySpot(
    teamId: string,
    spot: Vector2,
    excludeIds: Set<string>
  ) {
    return pickSetPieceTargetBySpot(this.getSetPieceContext(), teamId, spot, excludeIds);
  }

  private getCornerDeliverySpot(
    cornerPosition: Vector2,
    teamId: string,
    settings: SetPieceWizardSettings
  ) {
    return getCornerDeliverySpot(this.getSetPieceContext(), cornerPosition, teamId, settings);
  }

  private getFreeKickDeliverySpot(
    freeKickPosition: Vector2,
    teamId: string,
    settings: SetPieceWizardSettings
  ) {
    return getFreeKickDeliverySpot(this.getSetPieceContext(), freeKickPosition, teamId, settings);
  }

  private buildWallPositions(ball: Vector2, goal: Vector2, count: number) {
    return buildWallPositions(this.getSetPieceContext(), ball, goal, count);
  }

  private getCornerTargetPositions(
    goalX: number,
    midY: number,
    cornerSide: number,
    settings: SetPieceWizardSettings,
    count: number
  ) {
    return getCornerTargetPositions(this.getSetPieceContext(), goalX, midY, cornerSide, settings, count);
  }

  private assignPostCoverage(
    defenders: Array<typeof this.state.players[number]>,
    positions: Map<string, Vector2>,
    goalX: number,
    midY: number,
    cornerSide: number,
    settings: SetPieceWizardSettings
  ) {
    assignPostCoverage(this.getSetPieceContext(), defenders, positions, goalX, midY, cornerSide, settings);
  }

  private assignZonalMarkers(
    defenders: Array<typeof this.state.players[number]>,
    positions: Map<string, Vector2>,
    goalX: number,
    midY: number,
    cornerSide: number,
    settings: SetPieceWizardSettings
  ) {
    assignZonalMarkers(this.getSetPieceContext(), defenders, positions, goalX, midY, cornerSide, settings);
  }

  private assignCounterOutlets(
    teamId: string,
    defenders: Array<typeof this.state.players[number]>,
    positions: Map<string, Vector2>,
    count: number
  ) {
    assignCounterOutlets(this.getSetPieceContext(), teamId, defenders, positions, count);
  }

  private requiresNewWindow(tracker: SubstitutionTracker) {
    if (tracker.lastWindowStart === null) return true;
    return this.state.time - tracker.lastWindowStart > WINDOW_GRACE_SECONDS;
  }

  private resolveTeamName(teamId: string) {
    return this.state.teams.find((team) => team.id === teamId)?.name ?? teamId;
  }

  private applyDiscipline(teamId: string, playerId: string, card: 'yellow' | 'red') {
    const player = this.state.players.find((entry) => entry.id === playerId);
    if (!player) return;

    if (!player.discipline) {
      player.discipline = { yellow: 0, red: false };
    }
    if (player.discipline.red) return;

    if (card === 'yellow') {
      player.discipline.yellow = Math.min(2, player.discipline.yellow + 1);
      this.statsAgent.recordYellow(teamId);
      if (player.discipline.yellow >= 2) {
        player.discipline.red = true;
        this.statsAgent.recordRed(teamId);
        this.commentaryAgent.addLine(
          this.state.time,
          `${player.name} is dismissed after a second yellow card.`
        );
      }
      return;
    }

    player.discipline.red = true;
    this.statsAgent.recordRed(teamId);
  }
}
