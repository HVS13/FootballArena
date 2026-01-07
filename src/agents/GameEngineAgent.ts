import { DEFAULT_PITCH, PitchDimensions, RenderState, SimulationState, TeamState } from '../domain/simulationTypes';
import { CommentaryLine, MatchStats } from '../domain/matchTypes';
import { TeamSetupState } from '../domain/teamSetupTypes';
import { CommentaryAgent } from './CommentaryAgent';
import { PhysicsAgent } from './PhysicsAgent';
import { StatsAgent } from './StatsAgent';

type EngineConfig = {
  pitch?: PitchDimensions;
  tickRate?: number;
  onRender?: (state: RenderState) => void;
  teamSetup?: TeamSetupState;
  onMatchUpdate?: (stats: MatchStats, commentary: CommentaryLine[]) => void;
};

type LoopState = {
  running: boolean;
  paused: boolean;
  speed: number;
};

type SubstitutionTracker = {
  used: number;
  windowsUsed: number;
  lastWindowStart: number | null;
  bench: Set<string>;
  lineup: Set<string>;
  rosterNames: Map<string, string>;
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

const MAX_SUBS = 5;
const MAX_WINDOWS = 3;
const WINDOW_GRACE_SECONDS = 30;

const cloneState = (state: SimulationState): SimulationState => ({
  time: state.time,
  teams: state.teams.map((team) => ({ ...team })),
  players: state.players.map((player) => ({
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
    homePosition: { ...player.homePosition },
    targetPosition: { ...player.targetPosition }
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
      radius: 1.2
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
        radius: 1.2
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

const createRosterNameMap = (setup: TeamSetupState | null, state: SimulationState) => {
  const rosterNames: Record<string, Map<string, string>> = {};
  setup?.teams.forEach((team) => {
    const roster = new Map<string, string>();
    team.roster.forEach((player) => {
      if (player.id) roster.set(player.id, player.name);
    });
    rosterNames[team.id] = roster;
  });

  state.players.forEach((player) => {
    if (!rosterNames[player.teamId]) {
      rosterNames[player.teamId] = new Map<string, string>();
    }
    if (!rosterNames[player.teamId].has(player.id)) {
      rosterNames[player.teamId].set(player.id, player.name);
    }
  });

  return rosterNames;
};

const buildSubstitutionTrackers = (state: SimulationState, setup: TeamSetupState | null) => {
  const rosterNames = createRosterNameMap(setup, state);
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
      rosterNames: rosterNames[team.id] ?? new Map<string, string>()
    };
  });

  return trackers;
};

export class GameEngineAgent {
  private pitch: PitchDimensions;
  private tickRate: number;
  private physics: PhysicsAgent;
  private state: SimulationState;
  private prevState: SimulationState;
  private loopState: LoopState;
  private accumulator = 0;
  private lastTime = 0;
  private onRender?: (state: RenderState) => void;
  private onMatchUpdate?: (stats: MatchStats, commentary: CommentaryLine[]) => void;
  private statsAgent: StatsAgent;
  private commentaryAgent: CommentaryAgent;
  private eventTimer = 0;
  private substitutionTrackers: Record<string, SubstitutionTracker>;

  constructor(config: EngineConfig = {}) {
    this.pitch = config.pitch ?? DEFAULT_PITCH;
    this.tickRate = config.tickRate ?? 60;
    this.physics = new PhysicsAgent({
      pitchWidth: this.pitch.width,
      pitchHeight: this.pitch.height
    });
    this.state = config.teamSetup ? buildStateFromSetup(this.pitch, config.teamSetup) : buildDefaultState(this.pitch);
    this.prevState = cloneState(this.state);
    this.loopState = { running: false, paused: false, speed: 2 };
    this.onRender = config.onRender;
    this.onMatchUpdate = config.onMatchUpdate;
    this.statsAgent = new StatsAgent(this.state.teams.map((team) => team.id));
    this.commentaryAgent = new CommentaryAgent();
    this.eventTimer = this.rollEventDelay();
    this.substitutionTrackers = buildSubstitutionTrackers(this.state, config.teamSetup ?? null);
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
    const onName = tracker.rosterNames.get(onPlayerId) ?? `Player ${onPlayerId}`;
    const incomingPlayer = {
      ...offPlayer,
      id: onPlayerId,
      name: onName,
      position: { ...offPlayer.position },
      velocity: { x: 0, y: 0 },
      homePosition: { ...offPlayer.homePosition },
      targetPosition: { ...offPlayer.homePosition },
      targetTimer: Math.random() * 3
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

    const offName = tracker.rosterNames.get(offPlayerId) ?? offPlayer.name;
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
    this.onMatchUpdate?.(this.statsAgent.getStats(), this.commentaryAgent.getLines());
    requestAnimationFrame(this.loop);
  };

  private rollEventDelay() {
    return 2 + Math.random() * 4;
  }

  private tickEvents(dt: number) {
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = this.rollEventDelay();
    this.triggerRandomEvent();
  }

  private triggerRandomEvent() {
    const fallbackTeam = this.state.teams[Math.floor(Math.random() * this.state.teams.length)];
    const teamId = this.resolvePossessingTeam() ?? fallbackTeam?.id;
    if (!teamId) return;
    const player = this.pickRandomPlayer(teamId);
    if (!player) return;

    const roll = Math.random();
    if (roll < 0.6) {
      this.statsAgent.recordPass(teamId);
      this.commentaryAgent.addLine(this.state.time, `${player.name} plays a short pass.`);
      return;
    }

    if (roll < 0.85) {
      this.statsAgent.recordShot(teamId);
      if (Math.random() < 0.2) {
        this.statsAgent.recordGoal(teamId);
        this.commentaryAgent.addLine(this.state.time, `Goal! ${player.name} scores for ${this.resolveTeamName(teamId)}.`);
        this.resetAfterGoal();
      } else {
        this.commentaryAgent.addLine(this.state.time, `${player.name} shoots, but it is off target.`);
      }
      return;
    }

    this.statsAgent.recordFoul(teamId);
    this.commentaryAgent.addLine(this.state.time, `Foul by ${player.name}. Free kick awarded.`);
  }

  private resolvePossessingTeam() {
    let closestTeam: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const player of this.state.players) {
      const dx = player.position.x - this.state.ball.position.x;
      const dy = player.position.y - this.state.ball.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestTeam = player.teamId;
      }
    }

    return closestTeam;
  }

  private pickRandomPlayer(teamId: string) {
    const candidates = this.state.players.filter((player) => player.teamId === teamId);
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
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

  private requiresNewWindow(tracker: SubstitutionTracker) {
    if (tracker.lastWindowStart === null) return true;
    return this.state.time - tracker.lastWindowStart > WINDOW_GRACE_SECONDS;
  }

  private resolveTeamName(teamId: string) {
    return this.state.teams.find((team) => team.id === teamId)?.name ?? teamId;
  }
}
