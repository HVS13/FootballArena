import { DEFAULT_PITCH, PitchDimensions, RenderState, SimulationState, TeamState, Vector2 } from '../domain/simulationTypes';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { CommentaryLine, MatchStats } from '../domain/matchTypes';
import { PlayerAttributes } from '../domain/types';
import { TeamSetupState } from '../domain/teamSetupTypes';
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
  attributes?: PlayerAttributes;
  playstyles?: string[];
  playstylesPlus?: string[];
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
    attributes: player.attributes ? { ...player.attributes } : undefined,
    playstyles: player.playstyles ? [...player.playstyles] : undefined,
    playstylesPlus: player.playstylesPlus ? [...player.playstylesPlus] : undefined
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
      attributes: {},
      playstyles: [],
      playstylesPlus: []
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
        teamId: team.id,
        position: { ...position },
        velocity: { x: 0, y: 0 },
        homePosition: { ...position },
        targetPosition: { ...position },
        targetTimer: Math.random() * 3,
        radius: 1.2,
        attributes: rosterPlayer?.attributes ?? {},
        playstyles: rosterPlayer?.playstyles ?? [],
        playstylesPlus: rosterPlayer?.playstylesPlus ?? []
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
          attributes: player.attributes,
          playstyles: player.playstyles ?? [],
          playstylesPlus: player.playstylesPlus ?? []
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
        attributes: player.attributes,
        playstyles: player.playstyles ?? [],
        playstylesPlus: player.playstylesPlus ?? []
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

  constructor(config: EngineConfig = {}) {
    this.pitch = config.pitch ?? DEFAULT_PITCH;
    this.tickRate = config.tickRate ?? 60;
    this.environment = config.environment ?? DEFAULT_ENVIRONMENT;
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
      homeTeamId: this.state.teams[0]?.id ?? 'home'
    });
    this.loopState = { running: false, paused: false, speed: 2 };
    this.onRender = config.onRender;
    this.onMatchUpdate = config.onMatchUpdate;
    this.statsAgent = new StatsAgent(this.state.teams.map((team) => team.id));
    this.commentaryAgent = new CommentaryAgent();
    this.actionCooldown = 0;
    this.substitutionTrackers = buildSubstitutionTrackers(this.state, this.teamSetup);
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
      position: { ...offPlayer.position },
      velocity: { x: 0, y: 0 },
      homePosition: { ...offPlayer.homePosition },
      targetPosition: { ...offPlayer.homePosition },
      targetTimer: Math.random() * 3,
      attributes: onMeta?.attributes ?? offPlayer.attributes,
      playstyles: onMeta?.playstyles ?? offPlayer.playstyles,
      playstylesPlus: onMeta?.playstylesPlus ?? offPlayer.playstylesPlus
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
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    if (this.actionCooldown > 0) return;

    this.handlePossessionAction();
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

  private handlePossessionAction() {
    if (!this.possession) return;
    const possessor = this.state.players.find((player) => player.id === this.possession?.playerId);
    if (!possessor) {
      this.possession = null;
      return;
    }

    const instructions = this.getTeamInstructions(this.possession.teamId);
    const pressure = this.getPressureOnPlayer(possessor);
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

    const tempo = instructions?.tempo;
    if (tempo === 'Higher') {
      base *= 0.75;
    } else if (tempo === 'Lower') {
      base *= 1.2;
    }

    if (actionType === 'shot') base += 0.4;
    if (actionType === 'pass') base += 0.15;
    if (actionType === 'carry') base += 0.2;

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

    const shotsInstruction = instructions?.shots_from_distance;
    const maxRange =
      shotsInstruction === 'Encouraged' ? 32 : shotsInstruction === 'Reduced' ? 22 : 26;
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
      (player) => player.teamId === teamId && player.id !== passer.id
    );
    if (!candidates.length) return null;

    const desiredDistance = this.getDesiredPassDistance(passer, instructions);
    const direction = this.getAttackDirection(teamId);
    const progressThrough = instructions?.progress_through;
    const passerVision = this.getAttribute(passer, 'vision');
    const passerPassing = this.getAttribute(passer, 'passing');
    const rangeFactor = 0.7 + (passerPassing + passerVision) / 200;

    const scored = candidates
      .map((receiver) => {
        const dx = receiver.position.x - passer.position.x;
        const dy = receiver.position.y - passer.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 3) return null;

        const forward = dx * direction;
        const distanceScore = 1 - clamp(Math.abs(distance - desiredDistance) / (desiredDistance * 0.9), 0, 1);
        const forwardScore = clamp(forward / (desiredDistance * 1.3), -0.4, 1);
        const openness = this.getOpponentDistance(receiver.position, teamId);
        const opennessScore = clamp(openness / 10, 0, 1);

        let sideBonus = 0;
        if (progressThrough === 'Left' && receiver.position.y < this.pitch.height / 2) sideBonus = 0.12;
        if (progressThrough === 'Right' && receiver.position.y > this.pitch.height / 2) sideBonus = 0.12;

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

    if (this.hasPlaystyle(passer, 'tiki_taka')) desired -= 3;
    if (this.hasPlaystyle(passer, 'long_ball_pass')) desired += 4;
    if (this.hasPlaystyle(passer, 'pinged_pass')) desired += 2;
    if (this.hasPlaystyle(passer, 'incisive_pass')) desired += 2;

    return clamp(desired, 8, 36);
  }

  private getOpponentDistance(position: Vector2, teamId: string) {
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.state.players) {
      if (player.teamId === teamId) continue;
      const dx = player.position.x - position.x;
      const dy = player.position.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
      }
    }
    return closestDistance;
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

  private getAttribute(player: typeof this.state.players[number], id: string, fallback = 50) {
    return player.attributes?.[id] ?? fallback;
  }

  private hasPlaystyle(player: typeof this.state.players[number], id: string) {
    return Boolean(player.playstyles?.includes(id) || player.playstylesPlus?.includes(id));
  }

  private findNearestPlayerToBall() {
    let closest: typeof this.state.players[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const player of this.state.players) {
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

    if (decision.type === 'goal') {
      this.resetAfterGoal();
    }

    if (decision.restartPosition && decision.restartType && decision.restartTeamId) {
      this.startRestart(decision);
    }

    if (decision.type === 'pass' || decision.type === 'shot' || decision.type === 'out' || decision.type === 'offside' || decision.type === 'foul' || decision.type === 'goal') {
      this.possession = null;
      this.actionCooldown = 0;
    }
  }

  private resetAfterGoal() {
    this.state.ball.position = { x: this.pitch.width / 2, y: this.pitch.height / 2 };
    this.state.ball.velocity = { x: 0, y: 0 };
    this.state.players.forEach((player) => {
      player.position = { ...player.homePosition };
      player.velocity = { x: 0, y: 0 };
      player.targetPosition = { ...player.homePosition };
    });
  }

  private startRestart(decision: RuleDecision) {
    const restartPosition = decision.restartPosition;
    const restartTeamId = decision.restartTeamId;
    const restartType = decision.restartType;
    if (!restartPosition || !restartTeamId || !restartType) return;

    const taker = this.findNearestPlayer(restartTeamId, restartPosition);
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
    this.restartState = null;
    this.commentaryAgent.addLine(this.state.time, 'Play resumes.');
  }

  private alignPlayersForRestart() {
    if (!this.restartState) return;
    const { teamId, position, takerId, remaining } = this.restartState;
    const holdTimer = remaining + 0.5;

    this.state.players.forEach((player) => {
      if (player.teamId === teamId && player.id === takerId) {
        player.targetPosition = { ...position };
      } else {
        player.targetPosition = { ...player.homePosition };
      }
      player.targetTimer = Math.max(player.targetTimer, holdTimer);
    });
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
      if (player.teamId !== teamId) continue;
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

  private requiresNewWindow(tracker: SubstitutionTracker) {
    if (tracker.lastWindowStart === null) return true;
    return this.state.time - tracker.lastWindowStart > WINDOW_GRACE_SECONDS;
  }

  private resolveTeamName(teamId: string) {
    return this.state.teams.find((team) => team.id === teamId)?.name ?? teamId;
  }
}
