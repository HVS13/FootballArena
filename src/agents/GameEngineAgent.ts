import { DEFAULT_PITCH, PitchDimensions, RenderState, SimulationState, TeamState, Vector2 } from '../domain/simulationTypes';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { CommentaryLine, MatchStats } from '../domain/matchTypes';
import { PlayerAttributes } from '../domain/types';
import { TeamSetupState } from '../domain/teamSetupTypes';
import { getRoleDutyBehavior, RoleBehavior } from '../data/roleBehavior';
import { getMatchImportanceWeight } from '../data/matchImportance';
import { DEFAULT_SET_PIECE_SETTINGS, SetPieceWizardSettings } from '../data/setPieceWizard';
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

type PossessionState = {
  teamId: string;
  playerId: string;
};

type RestartState = {
  remaining: number;
  teamId: string;
  position: Vector2;
  type: NonNullable<RuleDecision['restartType']>;
  takerId: string | null;
};

type SimPlayer = SimulationState['players'][number];

type PlayerMeta = {
  name: string;
  shirtNo?: number;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  leftFoot?: number;
  rightFoot?: number;
  nationality?: string;
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

type RoleArchetypeProfile = {
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

type SetPieceAssignments = {
  aerial: SimPlayer[];
  box: SimPlayer[];
  creators: SimPlayer[];
  recovery: SimPlayer[];
  remaining: SimPlayer[];
};

type SetPieceRoleScores = {
  aerial: number;
  box: number;
  creator: number;
  recovery: number;
};

type AdaptationWindow = {
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

type AdaptationState = {
  nextCheck: number;
  window: AdaptationWindow;
};

const MAX_SUBS = 5;
const MAX_WINDOWS = 3;
const WINDOW_GRACE_SECONDS = 30;
const CONTROL_DISTANCE = 2.2;
const CONTROL_SPEED = 2.4;
const ADAPTATION_INITIAL_DELAY = 300;
const ADAPTATION_WINDOW_SECONDS = 240;
const ADAPTATION_MIN_EVENTS = 12;
const ADAPTATION_LANE_MARGIN = 0.15;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
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

const cloneState = (state: SimulationState): SimulationState => ({
  time: state.time,
  teams: state.teams.map((team) => ({ ...team })),
  players: state.players.map((player) => ({
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
    homePosition: { ...player.homePosition },
    targetPosition: { ...player.targetPosition },
    tacticalPosition: player.tacticalPosition ? { ...player.tacticalPosition } : undefined,
    attributes: player.attributes ? { ...player.attributes } : undefined,
    playstyles: player.playstyles ? [...player.playstyles] : undefined,
    playstylesPlus: player.playstylesPlus ? [...player.playstylesPlus] : undefined,
    traits: player.traits ? [...player.traits] : undefined,
    roleId: player.roleId ?? null,
    dutyId: player.dutyId ?? null,
    tacticalWander: player.tacticalWander,
    morale: player.morale,
    injury: player.injury ? { ...player.injury } : null,
    fatigue: player.fatigue,
    discipline: player.discipline ? { ...player.discipline } : { yellow: 0, red: false }
  })),
  ball: {
    ...state.ball,
    position: { ...state.ball.position },
    velocity: { ...state.ball.velocity }
  },
  officials: state.officials.map((official) => ({
    ...official,
    position: { ...official.position }
  }))
});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const interpolateState = (prev: SimulationState, next: SimulationState, alpha: number): RenderState => ({
  time: lerp(prev.time, next.time, alpha),
  teams: next.teams,
  players: next.players.map((player, index) => ({
    ...player,
    position: {
      x: lerp(prev.players[index].position.x, player.position.x, alpha),
      y: lerp(prev.players[index].position.y, player.position.y, alpha)
    },
    velocity: { ...player.velocity }
  })),
  ball: {
    ...next.ball,
    position: {
      x: lerp(prev.ball.position.x, next.ball.position.x, alpha),
      y: lerp(prev.ball.position.y, next.ball.position.y, alpha)
    },
    velocity: { ...next.ball.velocity }
  },
  officials: next.officials.map((official, index) => ({
    ...official,
    position: {
      x: lerp(prev.officials[index].position.x, official.position.x, alpha),
      y: lerp(prev.officials[index].position.y, official.position.y, alpha)
    }
  }))
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
      const position = {
        x: slot.position.x * pitch.width,
        y: slot.position.y * pitch.height
      };

      return {
        id: rosterPlayer?.id ?? `${team.id}-${slot.id}`,
        name,
        shirtNo: rosterPlayer?.shirtNo,
        age: rosterPlayer?.age,
        heightCm: rosterPlayer?.heightCm,
        weightKg: rosterPlayer?.weightKg,
        leftFoot: rosterPlayer?.leftFoot,
        rightFoot: rosterPlayer?.rightFoot,
        nationality: rosterPlayer?.nationality,
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
    if (this.restartState) {
      this.state.players.forEach((player) => {
        player.tacticalPosition = { ...player.homePosition };
        player.tacticalWander = 0.8;
      });
      return;
    }

    const possessionTeamId = this.possession?.teamId ?? null;
    const possessorId = this.possession?.playerId ?? null;
    const ball = this.state.ball.position;
    const midY = this.pitch.height / 2;
    const teamShape = new Map<
      string,
      { defensiveLineAxis: number; engagementAxis: number; pressTrigger: number }
    >();
    const teamMarking = new Map<string, Map<string, typeof this.state.players[number]>>();

    this.state.teams.forEach((team) => {
      const instructions = this.getTeamInstructions(team.id);
      const direction = this.getAttackDirection(team.id);
      teamShape.set(team.id, {
        defensiveLineAxis: this.getDefensiveLineAxis(instructions?.defensive_line),
        engagementAxis: this.getLineOfEngagementAxis(instructions?.line_of_engagement),
        pressTrigger: this.getPressTrigger(instructions, direction, ball)
      });
      if (possessionTeamId && possessionTeamId !== team.id) {
        teamMarking.set(team.id, this.buildMarkingAssignments(team.id, direction));
      }
    });

    this.state.players.forEach((player) => {
      const behavior = this.getRoleBehavior(player);
      const roleProfile = this.getRoleArchetypeProfile(player);
      const instructions = this.getTeamInstructions(player.teamId);
      const direction = this.getAttackDirection(player.teamId);
      const base = player.homePosition;
      const lineDepth = this.getLineDepth(base.x, direction);
      const inPossession = possessionTeamId === player.teamId;
      const shape = teamShape.get(player.teamId);

      if (player.discipline?.red) {
        player.tacticalPosition = { ...player.position };
        player.tacticalWander = 0.2;
        player.targetPosition = { ...player.position };
        player.targetTimer = Math.min(player.targetTimer, 0.5);
        return;
      }

      if (this.isGoalkeeperRole(player)) {
        const goalX = this.getDefendingGoalX(player.teamId);
        const distanceToBall = Math.abs(ball.x - goalX);
        const sweeperFactor = clamp(behavior.advance, 0.05, 0.6);
        const maxAdvance = 5 + sweeperFactor * 10;
        const advance = clamp((distanceToBall / this.pitch.width) * maxAdvance, 1.5, maxAdvance);
        const pitchDirection = goalX === 0 ? 1 : -1;
        let anchorX = goalX + pitchDirection * advance;
        let anchorY = lerp(midY, ball.y, 0.1 + sweeperFactor * 0.25);

        anchorX = clamp(anchorX, player.radius, this.pitch.width - player.radius);
        anchorY = clamp(anchorY, player.radius, this.pitch.height - player.radius);

        player.tacticalPosition = { x: anchorX, y: anchorY };
        player.tacticalWander = 0.5;
        player.targetPosition = { x: anchorX, y: anchorY };
        player.targetTimer = Math.min(player.targetTimer, 0.4);
        return;
      }

      let advance = behavior.advance;
      let retreat = behavior.retreat;

      if (this.hasTrait(player, 'stays_back_at_all_times')) {
        advance = clamp(advance - 0.25, 0, 1);
        retreat = clamp(retreat + 0.15, 0, 1);
      }
      if (this.hasTrait(player, 'gets_forward_whenever_possible')) {
        advance = clamp(advance + 0.2, 0, 1);
      }
      if (this.hasTrait(player, 'gets_into_opposition_area')) {
        advance = clamp(advance + 0.15, 0, 1);
      }
      if (this.hasTrait(player, 'comes_deep_to_get_ball')) {
        advance = clamp(advance - 0.2, 0, 1);
        retreat = clamp(retreat + 0.1, 0, 1);
      }

      let widthBias = behavior.width;
      if (this.hasTrait(player, 'hugs_line')) widthBias += 0.2;
      if (this.hasTrait(player, 'cuts_inside')) widthBias -= 0.2;
      if (this.hasTrait(player, 'moves_into_channels')) widthBias += 0.12;
      if (inPossession) {
        widthBias += this.getAttackingWidthBias(instructions?.attacking_width);
      }
      widthBias += inPossession ? roleProfile.inPossession.widthBias : roleProfile.outOfPossession.widthBias;

      const attackShiftBase = lineDepth < 0.33 ? 5.5 : lineDepth < 0.66 ? 7.5 : 6;
      const defendShiftBase = lineDepth < 0.33 ? 5.2 : lineDepth < 0.66 ? 6.2 : 4.5;

      let attackShift = attackShiftBase * advance;
      let defendShift = defendShiftBase * retreat;

      if (inPossession) {
        const transition = instructions?.attacking_transition;
        if (transition === 'Counter-Attack') attackShift *= 1.12;
        if (transition === 'Patient Build-Up') attackShift *= 0.92;
      }

      let anchorX = base.x + (inPossession ? direction * attackShift : -direction * defendShift);

      if (!inPossession && possessionTeamId) {
        const defensiveLineOffset = this.getDefensiveLineOffset(instructions?.defensive_line);
        const lineScale = clamp(1.2 - lineDepth, 0.3, 1);
        anchorX += direction * defensiveLineOffset * lineScale;
      }
      const axisShift = inPossession ? roleProfile.inPossession.axisShift : roleProfile.outOfPossession.axisShift;
      anchorX += direction * axisShift;

      let anchorY = this.applyWidthBias(base.y, widthBias, midY);

      if (inPossession) {
        const roamPull = clamp(behavior.roam + roleProfile.inPossession.roamBias, 0, 1);
        anchorX = lerp(anchorX, ball.x, 0.08 * roamPull);
        anchorY = lerp(anchorY, ball.y, 0.12 * roamPull);

        const offTheBall = this.getAttribute(player, 'off_the_ball');
        const teamwork = this.getAttribute(player, 'teamwork');
        const supportFactor = clamp((offTheBall + teamwork) / 200, 0, 1);
        const playerAxis = this.getAttackAxis(anchorX, direction);
        const ballAxis = this.getAttackAxis(ball.x, direction);
        const axisDelta = clamp(ballAxis - playerAxis, -14, 14);
        let supportShift = axisDelta * (0.04 + supportFactor * 0.06);
        if (this.hasTrait(player, 'comes_deep_to_get_ball') && axisDelta < 0) {
          supportShift *= 1.2;
        }
        anchorX += direction * supportShift;

        if (player.id !== possessorId) {
          const anticipation = this.getAttribute(player, 'anticipation');
          const acceleration = this.getAttribute(player, 'acceleration');
          const decisions = this.getAttribute(player, 'decisions');
          const runSkill = clamp((offTheBall + anticipation + acceleration + decisions) / 400, 0, 1);
          let runBias = runSkill * 0.5 + behavior.advance * 0.45 + behavior.roam * 0.15;
          runBias += roleProfile.inPossession.runBias;

          if (this.hasTrait(player, 'comes_deep_to_get_ball')) runBias -= 0.25;
          if (this.hasTrait(player, 'stays_back_at_all_times')) runBias -= 0.3;
          if (this.hasTrait(player, 'gets_forward_whenever_possible')) runBias += 0.2;
          if (this.hasTrait(player, 'gets_into_opposition_area')) runBias += 0.15;
          if (this.hasTrait(player, 'likes_to_try_to_beat_offside_trap')) runBias += 0.18;
          if (this.hasTrait(player, 'arrives_late_in_opponents_area')) runBias += 0.12;
          if (this.hasTrait(player, 'plays_with_back_to_goal')) runBias -= 0.1;

          if (instructions?.attacking_transition === 'Counter-Attack') runBias += 0.08;
          if (instructions?.attacking_transition === 'Patient Build-Up') runBias -= 0.08;
          if (instructions?.tempo === 'Higher') runBias += 0.05;
          if (instructions?.tempo === 'Lower') runBias -= 0.05;
          if (instructions?.pass_reception === 'Overlapped' && behavior.width > 0.3) {
            runBias += 0.08;
          }

          runBias = clamp(runBias, -0.35, 0.9);

          const spacing = clamp(ballAxis - playerAxis, -10, 16);
          let forwardRun = runBias >= 0 ? 2 + runBias * 6 : runBias * 4;
          if (spacing > 10) forwardRun *= 0.7;
          if (spacing < -4) forwardRun *= 0.4;

          anchorX += direction * forwardRun;

          let lateralShift = 0;
          if (this.hasTrait(player, 'moves_into_channels')) {
            const offset = anchorY - midY;
            if (Math.abs(offset) > 12) {
              lateralShift -= Math.sign(offset) * 3;
            } else {
              lateralShift += Math.sign(offset || 1) * 3;
            }
          }
          if (instructions?.pass_reception === 'Overlapped' && behavior.width > 0.3) {
            lateralShift += Math.sign(anchorY - midY || 1) * 2.5;
            anchorX += direction * 1.2;
          }

          anchorY += lateralShift;
        }

        const channelBias = roleProfile.inPossession.channelBias;
        if (channelBias > 0.01) {
          const channelTarget = this.getChannelLaneY(base.y, midY);
          anchorY = lerp(anchorY, channelTarget, clamp(channelBias, 0, 1));
        }

        const diagonalShift = roleProfile.inPossession.diagonalShift;
        if (Math.abs(diagonalShift) > 0.01) {
          const centerDir = base.y < midY ? 1 : -1;
          const centerPull = clamp(Math.abs(base.y - midY) / midY, 0.2, 1);
          anchorY += centerDir * diagonalShift * centerPull;
        }

        if (this.hasTrait(player, 'runs_with_ball_down_left')) {
          anchorY = lerp(anchorY, midY - midY * 0.45, 0.12);
        } else if (this.hasTrait(player, 'runs_with_ball_down_right')) {
          anchorY = lerp(anchorY, midY + midY * 0.45, 0.12);
        } else if (this.hasTrait(player, 'runs_with_ball_down_centre')) {
          anchorY = lerp(anchorY, midY, 0.12);
        }
      } else if (possessionTeamId) {
        const pressBias = this.getPressBias(instructions);
        const pressTrigger = shape?.pressTrigger ?? 1;
        const pressPull = clamp(
          (behavior.press + pressBias + roleProfile.outOfPossession.pressBias) * pressTrigger,
          0,
          1.1
        );
        anchorX = lerp(anchorX, ball.x, 0.07 + pressPull * 0.15);
        anchorY = lerp(anchorY, ball.y, 0.06 + pressPull * 0.15);

        const compactness = this.getDefensiveCompactness(instructions);
        anchorY = midY + (anchorY - midY) * (1 - compactness);

        if (shape) {
          const lineTargetX = this.getLineTargetX(player, direction, shape.defensiveLineAxis, shape.engagementAxis);
          const lineWeight = 0.25 + behavior.retreat * 0.25 + (1 - behavior.roam) * 0.1;
          anchorX = lerp(anchorX, lineTargetX, clamp(lineWeight, 0.2, 0.55));
        }

        const lineBehavior = instructions?.defensive_line_behaviour;
        if (lineBehavior === 'Offside Trap') {
          anchorX += direction * 1.2;
        } else if (lineBehavior === 'Step Up') {
          anchorX += direction * 0.8;
        }

        const markingTarget =
          teamMarking.get(player.teamId)?.get(player.id) ?? this.findMarkingTarget(player);
        if (markingTarget) {
          const marking = this.getAttribute(player, 'marking');
          let markStrength = 0.04 + (marking / 100) * 0.22;
          if (this.hasTrait(player, 'marks_opponent_tightly')) markStrength += 0.12;
          markStrength += behavior.press * 0.08;
          markStrength = clamp(markStrength, 0, 0.35);
          anchorX = lerp(anchorX, markingTarget.position.x, markStrength);
          anchorY = lerp(anchorY, markingTarget.position.y, markStrength);
        }
      }

      anchorX = clamp(anchorX, player.radius, this.pitch.width - player.radius);
      anchorY = clamp(anchorY, player.radius, this.pitch.height - player.radius);

      player.tacticalPosition = { x: anchorX, y: anchorY };

      let wander = 1 + behavior.roam * 0.7 - behavior.hold * 0.5;
      wander += inPossession ? roleProfile.inPossession.wanderBias : roleProfile.outOfPossession.wanderBias;
      if (!inPossession && possessionTeamId) {
        wander -= 0.05;
      }
      const versatility = this.getAttribute(player, 'versatility');
      const versatilityFactor = 0.85 + (versatility / 100) * 0.3;
      player.tacticalWander = clamp(wander * versatilityFactor, 0.6, 1.6);

      const targetDistance = Math.hypot(
        player.targetPosition.x - anchorX,
        player.targetPosition.y - anchorY
      );
      if (targetDistance > 7) {
        player.targetPosition = { x: anchorX, y: anchorY };
        player.targetTimer = Math.min(player.targetTimer, 0.4);
      }
    });
  }

  private initializePlayerState() {
    this.state.players.forEach((player) => {
      player.morale = this.getInitialMorale(player.attributes);
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
  }

  private buildAdaptationState() {
    const state: Record<string, AdaptationState> = {};
    this.state.teams.forEach((team) => {
      state[team.id] = {
        nextCheck: ADAPTATION_INITIAL_DELAY,
        window: this.createAdaptationWindow()
      };
    });
    return state;
  }

  private createAdaptationWindow(): AdaptationWindow {
    return {
      passes: 0,
      longPasses: 0,
      crosses: 0,
      entriesLeft: 0,
      entriesRight: 0,
      entriesCentral: 0,
      shots: 0,
      shotsWide: 0,
      shotsCentral: 0
    };
  }

  private getInitialMorale(attributes?: PlayerAttributes) {
    const base = 60;
    const leadership = this.getAttributeFromMap(attributes, 'leadership');
    const determination = this.getAttributeFromMap(attributes, 'determination');
    const consistency = this.getAttributeFromMap(attributes, 'consistency');
    const composure = this.getAttributeFromMap(attributes, 'composure');
    let morale = base;
    morale += (leadership - 50) * 0.12;
    morale += (determination - 50) * 0.12;
    morale += (consistency - 50) * 0.06;
    morale += (composure - 50) * 0.05;
    return clamp(morale, 40, 85);
  }

  private updateFatigue(dt: number) {
    if (!this.halftimeRecovered && this.state.time >= 2700) {
      this.applyHalftimeRecovery();
      this.halftimeRecovered = true;
    }

    const matchProgress = Math.min(this.state.time / 5400, 1);
    const importance = this.matchImportance;
    const envFatigue = this.getEnvironmentFatigueFactor();
    const baseDrain = 0.000055;
    const baseRecovery = 0.00007;
    const ballSpeed = Math.hypot(this.state.ball.velocity.x, this.state.ball.velocity.y);
    const lowIntensityPhase = Boolean(this.restartState) || (ballSpeed < 0.3 && !this.possession);
    const stats = this.statsAgent.getStats();

    this.state.players.forEach((player) => {
      const stamina = this.getAttribute(player, 'stamina');
      const naturalFitness = this.getAttribute(player, 'natural_fitness');
      const workRate = this.getAttribute(player, 'work_rate');
      const behavior = this.getRoleBehavior(player);
      const instructions = this.getTeamInstructions(player.teamId);
      const intensity = this.getFatigueIntensity(behavior, instructions);

      const staminaFactor = 1 + (1 - stamina / 100) * 0.9;
      const fitnessFactor = 1 + (1 - naturalFitness / 100) * 0.6;
      const workRateFactor = 1 + (workRate / 100) * 0.25;
      const timeScale = 0.6 + matchProgress * 0.7;

      let drain =
        baseDrain * intensity * staminaFactor * fitnessFactor * workRateFactor * envFatigue * importance * timeScale;

      const teamGoals = stats.byTeam[player.teamId]?.goals ?? 0;
      const opponentId = this.getOpponentTeamId(player.teamId);
      const opponentGoals = stats.byTeam[opponentId]?.goals ?? 0;
      const timeWasting = instructions?.time_wasting;
      if (timeWasting === 'More Often' && teamGoals > opponentGoals) {
        drain *= 0.9;
      } else if (timeWasting === 'Less Often' && teamGoals < opponentGoals) {
        drain *= 1.05;
      }

      let delta = drain * dt;
      if (lowIntensityPhase) {
        const recovery =
          baseRecovery *
          (1 + (naturalFitness / 100) * 0.4) *
          (1 - (player.fatigue ?? 0));
        delta -= recovery * dt;
      }

      player.fatigue = clamp((player.fatigue ?? 0) + delta, 0, 1);
    });
  }

  private applyHalftimeRecovery() {
    this.state.players.forEach((player) => {
      const naturalFitness = this.getAttribute(player, 'natural_fitness');
      const recovery = 0.12 + (naturalFitness / 100) * 0.08;
      player.fatigue = clamp((player.fatigue ?? 0) - recovery, 0, 1);
      this.adjustPlayerMorale(player.id, 1);
    });
    this.commentaryAgent.addLine(this.state.time, 'Half-time. Players recover and reset.');
  }

  private getFatigueIntensity(behavior: RoleBehavior, instructions?: Record<string, string>) {
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
  }

  private updateMorale(dt: number) {
    const base = 60;
    const stats = this.statsAgent.getStats();
    const importance = this.matchImportance;

    this.state.players.forEach((player) => {
      let morale = player.morale ?? base;
      const teamGoals = stats.byTeam[player.teamId]?.goals ?? 0;
      const opponentId = this.getOpponentTeamId(player.teamId);
      const opponentGoals = stats.byTeam[opponentId]?.goals ?? 0;
      const scoreDiff = clamp(teamGoals - opponentGoals, -3, 3);

      morale += scoreDiff * 0.006 * importance * dt;

      const leadership = this.getAttribute(player, 'leadership');
      const determination = this.getAttribute(player, 'determination');
      const resilience = clamp((leadership + determination) / 200, 0, 1);
      const driftRate = 0.006 + resilience * 0.004;
      morale += (base - morale) * driftRate * dt;

      player.morale = clamp(morale, 20, 95);
    });
  }

  private isAdaptationEnabled(teamId: string) {
    const team = this.teamSetup?.teams.find((entry) => entry.id === teamId);
    if (!team) return false;
    return team.controlType === 'ai' || team.assistTactics;
  }

  private updateOpponentAdaptation() {
    if (!this.teamSetup) return;
    if (this.state.time < ADAPTATION_INITIAL_DELAY) return;

    this.state.teams.forEach((team) => {
      if (!this.isAdaptationEnabled(team.id)) return;
      const state = this.adaptationState[team.id];
      if (!state || this.state.time < state.nextCheck) return;

      const window = state.window;
      const totalEvents = window.passes + window.shots;
      if (totalEvents < ADAPTATION_MIN_EVENTS) {
        state.nextCheck = this.state.time + ADAPTATION_WINDOW_SECONDS;
        state.window = this.createAdaptationWindow();
        return;
      }

      const longRate = window.passes > 0 ? window.longPasses / window.passes : 0;
      const crossRate = window.passes > 0 ? window.crosses / window.passes : 0;
      const totalEntries = window.entriesLeft + window.entriesRight + window.entriesCentral;
      const leftRate = totalEntries > 0 ? window.entriesLeft / totalEntries : 0;
      const rightRate = totalEntries > 0 ? window.entriesRight / totalEntries : 0;
      const centralRate = totalEntries > 0 ? window.entriesCentral / totalEntries : 0;
      const wideRate = leftRate + rightRate;
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

      this.applyAdaptiveInstructions(team.id, updates);
      state.nextCheck = this.state.time + ADAPTATION_WINDOW_SECONDS;
      state.window = this.createAdaptationWindow();
    });
  }

  private applyAdaptiveInstructions(teamId: string, updates: Record<string, string>) {
    if (!this.teamSetup) return;
    const team = this.teamSetup.teams.find((entry) => entry.id === teamId);
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
  }

  private recordOpponentPassTendency(
    attackingTeamId: string,
    passer: typeof this.state.players[number],
    receiver: typeof this.state.players[number]
  ) {
    const defendingTeamId = this.getOpponentTeamId(attackingTeamId);
    if (!this.isAdaptationEnabled(defendingTeamId)) return;
    const state = this.adaptationState[defendingTeamId];
    if (!state) return;

    const dx = receiver.position.x - passer.position.x;
    const dy = receiver.position.y - passer.position.y;
    const distance = Math.hypot(dx, dy);
    const window = state.window;
    window.passes += 1;
    if (distance >= 24) window.longPasses += 1;
    if (this.isCrossPass(attackingTeamId, passer.position, receiver.position)) {
      window.crosses += 1;
    }

    if (this.isFinalThird(attackingTeamId, receiver.position)) {
      this.recordLaneEntry(window, receiver.position);
    }
  }

  private recordOpponentShotTendency(attackingTeamId: string, shooter: typeof this.state.players[number]) {
    const defendingTeamId = this.getOpponentTeamId(attackingTeamId);
    if (!this.isAdaptationEnabled(defendingTeamId)) return;
    const state = this.adaptationState[defendingTeamId];
    if (!state) return;

    const window = state.window;
    window.shots += 1;
    const midY = this.pitch.height / 2;
    if (Math.abs(shooter.position.y - midY) > 12) {
      window.shotsWide += 1;
    } else {
      window.shotsCentral += 1;
    }

    if (this.isFinalThird(attackingTeamId, shooter.position)) {
      this.recordLaneEntry(window, shooter.position);
    }
  }

  private recordLaneEntry(window: AdaptationWindow, position: Vector2) {
    const midY = this.pitch.height / 2;
    if (position.y < midY - 8) {
      window.entriesLeft += 1;
    } else if (position.y > midY + 8) {
      window.entriesRight += 1;
    } else {
      window.entriesCentral += 1;
    }
  }

  private isFinalThird(teamId: string, position: Vector2) {
    const direction = this.getAttackDirection(teamId);
    const axis = this.getAttackAxis(position.x, direction);
    return axis >= this.pitch.width * 0.66;
  }

  private isCrossPass(attackingTeamId: string, passer: Vector2, receiver: Vector2) {
    const midY = this.pitch.height / 2;
    const passerWide = Math.abs(passer.y - midY) > 16;
    const receiverInBox = this.isInAttackingBox(attackingTeamId, receiver);
    const distance = Math.hypot(receiver.x - passer.x, receiver.y - passer.y);
    return passerWide && (receiverInBox || distance > 22);
  }

  private updateInjuries(dt: number) {
    const matchProgress = Math.min(this.state.time / 5400, 1);
    const importance = this.matchImportance;
    const envFatigue = this.getEnvironmentFatigueFactor();
    const baseRate = 0.000004;

    this.state.players.forEach((player) => {
      if (player.injury) {
        player.injury.remaining -= dt;
        if (player.injury.remaining <= 0) {
          player.injury = null;
          this.adjustPlayerMorale(player.id, 2);
        }
        return;
      }

      const stamina = this.getAttribute(player, 'stamina');
      const naturalFitness = this.getAttribute(player, 'natural_fitness');
      const injuryProneness = this.getAttribute(player, 'injury_proneness');
      const aggression = this.getAttribute(player, 'aggression');
      const bravery = this.getAttribute(player, 'bravery');
      const instructions = this.getTeamInstructions(player.teamId);

      const fatigueLoad = clamp(player.fatigue ?? 0, 0, 1);
      const fatigue = (1 - stamina / 100) * (0.3 + matchProgress * 0.7) + fatigueLoad * 0.5;
      const fitnessPenalty = (1 - naturalFitness / 100) * 0.6;
      const intensity = this.getInjuryIntensity(instructions);
      const contactFactor = 1 + (aggression / 100) * 0.15;

      const risk =
        baseRate *
        (1 + (injuryProneness / 100) * 1.4) *
        (1 + fatigue * 2 + fitnessPenalty) *
        intensity *
        contactFactor *
        envFatigue *
        importance;

      if (Math.random() < risk * dt) {
        const severity = clamp(
          0.18 + Math.random() * 0.45 + injuryProneness / 200 + fatigue * 0.25 - (bravery / 100) * 0.05,
          0.18,
          0.85
        );
        const duration = 20 + severity * 80 + Math.random() * 20;
        player.injury = { severity, remaining: duration };
        this.adjustPlayerMorale(player.id, -6 * importance);
        this.adjustTeamMorale(player.teamId, -2.5 * importance);
        this.commentaryAgent.addLine(this.state.time, `${player.name} picks up a knock.`);
      }
    });
  }

  private adjustTeamMorale(teamId: string, delta: number) {
    this.state.players.forEach((player) => {
      if (player.teamId !== teamId) return;
      this.adjustPlayerMorale(player.id, delta);
    });
  }

  private adjustPlayerMorale(playerId: string, delta: number) {
    const player = this.state.players.find((entry) => entry.id === playerId);
    if (!player) return;
    const determination = this.getAttribute(player, 'determination');
    const leadership = this.getAttribute(player, 'leadership');
    let adjusted = delta;
    if (delta < 0) {
      adjusted *= 1 - (determination / 100) * 0.25;
    } else if (delta > 0) {
      adjusted *= 1 + (leadership / 100) * 0.1;
    }
    player.morale = clamp((player.morale ?? 60) + adjusted, 20, 95);
  }

  private getMoraleFactor(player: typeof this.state.players[number]) {
    const morale = player.morale ?? 60;
    return clamp(0.9 + (morale / 100) * 0.2, 0.85, 1.15);
  }

  private handleGoalkeeperPossession(
    goalkeeper: typeof this.state.players[number],
    instructions: Record<string, string> | undefined,
    pressure: number
  ) {
    const target = this.chooseGoalkeeperTarget(goalkeeper, instructions);
    if (!target) return null;

    const gkInstructions = this.buildGoalkeeperInstructions(instructions);
    const decision = this.rules.decidePass(this.state, goalkeeper.teamId, goalkeeper, target, gkInstructions);
    if (pressure > 0.35 && Math.random() < 0.2) {
      decision.commentary = `${goalkeeper.name} clears under pressure.`;
    }
    return decision;
  }

  private chooseGoalkeeperTarget(
    goalkeeper: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    const candidates = this.state.players.filter(
      (player) =>
        player.teamId === goalkeeper.teamId && player.id !== goalkeeper.id && !player.discipline?.red
    );
    if (!candidates.length) return null;

    const targetPref = instructions?.gk_distribution_target ?? 'Centre-Backs';
    const goalKickStyle = instructions?.goal_kicks ?? 'Mixed';
    let wantsShort = goalKickStyle === 'Short' || instructions?.short_goalkeeper_distribution === 'Yes';
    let wantsLong = goalKickStyle === 'Long';
    if (this.hasPlaystylePlus(goalkeeper, 'footwork')) wantsShort = true;
    if (this.hasPlaystylePlus(goalkeeper, 'far_throw')) wantsLong = true;
    if (!wantsShort && !wantsLong) {
      if (this.hasPlaystyle(goalkeeper, 'footwork')) wantsShort = true;
      if (this.hasPlaystyle(goalkeeper, 'far_throw')) wantsLong = true;
    }
    if (goalKickStyle === 'Mixed') {
      if (this.hasPlaystyle(goalkeeper, 'far_throw')) wantsLong = true;
      if (this.hasPlaystylePlus(goalkeeper, 'footwork')) wantsShort = true;
    }

    const midY = this.pitch.height / 2;
    const direction = this.getAttackDirection(goalkeeper.teamId);

    const withDepth = candidates.map((player) => {
      const depth = this.getLineDepth(player.homePosition.x, direction);
      const width = Math.abs(player.homePosition.y - midY);
      return { player, depth, width };
    });

    const filtered = withDepth.filter((entry) => {
      switch (targetPref) {
        case 'Centre-Backs':
          return entry.depth < 0.35 && entry.width < 10;
        case 'Full-Backs':
          return entry.depth < 0.35 && entry.width >= 10;
        case 'Midfielders':
          return entry.depth >= 0.35 && entry.depth < 0.66;
        case 'Forwards':
          return entry.depth >= 0.66;
        default:
          return true;
      }
    });

    let pool = filtered.length ? filtered : withDepth;
    if (wantsLong) {
      const longDepth = this.hasPlaystylePlus(goalkeeper, 'far_throw') ? 0.7 : 0.6;
      pool = withDepth.filter((entry) => entry.depth >= longDepth);
      if (!pool.length) pool = withDepth;
    } else if (wantsShort) {
      const shortDepth = this.hasPlaystylePlus(goalkeeper, 'footwork') ? 0.45 : 0.5;
      pool = withDepth.filter((entry) => entry.depth < shortDepth);
      if (!pool.length) pool = withDepth;
    }

    const sorted = pool
      .slice()
      .sort((a, b) => {
        if (wantsLong) {
          const aScore = this.getAerialTargetScore(a.player, direction);
          const bScore = this.getAerialTargetScore(b.player, direction);
          return bScore - aScore;
        }
        return a.depth - b.depth;
      });

    return sorted[0]?.player ?? null;
  }

  private getAerialTargetScore(player: typeof this.state.players[number], direction: number) {
    const depth = this.getLineDepth(player.homePosition.x, direction);
    const aerial = (this.getAttribute(player, 'jumping_reach') + this.getAttribute(player, 'heading')) / 2;
    const strength = this.getAttribute(player, 'strength');
    return depth * 60 + aerial * 0.4 + strength * 0.2;
  }

  private buildGoalkeeperInstructions(instructions: Record<string, string> | undefined) {
    const directness = instructions?.goal_kicks === 'Long' ? 'Much More Direct' : 'Shorter';
    return {
      ...instructions,
      passing_directness: directness
    };
  }

  private getGoalkeeperCooldown(instructions: Record<string, string> | undefined) {
    const speed = instructions?.gk_distribution_speed ?? 'Balanced';
    if (speed === 'Faster') return 0.6;
    if (speed === 'Slower') return 1.4;
    return 1;
  }

  private getEnvironmentFatigueFactor() {
    const { weather, temperatureC } = this.environment;
    const heatPenalty = temperatureC > 22 ? (temperatureC - 22) / 40 : 0;
    const coldPenalty = temperatureC < 4 ? (4 - temperatureC) / 40 : 0;
    const weatherPenalty = weather === 'rain' ? 0.05 : weather === 'snow' ? 0.1 : weather === 'storm' ? 0.12 : 0;
    return 1 + heatPenalty + coldPenalty + weatherPenalty;
  }

  private getInjuryIntensity(instructions?: Record<string, string>) {
    let intensity = 1;
    if (instructions?.tackling === 'Aggressive') intensity += 0.15;
    if (instructions?.tackling === 'Ease Off') intensity -= 0.1;
    if (instructions?.trigger_press === 'More Often') intensity += 0.1;
    if (instructions?.trigger_press === 'Less Often') intensity -= 0.08;
    if (instructions?.line_of_engagement === 'High Press') intensity += 0.08;
    if (instructions?.line_of_engagement === 'Low Block') intensity -= 0.05;
    if (instructions?.pressing_trap === 'Active') intensity += 0.05;
    return clamp(intensity, 0.85, 1.3);
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
    const pressBias = this.getPressBias(defenderInstructions);
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
    const dribbling = this.getAttribute(player, 'dribbling');
    let carryChance = 0.15 + (dribbling / 100) * 0.3;
    const roleBehavior = this.getRoleBehavior(player);
    const roleProfile = this.getRoleArchetypeProfile(player);
    const moraleFactor = this.getMoraleFactor(player);
    const fatigue = player.fatigue ?? 0;

    const dribblingInstruction = instructions?.dribbling;
    if (dribblingInstruction === 'Encouraged') {
      carryChance += 0.08;
    } else if (dribblingInstruction === 'Reduced') {
      carryChance -= 0.08;
    }

    carryChance += this.getPlaystyleBonus(player, 'rapid', 0.06, 0.08);
    carryChance += this.getPlaystyleBonus(player, 'technical', 0.05, 0.07);
    carryChance += this.getPlaystyleBonus(player, 'press_proven', 0.04, 0.06);
    carryChance += this.getPlaystyleBonus(player, 'trickster', 0.04, 0.06);
    carryChance += this.getPlaystyleBonus(player, 'quick_step', 0.04, 0.06);
    carryChance += this.getPlaystyleBonus(player, 'flair', 0.03, 0.05);
    carryChance += this.getPlaystyleBonus(player, 'gamechanger', 0.04, 0.06);
    if (this.hasTrait(player, 'runs_with_ball_often')) carryChance += 0.12;
    if (this.hasTrait(player, 'runs_with_ball_rarely')) carryChance -= 0.18;
    if (this.hasTrait(player, 'knocks_ball_past_opponent')) carryChance += 0.06;
    if (this.hasTrait(player, 'tries_to_play_way_out_of_trouble')) carryChance += 0.05;
    if (this.hasTrait(player, 'runs_with_ball_down_left')) carryChance += 0.05;
    if (this.hasTrait(player, 'runs_with_ball_down_right')) carryChance += 0.05;
    if (this.hasTrait(player, 'runs_with_ball_down_centre')) carryChance += 0.04;

    carryChance += roleBehavior.carry * 0.18;
    carryChance += roleBehavior.risk * 0.08;
    carryChance -= roleBehavior.hold * 0.08;
    carryChance += roleProfile.decision.carryBias;

    carryChance *= moraleFactor * (1 - fatigue * 0.25);
    carryChance *= 1 - clamp(pressure * 0.55, 0, 0.45);
    carryChance = clamp(carryChance, 0.08, 0.55);
    return Math.random() < carryChance;
  }

  private getActionCooldown(
    player: typeof this.state.players[number],
    instructions: Record<string, string> | undefined,
    actionType: RuleDecision['type'] | 'carry',
    pressure = 0
  ) {
    const decisions = this.getAttribute(player, 'decisions');
    let base = 0.8 + (1 - decisions / 100) * 0.8;
    const roleBehavior = this.getRoleBehavior(player);
    const morale = player.morale ?? 60;
    const fatigue = player.fatigue ?? 0;

    const tempo = instructions?.tempo;
    if (tempo === 'Higher') {
      base *= 0.75;
    } else if (tempo === 'Lower') {
      base *= 1.2;
    }

    if (actionType === 'shot') base += 0.4;
    if (actionType === 'pass') base += 0.15;
    if (actionType === 'carry') base += 0.2;

    if (this.hasTrait(player, 'dwells_on_ball')) base += 0.35;
    if (this.hasTrait(player, 'stops_play')) base += 0.25;
    if (this.hasTrait(player, 'dictates_tempo')) base += 0.2;
    if (this.hasTrait(player, 'plays_one_twos')) base -= 0.1;

    base *= 1 - clamp(roleBehavior.risk * 0.15, -0.12, 0.12);
    base *= 1 + roleBehavior.hold * 0.1;
    base *= clamp(1 - (morale - 60) / 400, 0.85, 1.15);
    base *= 1 + fatigue * 0.4;

    base *= 1 - clamp(pressure * 0.25, 0, 0.2);
    return clamp(base, 0.45, 2.2);
  }

  private shouldShoot(
    player: typeof this.state.players[number],
    instructions: Record<string, string> | undefined,
    pressure: number,
    hasPassOption: boolean
  ) {
    const teamId = player.teamId;
    const goal = this.getGoalPosition(teamId);
    const distance = Math.hypot(goal.x - player.position.x, goal.y - player.position.y);
    const shotSkill = this.getShotSkill(player);
    const roleBehavior = this.getRoleBehavior(player);
    const roleProfile = this.getRoleArchetypeProfile(player);
    const creativeBias = this.getCreativeFreedomBias(instructions);
    const moraleFactor = this.getMoraleFactor(player);
    const fatigue = player.fatigue ?? 0;

    const shotsInstruction = instructions?.shots_from_distance;
    let maxRange =
      shotsInstruction === 'Encouraged' ? 32 : shotsInstruction === 'Reduced' ? 22 : 26;
    if (this.hasTrait(player, 'shoots_from_distance')) maxRange += 5;
    if (this.hasTrait(player, 'refrains_from_taking_long_shots')) maxRange -= 6;
    if (distance > maxRange) return false;

    let desire = 0.1 + (shotSkill / 100) * 0.35;
    const distanceFactor = clamp(1 - distance / maxRange, 0.1, 1);
    desire *= distanceFactor + 0.4;

    if (distance <= 14) desire += 0.2;
    if (shotsInstruction === 'Encouraged') desire += 0.06;
    if (shotsInstruction === 'Reduced') desire -= 0.08;

    desire += this.getPlaystyleBonus(player, 'power_shot', 0.05, 0.07);
    desire += this.getPlaystyleBonus(player, 'finesse_shot', 0.05, 0.07);
    desire += this.getPlaystyleBonus(player, 'chip_shot', 0.03, 0.05);
    desire += this.getPlaystyleBonus(player, 'trivela', 0.04, 0.06);
    desire += this.getPlaystyleBonus(player, 'acrobatic', distance <= 14 ? 0.03 : 0.01, distance <= 14 ? 0.05 : 0.02);
    desire += this.getPlaystyleBonus(player, 'gamechanger', 0.05, 0.07);
    if (distance <= 12) {
      desire += this.getPlaystyleBonus(player, 'aerial', 0.03, 0.05);
    }
    if (distance <= 10) {
      desire += this.getPlaystyleBonus(player, 'power_header', 0.03, 0.05);
      desire += this.getPlaystyleBonus(player, 'precision_header', 0.02, 0.04);
    }
    if (this.hasTrait(player, 'shoots_with_power')) desire += 0.04;
    if (this.hasTrait(player, 'places_shots')) desire += 0.03;
    if (this.hasTrait(player, 'tries_first_time_shots') && distance <= 18) desire += 0.05;
    if (this.hasTrait(player, 'attempts_overhead_kicks') && distance <= 10) desire += 0.03;
    if (this.hasTrait(player, 'likes_to_lob_keeper') && distance <= 14) desire += 0.04;
    if (this.hasTrait(player, 'likes_to_round_keeper') && distance <= 12) desire += 0.03;
    if (this.hasTrait(player, 'looks_for_pass_rather_than_attempting_to_score')) desire -= 0.1;
    if (this.hasTrait(player, 'penalty_box_player') && distance <= 12) desire += 0.06;
    if (this.hasTrait(player, 'plays_with_back_to_goal')) desire -= 0.08;
    if (this.hasTrait(player, 'stops_play')) desire -= 0.06;

    desire += roleBehavior.shoot * 0.18;
    desire += roleBehavior.risk * 0.08;
    desire -= roleBehavior.pass * 0.08;
    desire -= roleBehavior.hold * 0.05;
    desire += roleProfile.decision.shootBias;
    desire += creativeBias;
    desire *= moraleFactor * (1 - fatigue * 0.2);

    desire += pressure * 0.08;
    if (hasPassOption) desire -= 0.05;

    desire = clamp(desire, 0.05, 0.7);
    return Math.random() < desire;
  }

  private getShotSkill(player: typeof this.state.players[number]) {
    const finishing = this.getAttribute(player, 'finishing');
    const longShots = this.getAttribute(player, 'long_shots');
    const technique = this.getAttribute(player, 'technique');
    const composure = this.getAttribute(player, 'composure');
    return (finishing + longShots + technique + composure) / 4;
  }

  private choosePassTarget(
    teamId: string,
    passer: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    const candidates = this.state.players.filter(
      (player) => player.teamId === teamId && player.id !== passer.id && !player.discipline?.red
    );
    if (!candidates.length) return null;

    const desiredDistance = this.getDesiredPassDistance(passer, instructions);
    const roleBehavior = this.getRoleBehavior(passer);
    const roleProfile = this.getRoleArchetypeProfile(passer);
    const creativeBias = this.getCreativeFreedomBias(instructions);
    const inventive = this.hasPlaystyle(passer, 'inventive');
    const flair = this.hasPlaystyle(passer, 'flair');
    const gamechanger = this.hasPlaystyle(passer, 'gamechanger');
    const whippedPass = this.hasPlaystyle(passer, 'whipped_pass');
    const longBall = this.hasPlaystyle(passer, 'long_ball_pass');
    const riskBias =
      roleBehavior.risk + creativeBias + roleProfile.decision.riskBias +
      (inventive ? this.getPlaystyleBonus(passer, 'inventive', 0.08, 0.12) : 0) +
      (flair ? this.getPlaystyleBonus(passer, 'flair', 0.05, 0.08) : 0) +
      (gamechanger ? this.getPlaystyleBonus(passer, 'gamechanger', 0.08, 0.12) : 0);
    const fatigue = passer.fatigue ?? 0;
    const fatigueRiskScale = 1 - fatigue * 0.5;
    const direction = this.getAttackDirection(teamId);
    const progressThrough = instructions?.progress_through;
    const passerVision = this.getAttribute(passer, 'vision');
    const passerPassing = this.getAttribute(passer, 'passing');
    const rangeFactor = 0.7 + (passerPassing + passerVision) / 200;
    const prefersShort = this.hasTrait(passer, 'plays_short_simple_passes');
    const triesKiller = this.hasTrait(passer, 'tries_killer_balls_often');
    const playsNoThrough = this.hasTrait(passer, 'plays_no_through_balls');
    const likesSwitch = this.hasTrait(passer, 'likes_to_switch_ball_to_other_flank');
    const oneTwos = this.hasTrait(passer, 'plays_one_twos');
    const midline = this.pitch.height / 2;

    const scored = candidates
      .map((receiver) => {
        const dx = receiver.position.x - passer.position.x;
        const dy = receiver.position.y - passer.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 3) return null;

        const forward = dx * direction;
        let distanceScore = 1 - clamp(Math.abs(distance - desiredDistance) / (desiredDistance * 0.9), 0, 1);
        let forwardScore = clamp(forward / (desiredDistance * 1.3), -0.4, 1);
        const openness = this.getOpponentDistance(receiver.position, teamId);
        const opennessScore = clamp(openness / 10, 0, 1);
        const runTarget = receiver.tacticalPosition ?? receiver.targetPosition ?? receiver.position;
        const runAhead =
          this.getAttackAxis(runTarget.x, direction) - this.getAttackAxis(receiver.position.x, direction);
        let runBonus = clamp(runAhead / 12, 0, 0.25);
        if (this.hasTrait(receiver, 'likes_to_try_to_beat_offside_trap')) runBonus *= 1.2;
        if (this.hasTrait(receiver, 'moves_into_channels')) runBonus *= 1.1;
        if (this.hasTrait(passer, 'tries_killer_balls_often')) runBonus *= 1.2;
        if (this.hasPlaystyle(passer, 'incisive_pass')) {
          runBonus *= this.getPlaystyleMultiplier(passer, 'incisive_pass', 1.15, 1.2);
        }
        if (this.hasTrait(passer, 'plays_no_through_balls')) runBonus *= 0.6;

        let sideBonus = 0;
        if (progressThrough === 'Left' && receiver.position.y < this.pitch.height / 2) sideBonus = 0.12;
        if (progressThrough === 'Right' && receiver.position.y > this.pitch.height / 2) sideBonus = 0.12;
        if (
          likesSwitch &&
          ((passer.position.y < midline && receiver.position.y > midline) ||
            (passer.position.y > midline && receiver.position.y < midline))
        ) {
          sideBonus += 0.12;
        }
        if (
          this.hasPlaystyle(passer, 'trivela') &&
          ((passer.position.y < midline && receiver.position.y > midline) ||
            (passer.position.y > midline && receiver.position.y < midline))
        ) {
          sideBonus += this.getPlaystyleBonus(passer, 'trivela', 0.06, 0.09);
        }

        if (roleBehavior.width > 0.1) {
          const sameSide = Math.sign(receiver.position.y - midline) === Math.sign(passer.position.y - midline);
          if (sameSide) sideBonus += Math.abs(roleBehavior.width) * 0.1;
        }
        if (roleBehavior.width < -0.1) {
          const centrality = 1 - Math.abs(receiver.position.y - midline) / midline;
          sideBonus += centrality * Math.abs(roleBehavior.width) * 0.12;
        }
        if (roleBehavior.cross > 0.05) {
          const wideZone = Math.abs(passer.position.y - midline) > 10;
          if (wideZone && this.isInAttackingBox(teamId, receiver.position)) {
            sideBonus += roleBehavior.cross * 0.12;
          }
        }
        if (whippedPass) {
          const wideZone = Math.abs(passer.position.y - midline) > 10;
          if (wideZone && this.isInAttackingBox(teamId, receiver.position)) {
            sideBonus += this.getPlaystyleBonus(passer, 'whipped_pass', 0.12, 0.16);
          }
        }

        if (prefersShort && distance > desiredDistance) {
          distanceScore *= 0.85;
        }
        if (longBall && distance > desiredDistance) {
          distanceScore *= this.getPlaystyleMultiplier(passer, 'long_ball_pass', 1.08, 1.12);
        }
        if (oneTwos && distance <= 12) {
          distanceScore += 0.15;
        }
        if (playsNoThrough) {
          forwardScore *= 0.6;
        }
        if (triesKiller) {
          forwardScore *= 1.15;
        }

        forwardScore *= 1 + clamp(riskBias * 0.35 * fatigueRiskScale, -0.2, 0.25);
        distanceScore *= 1 + clamp(roleBehavior.pass * 0.2, -0.12, 0.12);

        let score =
          0.42 * distanceScore + 0.24 * opennessScore + 0.2 * forwardScore + sideBonus + runBonus;
        score *= clamp(rangeFactor, 0.6, 1.3);

        if (this.rules.isOffsidePosition(this.state, teamId, receiver)) {
          score *= 0.25;
        }

        if (distance > desiredDistance * 1.7) {
          score *= 0.6;
        }

        return { receiver, score: Math.max(0, score) };
      })
      .filter((entry): entry is { receiver: typeof passer; score: number } => Boolean(entry))
      .filter((entry) => entry.score > 0.05)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) return null;
    const top = scored.slice(0, 5);
    const total = top.reduce((sum, entry) => sum + entry.score, 0);
    let roll = Math.random() * total;
    for (const entry of top) {
      roll -= entry.score;
      if (roll <= 0) return entry.receiver;
    }
    return top[0].receiver;
  }

  private getPassLeadPosition(
    passer: typeof this.state.players[number],
    receiver: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    const direction = this.getAttackDirection(passer.teamId);
    const target = receiver.tacticalPosition ?? receiver.targetPosition ?? receiver.position;
    const receiverAxis = this.getAttackAxis(receiver.position.x, direction);
    const targetAxis = this.getAttackAxis(target.x, direction);
    const runAhead = targetAxis - receiverAxis;
    if (runAhead < 2) return null;

    const vision = this.getAttribute(passer, 'vision');
    const decisions = this.getAttribute(passer, 'decisions');
    const technique = this.getAttribute(passer, 'technique');
    const throughSkill = (vision + decisions + technique) / 300;
    let chance = 0.25 + throughSkill * 0.5;
    if (this.hasTrait(passer, 'tries_killer_balls_often')) chance += 0.18;
    chance += this.getPlaystyleBonus(passer, 'incisive_pass', 0.12, 0.16);
    chance += this.getPlaystyleBonus(passer, 'inventive', 0.08, 0.12);
    chance += this.getPlaystyleBonus(passer, 'gamechanger', 0.06, 0.1);
    chance += this.getPlaystyleBonus(passer, 'trivela', 0.04, 0.06);
    if (this.hasTrait(passer, 'plays_no_through_balls')) chance -= 0.25;
    if (instructions?.passing_directness === 'Much Shorter') chance -= 0.1;
    if (instructions?.passing_directness === 'Much More Direct') chance += 0.06;

    if (Math.random() > clamp(chance, 0.05, 0.75)) return null;
    return {
      x: clamp(target.x, 0.5, this.pitch.width - 0.5),
      y: clamp(target.y, 0.5, this.pitch.height - 0.5)
    };
  }

  private getDesiredPassDistance(
    passer: typeof this.state.players[number],
    instructions: Record<string, string> | undefined
  ) {
    const directness = instructions?.passing_directness ?? 'Balanced';
    let desired =
      directness === 'Much Shorter'
        ? 10
        : directness === 'Shorter'
          ? 14
          : directness === 'More Direct'
            ? 26
            : directness === 'Much More Direct'
              ? 32
              : 20;

    const roleBehavior = this.getRoleBehavior(passer);
    const roleProfile = this.getRoleArchetypeProfile(passer);
    const creativeBias = this.getCreativeFreedomBias(instructions);
    const fatigue = passer.fatigue ?? 0;

    desired += this.getPlaystyleBonus(passer, 'tiki_taka', -3, -4);
    desired += this.getPlaystyleBonus(passer, 'long_ball_pass', 4, 6);
    desired += this.getPlaystyleBonus(passer, 'pinged_pass', 2, 3);
    desired += this.getPlaystyleBonus(passer, 'incisive_pass', 2, 3);
    desired += this.getPlaystyleBonus(passer, 'whipped_pass', 1, 2);
    desired += this.getPlaystyleBonus(passer, 'inventive', 1, 2);
    if (this.hasTrait(passer, 'plays_short_simple_passes')) desired -= 4;
    if (this.hasTrait(passer, 'tries_long_range_passes')) desired += 6;
    if (this.hasTrait(passer, 'tries_killer_balls_often')) desired += 4;
    if (this.hasTrait(passer, 'plays_with_back_to_goal')) desired -= 3;
    if (this.hasTrait(passer, 'stops_play')) desired -= 2;

    desired += (roleBehavior.risk + creativeBias) * 6;
    desired += roleBehavior.pass * 4;
    desired -= roleBehavior.hold * 2;
    desired += roleProfile.decision.passDistanceBias;
    desired *= 1 - fatigue * 0.12;

    return clamp(desired, 8, 36);
  }

  private getOpponentDistance(position: Vector2, teamId: string) {
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.state.players) {
      if (player.teamId === teamId || player.discipline?.red) continue;
      const dx = player.position.x - position.x;
      const dy = player.position.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
      }
    }
    return closestDistance;
  }

  private findNearestOpponent(position: Vector2, teamId: string) {
    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.state.players) {
      if (player.teamId === teamId || player.discipline?.red) continue;
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

  private getPressureOnPlayer(player: typeof this.state.players[number]) {
    const distance = this.getOpponentDistance(player.position, player.teamId);
    if (!Number.isFinite(distance)) return 0;
    return clamp((6 - distance) / 6, 0, 1);
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
    const axis = direction === 1 ? x : this.pitch.width - x;
    return clamp(axis / this.pitch.width, 0, 1);
  }

  private getAttackAxis(x: number, direction: number) {
    return direction === 1 ? x : this.pitch.width - x;
  }

  private getLineOfEngagementAxis(value?: string) {
    switch (value) {
      case 'High Press':
        return 62;
      case 'Low Block':
        return 42;
      case 'Mid Block':
      default:
        return 52;
    }
  }

  private getDefensiveLineAxis(value?: string) {
    switch (value) {
      case 'Deeper':
        return 22;
      case 'Higher':
        return 32;
      case 'Much Higher':
        return 38;
      default:
        return 27;
    }
  }

  private getPressTrigger(
    instructions: Record<string, string> | undefined,
    direction: number,
    ball: Vector2
  ) {
    const engagementAxis = this.getLineOfEngagementAxis(instructions?.line_of_engagement);
    const ballAxis = this.getAttackAxis(ball.x, direction);
    const delta = (ballAxis - engagementAxis) / 18;
    return clamp(1 + delta, 0.6, 1.35);
  }

  private getLineTargetX(
    player: typeof this.state.players[number],
    direction: number,
    defensiveLineAxis: number,
    engagementAxis: number
  ) {
    const depth = this.getLineDepth(player.homePosition.x, direction);
    const profile = clamp(Math.pow(depth, 0.8), 0, 1);
    const axis = lerp(defensiveLineAxis, engagementAxis, profile);
    return direction === 1 ? axis : this.pitch.width - axis;
  }

  private getLineBand(depth: number) {
    if (depth < 0.33) return 0;
    if (depth < 0.66) return 1;
    return 2;
  }

  private buildMarkingAssignments(teamId: string, direction: number) {
    const assignments = new Map<string, typeof this.state.players[number]>();
    const taken = new Set<string>();
    const defenders = this.state.players.filter(
      (player) => player.teamId === teamId && !this.isGoalkeeperRole(player)
    );
    const opponents = this.state.players.filter((player) => player.teamId !== teamId);

    const sortedDefenders = defenders
      .slice()
      .sort(
        (a, b) =>
          this.getLineDepth(a.homePosition.x, direction) - this.getLineDepth(b.homePosition.x, direction)
      );

    sortedDefenders.forEach((defender) => {
      const marking = this.getAttribute(defender, 'marking');
      const positioning = this.getAttribute(defender, 'positioning');
      const behavior = this.getRoleBehavior(defender);
      const markSkill = (marking + positioning) / 2;
      const defensiveBias = behavior.retreat + behavior.press * 0.4;
      const allowMarking = markSkill >= 45 || defensiveBias >= 0.4 || this.hasTrait(defender, 'marks_opponent_tightly');
      if (!allowMarking) return;

      let markRadius = 10 + markSkill / 6;
      if (this.hasTrait(defender, 'marks_opponent_tightly')) {
        markRadius += 3;
      }

      const defenderAxis = this.getAttackAxis(defender.position.x, direction);
      const defenderBand = this.getLineBand(this.getLineDepth(defender.homePosition.x, direction));

      let best: { opponent: typeof this.state.players[number]; score: number } | null = null;
      opponents.forEach((opponent) => {
        if (taken.has(opponent.id)) return;
        const distance = Math.hypot(
          opponent.position.x - defender.position.x,
          opponent.position.y - defender.position.y
        );
        if (distance > markRadius) return;
        const opponentAxis = this.getAttackAxis(opponent.position.x, direction);
        const axisDelta = opponentAxis - defenderAxis;
        let score = distance;
        const opponentBand = this.getLineBand(this.getLineDepth(opponent.position.x, direction));
        if (opponentBand !== defenderBand) score += 4;
        if (axisDelta < -6) score += 6;
        score += Math.abs(opponent.position.y - defender.position.y) * 0.05;
        if (!best || score < best.score) {
          best = { opponent, score };
        }
      });

      if (best) {
        assignments.set(defender.id, best.opponent);
        taken.add(best.opponent.id);
      }
    });

    return assignments;
  }

  private applyWidthBias(baseY: number, widthBias: number, midY: number) {
    const clampedBias = clamp(widthBias, -0.6, 0.6);
    const offset = baseY - midY;
    return midY + offset * (1 + clampedBias);
  }

  private getChannelLaneY(baseY: number, midY: number) {
    const side = Math.sign(baseY - midY);
    if (side === 0) return midY;
    const laneOffset = midY * 0.45;
    return midY + side * laneOffset;
  }

  private getAttackingWidthBias(value?: string) {
    switch (value) {
      case 'Much Narrower':
        return -0.25;
      case 'Narrower':
        return -0.12;
      case 'Wider':
        return 0.12;
      case 'Much Wider':
        return 0.25;
      default:
        return 0;
    }
  }

  private getDefensiveLineOffset(value?: string) {
    switch (value) {
      case 'Deeper':
        return -2;
      case 'Higher':
        return 1.5;
      case 'Much Higher':
        return 3;
      default:
        return 0;
    }
  }

  private getPressBias(instructions?: Record<string, string>) {
    let bias = 0;
    if (instructions?.line_of_engagement === 'High Press') bias += 0.15;
    if (instructions?.line_of_engagement === 'Low Block') bias -= 0.15;
    if (instructions?.trigger_press === 'More Often') bias += 0.15;
    if (instructions?.trigger_press === 'Less Often') bias -= 0.15;
    if (instructions?.defensive_transition === 'Counter-Press') bias += 0.15;
    if (instructions?.defensive_transition === 'Regroup') bias -= 0.15;
    if (instructions?.pressing_trap === 'Active') bias += 0.08;
    return clamp(bias, -0.3, 0.35);
  }

  private getDefensiveCompactness(instructions?: Record<string, string>) {
    let compactness = 0;
    if (instructions?.line_of_engagement === 'Low Block') compactness += 0.18;
    if (instructions?.line_of_engagement === 'High Press') compactness -= 0.1;
    if (instructions?.defensive_transition === 'Regroup') compactness += 0.12;
    if (instructions?.defensive_transition === 'Counter-Press') compactness -= 0.06;
    if (instructions?.pressing_trap === 'Active') compactness -= 0.04;
    return clamp(compactness, -0.15, 0.3);
  }

  private findMarkingTarget(player: typeof this.state.players[number]) {
    const marking = this.getAttribute(player, 'marking');
    const positioning = this.getAttribute(player, 'positioning');
    const markingRadius = 10 + (marking + positioning) / 20;
    let closest: typeof this.state.players[number] | null = null;
    let closestScore = Number.POSITIVE_INFINITY;
    for (const opponent of this.state.players) {
      if (opponent.teamId === player.teamId) continue;
      const dx = opponent.position.x - player.position.x;
      const dy = opponent.position.y - player.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > markingRadius) continue;
      if (dist < closestScore) {
        closestScore = dist;
        closest = opponent;
      }
    }
    return closest;
  }

  private getDefendingGoalX(teamId: string) {
    return teamId === this.state.teams[0]?.id ? 0 : this.pitch.width;
  }

  private isGoalkeeperRole(player: typeof this.state.players[number]) {
    const roleId = player.roleId;
    return (
      roleId === 'goalkeeper' ||
      roleId === 'line_holding_keeper' ||
      roleId === 'no_nonsense_goalkeeper' ||
      roleId === 'sweeper_keeper' ||
      roleId === 'ball_playing_goalkeeper'
    );
  }

  private getCreativeFreedomBias(instructions?: Record<string, string>) {
    if (instructions?.creative_freedom === 'More Expressive') return 0.08;
    if (instructions?.creative_freedom === 'More Disciplined') return -0.08;
    return 0;
  }

  private isInAttackingBox(teamId: string, position: Vector2) {
    const goal = this.getGoalPosition(teamId);
    const boxDepth = 18;
    const boxHalfWidth = 20;
    const withinX = goal.x === 0
      ? position.x <= boxDepth
      : position.x >= this.pitch.width - boxDepth;
    const withinY = Math.abs(position.y - this.pitch.height / 2) <= boxHalfWidth;
    return withinX && withinY;
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
    const candidates = this.getActiveTeamPlayers(teamId).filter(
      (player) => player.id !== takerId && !this.isGoalkeeperRole(player)
    );
    if (!candidates.length) {
      return { aerial: [], box: [], creators: [], recovery: [], remaining: [] };
    }

    const attackCount =
      settings.numbersCommitted === 'stay_high' ? 6 : settings.numbersCommitted === 'defend_transition' ? 3 : 5;
    const recoveryCount =
      settings.numbersCommitted === 'defend_transition' ? 3 : settings.numbersCommitted === 'stay_high' ? 1 : 2;
    const creatorCount = attackCount >= 5 ? 2 : 1;
    const aerialCount = Math.min(3, attackCount);
    const boxCount = Math.max(0, attackCount - aerialCount);

    const scored = candidates.map((player) => ({
      player,
      scores: this.getSetPieceRoleScores(player)
    }));

    const assigned = new Set<string>();
    const pickTop = (key: keyof SetPieceRoleScores, count: number) => {
      if (count <= 0) return [];
      return scored
        .filter((entry) => !assigned.has(entry.player.id))
        .sort((a, b) => b.scores[key] - a.scores[key])
        .slice(0, count)
        .map((entry) => {
          assigned.add(entry.player.id);
          return entry.player;
        });
    };

    const aerial = pickTop('aerial', aerialCount);
    const box = pickTop('box', boxCount);
    const creators = pickTop('creator', creatorCount);
    const recovery = pickTop('recovery', recoveryCount);
    const remaining = candidates.filter((player) => !assigned.has(player.id));

    return { aerial, box, creators, recovery, remaining };
  }

  private getSetPieceRoleScores(player: SimPlayer): SetPieceRoleScores {
    const finishing = this.getAttribute(player, 'finishing');
    const offTheBall = this.getAttribute(player, 'off_the_ball');
    const anticipation = this.getAttribute(player, 'anticipation');
    const composure = this.getAttribute(player, 'composure');
    const passing = this.getAttribute(player, 'passing');
    const vision = this.getAttribute(player, 'vision');
    const technique = this.getAttribute(player, 'technique');
    const decisions = this.getAttribute(player, 'decisions');
    const pace = this.getAttribute(player, 'pace');
    const stamina = this.getAttribute(player, 'stamina');
    const positioning = this.getAttribute(player, 'positioning');
    const workRate = this.getAttribute(player, 'work_rate');
    const tackling = this.getAttribute(player, 'tackling');
    const strength = this.getAttribute(player, 'strength');

    const aerial = this.getAerialScore(player);
    const box = (finishing + offTheBall + anticipation + composure) / 4 + strength * 0.1;
    const creator = (passing + vision + technique + decisions) / 4;
    const recovery = (pace + stamina + positioning + workRate) / 4 + tackling * 0.08;

    return { aerial, box, creator, recovery };
  }

  private assignSetPieceTargets(players: SimPlayer[], targets: Vector2[], positions: Map<string, Vector2>) {
    if (!players.length || !targets.length) return;
    const available = players.filter((player) => !positions.has(player.id));
    targets.forEach((target) => {
      const player = available.shift();
      if (player) {
        positions.set(player.id, target);
      }
    });
  }

  private assignRecoveryPositions(
    teamId: string,
    players: SimPlayer[],
    positions: Map<string, Vector2>
  ) {
    if (!players.length) return;
    const slots = this.getRecoveryPositions(teamId, players.length);
    const available = players.filter((player) => !positions.has(player.id)).slice(0, slots.length);
    slots.forEach((slot, index) => {
      const player = available[index];
      if (player) {
        positions.set(player.id, slot);
      }
    });
  }

  private getRecoveryPositions(teamId: string, count: number) {
    const direction = this.getAttackDirection(teamId);
    const baseX = this.pitch.width / 2 - direction * 14;
    const midY = this.pitch.height / 2;
    const offsets =
      count === 1 ? [0] : count === 2 ? [-8, 8] : count === 3 ? [-10, 0, 10] : [-12, -4, 4, 12];

    return offsets.slice(0, count).map((offset) => ({
      x: clamp(baseX, 1, this.pitch.width - 1),
      y: clamp(midY + offset, 1, this.pitch.height - 1)
    }));
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

  private getAerialScore(player: typeof this.state.players[number]) {
    const jumping = this.getAttribute(player, 'jumping_reach');
    const heading = this.getAttribute(player, 'heading');
    const strength = this.getAttribute(player, 'strength');
    const bravery = this.getAttribute(player, 'bravery');
    const height = player.heightCm ?? 180;
    const heightBoost = clamp((height - 170) / 40, 0, 0.35);
    let score = (jumping + heading + strength + bravery) / 4;
    score *= 1 + heightBoost;
    score *= this.getPlaystyleMultiplier(player, 'aerial', 1.05, 1.08);
    score *= this.getPlaystyleMultiplier(player, 'aerial_fortress', 1.1, 1.16);
    score *= this.getPlaystyleMultiplier(player, 'power_header', 1.05, 1.08);
    score *= this.getPlaystyleMultiplier(player, 'precision_header', 1.04, 1.07);
    if (this.hasTrait(player, 'penalty_box_player')) score *= 1.05;
    return score;
  }

  private pickBestAerialTarget(teamId: string, excludeIds: Set<string>) {
    const candidates = this.getActiveTeamPlayers(teamId).filter(
      (player) => !excludeIds.has(player.id) && !this.isGoalkeeperRole(player)
    );
    if (!candidates.length) return null;
    return candidates.reduce((best, player) => {
      const score = this.getAerialScore(player);
      if (!best || score > best.score) {
        return { player, score };
      }
      return best;
    }, null as null | { player: typeof this.state.players[number]; score: number })?.player ?? null;
  }

  private pickThrowInTarget(
    teamId: string,
    taker: typeof this.state.players[number],
    settings: SetPieceWizardSettings
  ) {
    const candidates = this.getActiveTeamPlayers(teamId).filter(
      (player) => player.id !== taker.id && !this.isGoalkeeperRole(player)
    );
    if (!candidates.length) return null;

    const direction = this.getAttackDirection(teamId);
    const ballAxis = this.getAttackAxis(taker.position.x, direction);
    const longThrowSkill = this.getAttribute(taker, 'long_throws');
    const longThrowThreshold = this.hasPlaystylePlus(taker, 'long_throw') ? 55 : 65;
    const hasLongThrow =
      longThrowSkill >= longThrowThreshold ||
      this.hasTrait(taker, 'possesses_long_flat_throw') ||
      this.hasTrait(taker, 'uses_long_throw_to_start_counter_attacks') ||
      this.hasPlaystyle(taker, 'long_throw');

    const prefersLong =
      settings.numbersCommitted === 'stay_high' || settings.defensivePosture === 'counter_attack';
    const longAxisThreshold = this.hasPlaystylePlus(taker, 'long_throw') ? 0.4 : 0.45;
    if (hasLongThrow && ballAxis > this.pitch.width * longAxisThreshold && prefersLong) {
      return this.pickBestAerialTarget(teamId, new Set([taker.id])) ?? candidates[0];
    }

    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    candidates.forEach((player) => {
      const dist = Math.hypot(player.position.x - taker.position.x, player.position.y - taker.position.y);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = player;
      }
    });
    return closest;
  }

  private pickSetPieceTargetBySpot(
    teamId: string,
    spot: Vector2,
    excludeIds: Set<string>
  ) {
    const candidates = this.getActiveTeamPlayers(teamId).filter(
      (player) => !excludeIds.has(player.id) && !this.isGoalkeeperRole(player)
    );
    if (!candidates.length) return null;

    return candidates.reduce((best, player) => {
      const aerial = this.getAerialScore(player);
      const distance = Math.hypot(player.position.x - spot.x, player.position.y - spot.y);
      const score = aerial - distance * 0.6;
      if (!best || score > best.score) {
        return { player, score };
      }
      return best;
    }, null as null | { player: typeof this.state.players[number]; score: number })?.player ?? null;
  }

  private getCornerDeliverySpot(
    cornerPosition: Vector2,
    teamId: string,
    settings: SetPieceWizardSettings
  ) {
    const goal = this.getGoalPosition(teamId);
    const midY = this.pitch.height / 2;
    const cornerSide = cornerPosition.y < midY ? -1 : 1;
    const baseX = goal.x === 0 ? 6 : this.pitch.width - 6;
    const nearY = midY + cornerSide * 4.5;
    const farY = midY - cornerSide * 4.5;
    const centreY = midY;
    const targetY =
      settings.deliveryTarget === 'near_post'
        ? nearY
        : settings.deliveryTarget === 'far_post'
          ? farY
          : centreY;
    const swingOffset = settings.deliverySwing === 'outswinger' ? (goal.x === 0 ? 1.2 : -1.2) : 0.4;
    return {
      x: clamp(baseX + swingOffset, 1, this.pitch.width - 1),
      y: clamp(targetY, 1, this.pitch.height - 1)
    };
  }

  private getFreeKickDeliverySpot(
    freeKickPosition: Vector2,
    teamId: string,
    settings: SetPieceWizardSettings
  ) {
    const goal = this.getGoalPosition(teamId);
    const midY = this.pitch.height / 2;
    const baseX = goal.x === 0 ? 8 : this.pitch.width - 8;
    const nearY = freeKickPosition.y < midY ? midY - 4 : midY + 4;
    const farY = freeKickPosition.y < midY ? midY + 4 : midY - 4;
    const targetY =
      settings.deliveryTarget === 'near_post'
        ? nearY
        : settings.deliveryTarget === 'far_post'
          ? farY
          : midY;
    const swingOffset = settings.deliverySwing === 'outswinger' ? (goal.x === 0 ? 1.4 : -1.4) : 0.4;
    return {
      x: clamp(baseX + swingOffset, 1, this.pitch.width - 1),
      y: clamp(targetY, 1, this.pitch.height - 1)
    };
  }

  private buildWallPositions(ball: Vector2, goal: Vector2, count: number) {
    const dx = goal.x - ball.x;
    const dy = goal.y - ball.y;
    const length = Math.hypot(dx, dy) || 1;
    const dirX = dx / length;
    const dirY = dy / length;
    const center = {
      x: clamp(ball.x + dirX * 8, 1, this.pitch.width - 1),
      y: clamp(ball.y + dirY * 8, 1, this.pitch.height - 1)
    };
    const perpX = -dirY;
    const perpY = dirX;
    const spacing = 1.6;

    return Array.from({ length: count }, (_, index) => {
      const offset = (index - (count - 1) / 2) * spacing;
      return {
        x: clamp(center.x + perpX * offset, 1, this.pitch.width - 1),
        y: clamp(center.y + perpY * offset, 1, this.pitch.height - 1)
      };
    });
  }

  private getCornerTargetPositions(
    goalX: number,
    midY: number,
    cornerSide: number,
    settings: SetPieceWizardSettings,
    count: number
  ) {
    const baseX = goalX === 0 ? 6 : this.pitch.width - 6;
    const farX = goalX === 0 ? 9 : this.pitch.width - 9;
    const edgeX = goalX === 0 ? 18 : this.pitch.width - 18;
    const nearY = midY + cornerSide * 4.5;
    const farY = midY - cornerSide * 4.5;
    const centreY = midY;
    const swingOffset = settings.deliverySwing === 'outswinger' ? (goalX === 0 ? 1.2 : -1.2) : 0.4;

    const targets = [
      { x: baseX + swingOffset, y: nearY },
      { x: baseX + swingOffset, y: centreY },
      { x: farX + swingOffset, y: farY },
      { x: edgeX, y: midY + cornerSide * 8 },
      { x: edgeX, y: midY - cornerSide * 6 }
    ];

    const order =
      settings.deliveryTarget === 'near_post'
        ? [0, 1, 2, 3, 4]
        : settings.deliveryTarget === 'far_post'
          ? [2, 1, 0, 3, 4]
          : [1, 0, 2, 3, 4];

    const ordered = order.map((index) => targets[index]).slice(0, count);
    return ordered.map((pos) => ({
      x: clamp(pos.x, 1, this.pitch.width - 1),
      y: clamp(pos.y, 1, this.pitch.height - 1)
    }));
  }

  private getCornerZonePositions(goalX: number, midY: number, cornerSide: number) {
    const zoneX = goalX === 0 ? 4.5 : this.pitch.width - 4.5;
    return [
      { x: zoneX, y: midY + cornerSide * 3 },
      { x: zoneX, y: midY },
      { x: zoneX, y: midY - cornerSide * 3 }
    ];
  }

  private assignPostCoverage(
    defenders: Array<typeof this.state.players[number]>,
    positions: Map<string, Vector2>,
    goalX: number,
    midY: number,
    cornerSide: number,
    settings: SetPieceWizardSettings
  ) {
    if (settings.postCoverage === 'no_posts') return;
    const postX = goalX === 0 ? 0.8 : this.pitch.width - 0.8;
    const nearPost = { x: postX, y: clamp(midY + cornerSide * 3, 1, this.pitch.height - 1) };
    const farPost = { x: postX, y: clamp(midY - cornerSide * 3, 1, this.pitch.height - 1) };
    const targets = settings.postCoverage === 'both_posts' ? [nearPost, farPost] : [nearPost];

    targets.forEach((pos) => {
      const marker = this.pickClosestPlayerToPosition(defenders, pos, positions);
      if (marker) {
        positions.set(marker.id, pos);
      }
    });
  }

  private assignZonalMarkers(
    defenders: Array<typeof this.state.players[number]>,
    positions: Map<string, Vector2>,
    goalX: number,
    midY: number,
    cornerSide: number,
    settings: SetPieceWizardSettings
  ) {
    if (settings.markingSystem === 'player') return;
    const zones = this.getCornerZonePositions(goalX, midY, cornerSide);
    const zoneCount = settings.markingSystem === 'hybrid' ? 2 : zones.length;
    zones.slice(0, zoneCount).forEach((pos) => {
      const marker = this.pickClosestPlayerToPosition(defenders, pos, positions);
      if (marker) {
        positions.set(marker.id, pos);
      }
    });
  }

  private assignCounterOutlets(
    teamId: string,
    defenders: Array<typeof this.state.players[number]>,
    positions: Map<string, Vector2>,
    count: number
  ) {
    const available = defenders.filter((player) => !positions.has(player.id));
    if (!available.length) return;
    const sorted = available
      .slice()
      .sort((a, b) => this.getAttribute(b, 'pace') - this.getAttribute(a, 'pace'));
    const direction = this.getAttackDirection(teamId);
    const midX = this.pitch.width / 2 - direction * 8;
    const midY = this.pitch.height / 2;

    sorted.slice(0, count).forEach((player, index) => {
      positions.set(player.id, {
        x: clamp(midX, 1, this.pitch.width - 1),
        y: clamp(midY + (index === 0 ? -8 : 8), 1, this.pitch.height - 1)
      });
    });
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
