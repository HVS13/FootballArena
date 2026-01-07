import { PitchDimensions, PlayerState, SimulationState, Vector2 } from '../domain/simulationTypes';

type TeamInstructions = Record<string, string>;

type DecisionStats = {
  pass?: boolean;
  shot?: boolean;
  goal?: boolean;
  foul?: boolean;
};

export type RuleDecision = {
  type: 'pass' | 'shot' | 'foul' | 'offside' | 'goal' | 'out';
  teamId: string;
  playerId: string;
  playerName: string;
  commentary: string;
  stats: DecisionStats;
  ballPosition?: Vector2;
  ballVelocity?: Vector2;
  restartType?: 'throw_in' | 'goal_kick' | 'corner' | 'free_kick' | 'penalty' | 'kick_off';
  restartPosition?: Vector2;
  restartTeamId?: string;
};

type RuleConfig = {
  pitch: PitchDimensions;
  homeTeamId: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const PRESSURE_DISTANCE = 6;

const average = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const getAttribute = (player: PlayerState, id: string, fallback = 50) => player.attributes?.[id] ?? fallback;

const hasPlaystyle = (player: PlayerState, id: string) =>
  player.playstyles?.includes(id) || player.playstylesPlus?.includes(id) || false;

const hasTrait = (player: PlayerState, id: string) => player.traits?.includes(id) || false;

const playstyleMultiplier = (player: PlayerState, id: string, standard: number, plus: number) => {
  if (player.playstylesPlus?.includes(id)) return plus;
  if (player.playstyles?.includes(id)) return standard;
  return 1;
};

const getFootBalance = (player: PlayerState) => {
  const left = player.leftFoot ?? 50;
  const right = player.rightFoot ?? 50;
  const high = Math.max(left, right, 1);
  const low = Math.min(left, right);
  return low / high;
};

export class RulesAgent {
  private pitch: PitchDimensions;
  private homeTeamId: string;

  constructor(config: RuleConfig) {
    this.pitch = config.pitch;
    this.homeTeamId = config.homeTeamId;
  }

  decideEvent(state: SimulationState, teamId: string, player: PlayerState, instructions?: TeamInstructions): RuleDecision {
    const foulDecision = this.maybeFoul(state, teamId);
    if (foulDecision) {
      return foulDecision;
    }

    const passSkill = average(
      getAttribute(player, 'passing'),
      getAttribute(player, 'vision'),
      getAttribute(player, 'technique'),
      getAttribute(player, 'decisions')
    );
    const shotSkill = average(
      getAttribute(player, 'finishing'),
      getAttribute(player, 'long_shots'),
      getAttribute(player, 'technique'),
      getAttribute(player, 'composure')
    );

    let passWeight = 0.55 + (passSkill / 100) * 0.25;
    let shotWeight = 0.22 + (shotSkill / 100) * 0.25;

    const shotsInstruction = instructions?.shots_from_distance;
    if (shotsInstruction === 'Encouraged') {
      shotWeight *= 1.15;
    } else if (shotsInstruction === 'Reduced') {
      shotWeight *= 0.85;
    }

    const passingInstruction = instructions?.passing_directness;
    if (passingInstruction === 'Much Shorter' || passingInstruction === 'Shorter') {
      passWeight *= 1.08;
    } else if (passingInstruction === 'Much More Direct') {
      passWeight *= 0.95;
    }

    if (hasPlaystyle(player, 'tiki_taka')) passWeight *= 1.08;
    if (hasPlaystyle(player, 'incisive_pass')) passWeight *= 1.05;
    if (hasPlaystyle(player, 'pinged_pass')) passWeight *= 1.05;
    if (hasPlaystyle(player, 'long_ball_pass')) passWeight *= 1.04;
    if (hasPlaystyle(player, 'whipped_pass')) passWeight *= 1.04;
    if (hasPlaystyle(player, 'inventive')) passWeight *= 1.04;

    if (hasPlaystyle(player, 'power_shot')) shotWeight *= 1.06;
    if (hasPlaystyle(player, 'finesse_shot')) shotWeight *= 1.06;
    if (hasPlaystyle(player, 'chip_shot')) shotWeight *= 1.04;
    if (hasPlaystyle(player, 'precision_header')) shotWeight *= 1.04;

    const totalWeight = passWeight + shotWeight;
    const roll = Math.random() * totalWeight;

    if (roll <= passWeight) {
      const receiver = this.pickForwardTeammate(state, teamId, player.id);
      return this.resolvePass(state, teamId, player, receiver, instructions);
    }

    return this.resolveShot(state, teamId, player, instructions);
  }

  decidePass(
    state: SimulationState,
    teamId: string,
    passer: PlayerState,
    receiver: PlayerState | null,
    instructions?: TeamInstructions
  ): RuleDecision {
    return this.resolvePass(state, teamId, passer, receiver, instructions);
  }

  decideShot(
    state: SimulationState,
    teamId: string,
    shooter: PlayerState,
    instructions?: TeamInstructions
  ): RuleDecision {
    return this.resolveShot(state, teamId, shooter, instructions);
  }

  isOffsidePosition(state: SimulationState, teamId: string, receiver: PlayerState) {
    return this.isOffside(state, teamId, receiver);
  }

  private resolvePass(
    state: SimulationState,
    teamId: string,
    passer: PlayerState,
    receiver: PlayerState | null,
    instructions?: TeamInstructions
  ): RuleDecision {
    const offside = receiver ? this.isOffside(state, teamId, receiver) : false;

    if (offside && receiver) {
      const restartPosition = this.clampPosition(receiver.position);
      const restartTeamId = this.getOpponentTeamId(state, teamId);
      return {
        type: 'offside',
        teamId,
        playerId: passer.id,
        playerName: passer.name,
        commentary: `Offside! ${receiver.name} strays beyond the line.`,
        stats: {},
        ballPosition: { ...receiver.position },
        ballVelocity: { x: 0, y: 0 },
        restartType: 'free_kick',
        restartPosition,
        restartTeamId
      };
    }

    const passSkill = average(
      getAttribute(passer, 'passing'),
      getAttribute(passer, 'vision'),
      getAttribute(passer, 'technique'),
      getAttribute(passer, 'decisions')
    );
    let passChance = 0.6 + (passSkill / 100) * 0.35;
    const pressure = this.getPressure(state, passer);
    const composure = getAttribute(passer, 'composure');
    const pressurePenalty = clamp(pressure * (0.4 - composure / 250), 0, 0.35);
    passChance *= 1 - pressurePenalty;
    passChance *= 1 - this.getFootPenalty(passer);
    passChance *= playstyleMultiplier(passer, 'press_proven', 1.02, 1.05);
    passChance *= playstyleMultiplier(passer, 'tiki_taka', 1.05, 1.1);
    passChance *= playstyleMultiplier(passer, 'incisive_pass', 1.04, 1.08);
    passChance *= playstyleMultiplier(passer, 'pinged_pass', 1.04, 1.08);
    passChance *= playstyleMultiplier(passer, 'long_ball_pass', 1.03, 1.06);

    const receiverPressure = receiver ? this.getPressure(state, receiver) : 0;
    const receivePenalty = clamp(receiverPressure * 0.2, 0, 0.2);
    passChance *= 1 - receivePenalty;

    const success = Math.random() < passChance;
    const target = receiver?.position ?? passer.position;
    const ballVelocity = success
      ? this.buildBallVelocity(state.ball.position, target, 10 + (passSkill / 100) * 8)
      : { x: 0, y: 0 };

    if (success) {
      return {
        type: 'pass',
        teamId,
        playerId: passer.id,
        playerName: passer.name,
        commentary: `${passer.name} finds a passing lane.`,
        stats: { pass: true },
        ballPosition: { ...passer.position },
        ballVelocity
      };
    }

    const outOfPlay = Math.random() < 0.25;
    const restartType = outOfPlay ? this.getOutOfPlayRestart(teamId, passer.position) : undefined;
    const restartPosition = restartType
      ? this.getRestartPosition(state, restartType, teamId, passer.position)
      : undefined;
    const restartTeamId = restartType ? this.getRestartTeamId(state, restartType, teamId) : undefined;
    const commentary = outOfPlay
      ? `${passer.name}'s pass runs out of play.`
      : `${passer.name}'s pass is intercepted.`;

    return {
      type: outOfPlay ? 'out' : 'pass',
      teamId,
      playerId: passer.id,
      playerName: passer.name,
      commentary,
      stats: {},
      ballPosition: { ...passer.position },
      ballVelocity: { x: 0, y: 0 },
      restartType,
      restartPosition,
      restartTeamId
    };
  }

  private resolveShot(
    state: SimulationState,
    teamId: string,
    shooter: PlayerState,
    instructions?: TeamInstructions
  ): RuleDecision {
    const shotSkill = average(
      getAttribute(shooter, 'finishing'),
      getAttribute(shooter, 'long_shots'),
      getAttribute(shooter, 'technique'),
      getAttribute(shooter, 'composure')
    );

    const goal = this.getGoalPosition(teamId);
    const distance = Math.hypot(goal.x - shooter.position.x, goal.y - shooter.position.y);
    const distanceFactor = clamp(1 - distance / (this.pitch.width * 0.9), 0.25, 1);

    let goalChance = (0.05 + (shotSkill / 100) * 0.25) * distanceFactor;
    goalChance *= playstyleMultiplier(shooter, 'power_shot', 1.08, 1.15);
    goalChance *= playstyleMultiplier(shooter, 'finesse_shot', 1.08, 1.15);
    goalChance *= playstyleMultiplier(shooter, 'chip_shot', 1.04, 1.08);
    goalChance *= playstyleMultiplier(shooter, 'precision_header', 1.05, 1.1);
    if (hasTrait(shooter, 'places_shots')) goalChance *= 1.05;
    if (hasTrait(shooter, 'shoots_with_power')) goalChance *= 1.04;
    if (hasTrait(shooter, 'curls_ball')) goalChance *= 1.03;

    const pressure = this.getPressure(state, shooter);
    const composure = getAttribute(shooter, 'composure');
    const pressurePenalty = clamp(pressure * (0.45 - composure / 220), 0, 0.4);
    goalChance *= 1 - pressurePenalty;
    goalChance *= 1 - this.getFootPenalty(shooter);

    let onTargetChance = clamp(0.4 + (shotSkill / 100) * 0.45, 0.4, 0.85) * (1 - pressurePenalty * 0.5);
    if (hasTrait(shooter, 'places_shots')) onTargetChance *= 1.05;
    if (hasTrait(shooter, 'shoots_with_power')) onTargetChance *= 0.97;
    if (hasTrait(shooter, 'curls_ball')) onTargetChance *= 1.02;

    const roll = Math.random();
    const ballVelocity = this.buildBallVelocity(state.ball.position, goal, 14 + (shotSkill / 100) * 10);

    if (roll < goalChance) {
      const restartTeamId = this.getOpponentTeamId(state, teamId);
      return {
        type: 'goal',
        teamId,
        playerId: shooter.id,
        playerName: shooter.name,
        commentary: `Goal! ${shooter.name} finishes for ${this.resolveTeamName(state, teamId)}.`,
        stats: { shot: true, goal: true },
        ballPosition: { ...shooter.position },
        ballVelocity,
        restartType: 'kick_off',
        restartPosition: this.getKickoffSpot(),
        restartTeamId
      };
    }

    if (roll < onTargetChance) {
      const restartPosition = this.getRestartPosition(state, 'corner', teamId, shooter.position);
      const restartTeamId = this.getRestartTeamId(state, 'corner', teamId);
      return {
        type: 'shot',
        teamId,
        playerId: shooter.id,
        playerName: shooter.name,
        commentary: `${shooter.name} forces a save.`,
        stats: { shot: true },
        ballPosition: { ...shooter.position },
        ballVelocity,
        restartType: 'corner',
        restartPosition,
        restartTeamId
      };
    }

    const restartPosition = this.getRestartPosition(state, 'goal_kick', teamId, shooter.position);
    const restartTeamId = this.getRestartTeamId(state, 'goal_kick', teamId);
    return {
      type: 'shot',
      teamId,
      playerId: shooter.id,
      playerName: shooter.name,
      commentary: `${shooter.name} shoots, but it is wide.`,
      stats: { shot: true },
      ballPosition: { ...shooter.position },
      ballVelocity: { x: 0, y: 0 },
      restartType: 'goal_kick',
      restartPosition,
      restartTeamId
    };
  }

  private maybeFoul(state: SimulationState, attackingTeamId: string): RuleDecision | null {
    const defender = this.pickClosestOpponent(state, attackingTeamId);
    if (!defender) return null;

    const aggression = getAttribute(defender, 'aggression');
    const tackling = getAttribute(defender, 'tackling');
    const dirtiness = getAttribute(defender, 'dirtiness');

    let foulChance = 0.02 + (aggression / 100) * 0.06 + (dirtiness / 100) * 0.06;
    foulChance -= (tackling / 100) * 0.02;
    foulChance *= playstyleMultiplier(defender, 'bruiser', 1.08, 1.15);
    foulChance *= playstyleMultiplier(defender, 'enforcer', 1.06, 1.12);
    foulChance *= playstyleMultiplier(defender, 'anticipate', 0.96, 0.9);

    if (Math.random() >= foulChance) {
      return null;
    }

    const foulPosition = { ...state.ball.position };
    const inBox = this.isInPenaltyArea(defender.teamId, foulPosition);

    const restartPosition = inBox
      ? this.getPenaltySpot(defender.teamId)
      : this.clampPosition(foulPosition);
    const restartTeamId = this.getOpponentTeamId(state, defender.teamId);

    return {
      type: 'foul',
      teamId: defender.teamId,
      playerId: defender.id,
      playerName: defender.name,
      commentary: inBox
        ? `Penalty! ${defender.name} brings down the attacker.`
        : `Foul by ${defender.name}. Free kick awarded.`,
      stats: { foul: true },
      ballPosition: foulPosition,
      ballVelocity: { x: 0, y: 0 },
      restartType: inBox ? 'penalty' : 'free_kick',
      restartPosition,
      restartTeamId
    };
  }

  private pickForwardTeammate(state: SimulationState, teamId: string, excludeId: string) {
    const direction = this.getAttackDirection(teamId);
    const teammates = state.players.filter((player) => player.teamId === teamId && player.id !== excludeId);
    if (!teammates.length) return null;

    const sorted = [...teammates].sort((a, b) => {
      const aAxis = this.getAttackAxis(a.position.x, direction);
      const bAxis = this.getAttackAxis(b.position.x, direction);
      return bAxis - aAxis;
    });

    return sorted[0];
  }

  private getPressure(state: SimulationState, player: PlayerState) {
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const opponent of state.players) {
      if (opponent.teamId === player.teamId) continue;
      const dx = opponent.position.x - player.position.x;
      const dy = opponent.position.y - player.position.y;
      let dist = Math.hypot(dx, dy);
      if (hasTrait(opponent, 'marks_opponent_tightly')) dist *= 0.85;
      if (hasTrait(opponent, 'dives_into_tackles')) dist *= 0.9;
      if (hasTrait(opponent, 'does_not_dive_into_tackles')) dist *= 1.05;
      if (dist < closestDistance) {
        closestDistance = dist;
      }
    }

    if (!Number.isFinite(closestDistance)) return 0;
    return clamp((PRESSURE_DISTANCE - closestDistance) / PRESSURE_DISTANCE, 0, 1);
  }

  private getFootPenalty(player: PlayerState) {
    const balance = getFootBalance(player);
    let penalty = clamp((1 - balance) * 0.12, 0, 0.12);
    if (hasTrait(player, 'avoids_using_weaker_foot')) penalty *= 1.3;
    if (hasTrait(player, 'attempts_to_develop_weaker_foot')) penalty *= 0.7;
    return clamp(penalty, 0, 0.18);
  }

  private pickClosestOpponent(state: SimulationState, teamId: string) {
    let closest: PlayerState | null = null;
    let distance = Number.POSITIVE_INFINITY;

    for (const player of state.players) {
      if (player.teamId === teamId) continue;
      const dx = player.position.x - state.ball.position.x;
      const dy = player.position.y - state.ball.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < distance) {
        distance = dist;
        closest = player;
      }
    }

    return closest;
  }

  private isOffside(state: SimulationState, teamId: string, receiver: PlayerState) {
    const direction = this.getAttackDirection(teamId);
    const receiverAxis = this.getAttackAxis(receiver.position.x, direction);
    const ballAxis = this.getAttackAxis(state.ball.position.x, direction);

    const defenders = state.players.filter((player) => player.teamId !== teamId);
    const defenderAxes = defenders
      .map((player) => this.getAttackAxis(player.position.x, direction))
      .sort((a, b) => b - a);

    const secondLastDefender = defenderAxes[1] ?? defenderAxes[0] ?? 0;
    const offsideLine = Math.max(ballAxis, secondLastDefender);

    return receiverAxis > offsideLine;
  }

  private getOutOfPlayRestart(attackingTeamId: string, position: Vector2) {
    const nearSideline = position.y <= 8 || position.y >= this.pitch.height - 8;
    if (nearSideline) return 'throw_in';

    const goalLine = this.getGoalPosition(attackingTeamId);
    const distanceToGoalLine = Math.abs(position.x - goalLine.x);
    if (distanceToGoalLine < 10) {
      return Math.random() < 0.7 ? 'goal_kick' : 'corner';
    }

    return 'throw_in';
  }

  private getRestartPosition(
    state: SimulationState,
    restartType: NonNullable<RuleDecision['restartType']>,
    attackingTeamId: string,
    position: Vector2
  ) {
    switch (restartType) {
      case 'throw_in':
        return this.getThrowInSpot(position);
      case 'corner':
        return this.getCornerSpot(attackingTeamId, position);
      case 'goal_kick':
        return this.getGoalKickSpot(state, attackingTeamId);
      case 'free_kick':
        return this.clampPosition(position);
      case 'penalty':
        return this.getPenaltySpot(this.getOpponentTeamId(state, attackingTeamId));
      case 'kick_off':
        return this.getKickoffSpot();
      default:
        return this.clampPosition(position);
    }
  }

  private getRestartTeamId(
    state: SimulationState,
    restartType: NonNullable<RuleDecision['restartType']>,
    attackingTeamId: string
  ) {
    const opponent = this.getOpponentTeamId(state, attackingTeamId);
    switch (restartType) {
      case 'corner':
        return attackingTeamId;
      case 'goal_kick':
      case 'throw_in':
      case 'free_kick':
      case 'penalty':
      case 'kick_off':
      default:
        return opponent;
    }
  }

  private isInPenaltyArea(defendingTeamId: string, position: Vector2) {
    const boxDepth = 16.5;
    const boxHalfWidth = 20.16;
    const goalX = defendingTeamId === this.homeTeamId ? 0 : this.pitch.width;

    const withinX = defendingTeamId === this.homeTeamId
      ? position.x <= goalX + boxDepth
      : position.x >= goalX - boxDepth;
    const withinY = Math.abs(position.y - this.pitch.height / 2) <= boxHalfWidth;

    return withinX && withinY;
  }

  private getGoalPosition(teamId: string) {
    const attackRight = teamId === this.homeTeamId;
    return {
      x: attackRight ? this.pitch.width : 0,
      y: this.pitch.height / 2
    };
  }

  private getPenaltySpot(defendingTeamId: string) {
    const goalX = this.getDefendingGoalX(defendingTeamId);
    const offset = defendingTeamId === this.homeTeamId ? 11 : -11;
    return {
      x: clamp(goalX + offset, 0, this.pitch.width),
      y: this.pitch.height / 2
    };
  }

  private getGoalKickSpot(state: SimulationState, attackingTeamId: string) {
    const defendingTeamId = this.getOpponentTeamId(state, attackingTeamId);
    const goalX = this.getDefendingGoalX(defendingTeamId);
    const offset = defendingTeamId === this.homeTeamId ? 5.5 : -5.5;
    return {
      x: clamp(goalX + offset, 0, this.pitch.width),
      y: this.pitch.height / 2
    };
  }

  private getCornerSpot(attackingTeamId: string, position: Vector2) {
    const goalX = this.getAttackingGoalX(attackingTeamId);
    const x = goalX === 0 ? 0.5 : this.pitch.width - 0.5;
    const y = position.y < this.pitch.height / 2 ? 0.5 : this.pitch.height - 0.5;
    return { x, y };
  }

  private getThrowInSpot(position: Vector2) {
    const x = clamp(position.x, 1, this.pitch.width - 1);
    const y = position.y < this.pitch.height / 2 ? 0.5 : this.pitch.height - 0.5;
    return { x, y };
  }

  private getKickoffSpot() {
    return { x: this.pitch.width / 2, y: this.pitch.height / 2 };
  }

  private getAttackDirection(teamId: string) {
    return teamId === this.homeTeamId ? 1 : -1;
  }

  private getAttackAxis(x: number, direction: number) {
    return direction === 1 ? x : this.pitch.width - x;
  }

  private getAttackingGoalX(teamId: string) {
    return teamId === this.homeTeamId ? this.pitch.width : 0;
  }

  private getDefendingGoalX(teamId: string) {
    return teamId === this.homeTeamId ? 0 : this.pitch.width;
  }

  private getOpponentTeamId(state: SimulationState, teamId: string) {
    return state.teams.find((team) => team.id !== teamId)?.id ?? teamId;
  }

  private clampPosition(position: Vector2) {
    return {
      x: clamp(position.x, 0.5, this.pitch.width - 0.5),
      y: clamp(position.y, 0.5, this.pitch.height - 0.5)
    };
  }

  private buildBallVelocity(from: Vector2, to: Vector2, speed: number) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: (dx / length) * speed,
      y: (dy / length) * speed
    };
  }

  private resolveTeamName(state: SimulationState, teamId: string) {
    return state.teams.find((team) => team.id === teamId)?.name ?? teamId;
  }
}
