import { DEFAULT_PITCH, PitchDimensions, RenderState, SimulationState, TeamState, Vector2 } from '../domain/simulationTypes';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { CommentaryLine, MatchStats } from '../domain/matchTypes';
import { PlayerAttributes } from '../domain/types';
import { TeamSetupState } from '../domain/teamSetupTypes';
import { getRoleDutyBehavior, RoleBehavior } from '../data/roleBehavior';
import { getMatchImportanceWeight } from '../data/matchImportance';
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

const MAX_SUBS = 5;
const MAX_WINDOWS = 3;
const WINDOW_GRACE_SECONDS = 30;
const CONTROL_DISTANCE = 2.2;
const CONTROL_SPEED = 2.4;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  { id: 'home', name: 'Home', color: '#f43f5e' },
  { id: 'away', name: 'Away', color: '#38bdf8' }
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
    color: team.color
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

      let anchorY = this.applyWidthBias(base.y, widthBias, midY);

      if (inPossession) {
        const roamPull = clamp(behavior.roam, 0, 1);
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
      } else if (possessionTeamId) {
        const pressBias = this.getPressBias(instructions);
        const pressTrigger = shape?.pressTrigger ?? 1;
        const pressPull = clamp((behavior.press + pressBias) * pressTrigger, 0, 1.1);
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
    const wantsShort = goalKickStyle === 'Short' || instructions?.short_goalkeeper_distribution === 'Yes';
    const wantsLong = goalKickStyle === 'Long';

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
      pool = withDepth.filter((entry) => entry.depth >= 0.6);
      if (!pool.length) pool = withDepth;
    } else if (wantsShort) {
      pool = withDepth.filter((entry) => entry.depth < 0.5);
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

    if (this.hasPlaystyle(defender, 'anticipate')) tackleChance *= 1.08;
    if (this.hasPlaystyle(defender, 'jockey')) tackleChance *= 1.05;
    if (this.hasPlaystyle(defender, 'bruiser')) tackleChance *= 1.06;
    if (this.hasPlaystyle(defender, 'enforcer')) tackleChance *= 1.04;
    if (this.hasTrait(defender, 'dives_into_tackles')) tackleChance *= 1.08;
    if (this.hasTrait(defender, 'does_not_dive_into_tackles')) tackleChance *= 0.9;
    if (this.hasPlaystyle(possessor, 'press_proven')) tackleChance *= 0.95;
    if (this.hasPlaystyle(possessor, 'rapid')) tackleChance *= 0.96;
    if (this.hasPlaystyle(possessor, 'technical')) tackleChance *= 0.96;

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
      const decision = this.rules.decideShot(this.state, this.possession.teamId, possessor, instructions);
      this.applyRuleDecision(decision);
      this.actionCooldown = this.getActionCooldown(possessor, instructions, decision.type, pressure);
      return;
    }

    if (passTarget) {
      const decision = this.rules.decidePass(this.state, this.possession.teamId, possessor, passTarget, instructions);
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
    const moraleFactor = this.getMoraleFactor(player);
    const fatigue = player.fatigue ?? 0;

    const dribblingInstruction = instructions?.dribbling;
    if (dribblingInstruction === 'Encouraged') {
      carryChance += 0.08;
    } else if (dribblingInstruction === 'Reduced') {
      carryChance -= 0.08;
    }

    if (this.hasPlaystyle(player, 'rapid')) carryChance += 0.06;
    if (this.hasPlaystyle(player, 'technical')) carryChance += 0.05;
    if (this.hasPlaystyle(player, 'press_proven')) carryChance += 0.04;
    if (this.hasPlaystyle(player, 'trickster')) carryChance += 0.04;
    if (this.hasTrait(player, 'runs_with_ball_often')) carryChance += 0.12;
    if (this.hasTrait(player, 'runs_with_ball_rarely')) carryChance -= 0.18;
    if (this.hasTrait(player, 'knocks_ball_past_opponent')) carryChance += 0.06;
    if (this.hasTrait(player, 'tries_to_play_way_out_of_trouble')) carryChance += 0.05;

    carryChance += roleBehavior.carry * 0.18;
    carryChance += roleBehavior.risk * 0.08;
    carryChance -= roleBehavior.hold * 0.08;

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

    if (this.hasPlaystyle(player, 'power_shot')) desire += 0.05;
    if (this.hasPlaystyle(player, 'finesse_shot')) desire += 0.05;
    if (this.hasPlaystyle(player, 'chip_shot')) desire += 0.03;
    if (this.hasTrait(player, 'shoots_with_power')) desire += 0.04;
    if (this.hasTrait(player, 'places_shots')) desire += 0.03;
    if (this.hasTrait(player, 'tries_first_time_shots') && distance <= 18) desire += 0.05;
    if (this.hasTrait(player, 'looks_for_pass_rather_than_attempting_to_score')) desire -= 0.1;
    if (this.hasTrait(player, 'penalty_box_player') && distance <= 12) desire += 0.06;

    desire += roleBehavior.shoot * 0.18;
    desire += roleBehavior.risk * 0.08;
    desire -= roleBehavior.pass * 0.08;
    desire -= roleBehavior.hold * 0.05;
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
    const creativeBias = this.getCreativeFreedomBias(instructions);
    const riskBias = roleBehavior.risk + creativeBias;
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

        if (prefersShort && distance > desiredDistance) {
          distanceScore *= 0.85;
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

        let score = 0.45 * distanceScore + 0.25 * opennessScore + 0.2 * forwardScore + sideBonus;
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
    const creativeBias = this.getCreativeFreedomBias(instructions);
    const fatigue = passer.fatigue ?? 0;

    if (this.hasPlaystyle(passer, 'tiki_taka')) desired -= 3;
    if (this.hasPlaystyle(passer, 'long_ball_pass')) desired += 4;
    if (this.hasPlaystyle(passer, 'pinged_pass')) desired += 2;
    if (this.hasPlaystyle(passer, 'incisive_pass')) desired += 2;
    if (this.hasTrait(passer, 'plays_short_simple_passes')) desired -= 4;
    if (this.hasTrait(passer, 'tries_long_range_passes')) desired += 6;
    if (this.hasTrait(passer, 'tries_killer_balls_often')) desired += 4;

    desired += (roleBehavior.risk + creativeBias) * 6;
    desired += roleBehavior.pass * 4;
    desired -= roleBehavior.hold * 2;
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

  private getOpponentTeamId(teamId: string) {
    return this.state.teams.find((team) => team.id !== teamId)?.id ?? teamId;
  }

  private getRoleBehavior(player: typeof this.state.players[number]): RoleBehavior {
    return getRoleDutyBehavior(player.roleId, player.dutyId);
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
    if (decision.stats.pass) {
      this.statsAgent.recordPass(decision.teamId);
    }
    if (decision.stats.shot) {
      this.statsAgent.recordShot(decision.teamId);
    }
    if (decision.stats.goal) {
      this.statsAgent.recordGoal(decision.teamId);
    }
    if (decision.stats.foul) {
      this.statsAgent.recordFoul(decision.teamId);
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
    this.commentaryAgent.addLine(this.state.time, decision.commentary);

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

  private alignCornerPositions(restart: RestartState) {
    const positions = new Map<string, Vector2>();
    if (restart.takerId) positions.set(restart.takerId, restart.position);
    const attackingTeamId = restart.teamId;
    const defendingTeamId = this.getOpponentTeamId(attackingTeamId);
    const goal = this.getGoalPosition(attackingTeamId);
    const midY = this.pitch.height / 2;
    const cornerSide = restart.position.y < midY ? -1 : 1;
    const boxX = goal.x === 0 ? 6 : this.pitch.width - 6;
    const penaltyX = goal.x === 0 ? 11 : this.pitch.width - 11;
    const edgeX = goal.x === 0 ? 18 : this.pitch.width - 18;

    const attackTargets = [
      { x: boxX, y: midY + cornerSide * 5 },
      { x: boxX, y: midY - cornerSide * 3 },
      { x: penaltyX, y: midY },
      { x: edgeX, y: midY + cornerSide * 8 }
    ];

    const attackers = this.getActiveTeamPlayers(attackingTeamId).filter(
      (player) => player.id !== restart.takerId && !this.isGoalkeeperRole(player)
    );
    const sortedAttackers = attackers
      .slice()
      .sort((a, b) => this.getAerialScore(b) - this.getAerialScore(a));

    attackTargets.forEach((pos, index) => {
      const player = sortedAttackers[index];
      if (player) {
        positions.set(player.id, pos);
      }
    });

    const defenders = this.getActiveTeamPlayers(defendingTeamId).filter(
      (player) => !this.isGoalkeeperRole(player)
    );
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
    const target = this.pickBestAerialTarget(restart.teamId, new Set([taker.id]));
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
      { ignoreOffside: true, forceAerial: true, setPiece: 'corner' }
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
    const goal = this.getGoalPosition(restart.teamId);
    const distance = Math.hypot(goal.x - restart.position.x, goal.y - restart.position.y);
    const wideAngle = Math.abs(restart.position.y - this.pitch.height / 2) > 18;
    const setPieceSkill = this.getAttribute(taker, 'free_kick_taking');
    const directChance = distance < 30
      ? 0.15 + (setPieceSkill / 100) * 0.45
      : 0.05 + (setPieceSkill / 100) * 0.1;
    const shouldShoot = !wideAngle && Math.random() < directChance;

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

    const target = this.pickBestAerialTarget(restart.teamId, new Set([taker.id]));
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
      { ignoreOffside: true, forceAerial: true, setPiece: 'free_kick' }
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
    const target = this.pickThrowInTarget(restart.teamId, taker);
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
      const score = this.getAttribute(player, attributeId);
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

  private pickThrowInTarget(teamId: string, taker: typeof this.state.players[number]) {
    const candidates = this.getActiveTeamPlayers(teamId).filter(
      (player) => player.id !== taker.id && !this.isGoalkeeperRole(player)
    );
    if (!candidates.length) return null;

    const direction = this.getAttackDirection(teamId);
    const ballAxis = this.getAttackAxis(taker.position.x, direction);
    const longThrowSkill = this.getAttribute(taker, 'long_throws');
    const hasLongThrow =
      longThrowSkill >= 65 ||
      this.hasTrait(taker, 'possesses_long_flat_throw') ||
      this.hasTrait(taker, 'uses_long_throw_to_start_counter_attacks') ||
      this.hasPlaystyle(taker, 'long_throw');

    if (hasLongThrow && ballAxis > this.pitch.width * 0.45) {
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
