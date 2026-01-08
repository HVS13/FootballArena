import { EnvironmentState, DEFAULT_ENVIRONMENT } from '../domain/environmentTypes';
import { PitchDimensions, PlayerState, SimulationState, Vector2 } from '../domain/simulationTypes';

type TeamInstructions = Record<string, string>;

type DecisionStats = {
  pass?: boolean;
  shot?: boolean;
  goal?: boolean;
  foul?: boolean;
};

type DecisionContext = {
  ignoreOffside?: boolean;
  forceAerial?: boolean;
  setPiece?: 'corner' | 'free_kick' | 'throw_in' | 'goal_kick' | 'kick_off' | 'penalty';
};

export type RuleDecision = {
  type: 'pass' | 'shot' | 'foul' | 'offside' | 'goal' | 'out';
  teamId: string;
  playerId: string;
  playerName: string;
  commentary: string;
  stats: DecisionStats;
  advantage?: boolean;
  card?: 'yellow' | 'red';
  ballPosition?: Vector2;
  ballVelocity?: Vector2;
  restartType?: 'throw_in' | 'goal_kick' | 'corner' | 'free_kick' | 'penalty' | 'kick_off';
  restartPosition?: Vector2;
  restartTeamId?: string;
  passRisk?: number;
  chanceQuality?: 'big' | 'normal';
  turnoverPlayerId?: string;
  turnoverTeamId?: string;
  turnoverReason?: 'interception' | 'miscontrol' | 'tackle';
};

type RuleConfig = {
  pitch: PitchDimensions;
  homeTeamId: string;
  matchImportance?: number;
  environment?: EnvironmentState;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const PRESSURE_DISTANCE = 6;

const average = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const getAttribute = (player: PlayerState, id: string, fallback = 50) => player.attributes?.[id] ?? fallback;

const hasPlaystyle = (player: PlayerState, id: string) =>
  player.playstyles?.includes(id) || player.playstylesPlus?.includes(id) || false;

const hasTrait = (player: PlayerState, id: string) => player.traits?.includes(id) || false;

const isAvailable = (player: PlayerState) => !player.discipline?.red;

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
  private matchImportance: number;
  private environment: EnvironmentState;

  constructor(config: RuleConfig) {
    this.pitch = config.pitch;
    this.homeTeamId = config.homeTeamId;
    this.matchImportance = config.matchImportance ?? 1;
    this.environment = config.environment ?? DEFAULT_ENVIRONMENT;
  }

  decideEvent(
    state: SimulationState,
    teamId: string,
    player: PlayerState,
    instructions?: TeamInstructions,
    context?: DecisionContext
  ): RuleDecision {
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
      return this.resolvePass(state, teamId, player, receiver, instructions, context);
    }

    return this.resolveShot(state, teamId, player, instructions, context);
  }

  decidePass(
    state: SimulationState,
    teamId: string,
    passer: PlayerState,
    receiver: PlayerState | null,
    instructions?: TeamInstructions,
    context?: DecisionContext
  ): RuleDecision {
    return this.resolvePass(state, teamId, passer, receiver, instructions, context);
  }

  decideShot(
    state: SimulationState,
    teamId: string,
    shooter: PlayerState,
    instructions?: TeamInstructions,
    context?: DecisionContext
  ): RuleDecision {
    return this.resolveShot(state, teamId, shooter, instructions, context);
  }

  resolveFoul(state: SimulationState, offender: PlayerState, position: Vector2): RuleDecision {
    const attackingTeamId = this.getOpponentTeamId(state, offender.teamId);
    return this.buildFoulDecision(state, offender, position, attackingTeamId);
  }

  isOffsidePosition(state: SimulationState, teamId: string, receiver: PlayerState) {
    return this.isOffside(state, teamId, receiver);
  }

  private resolvePass(
    state: SimulationState,
    teamId: string,
    passer: PlayerState,
    receiver: PlayerState | null,
    instructions?: TeamInstructions,
    context?: DecisionContext
  ): RuleDecision {
    const offside = receiver && !context?.ignoreOffside ? this.isOffside(state, teamId, receiver) : false;

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
    const consistency = getAttribute(passer, 'consistency');
    const importantMatches = getAttribute(passer, 'important_matches');
    const moraleFactor = this.getMoraleFactor(passer);
    const fatigue = clamp(passer.fatigue ?? 0, 0, 1);
    const pressurePenalty = clamp(pressure * (0.4 - composure / 250) * this.matchImportance, 0, 0.45);
    const pressureResilience = clamp(1 - (importantMatches / 100) * 0.12, 0.8, 1);
    passChance *= 1 - pressurePenalty * pressureResilience;
    passChance *= 0.9 + (consistency / 100) * 0.2;
    passChance *= moraleFactor;
    passChance *= 1 - fatigue * 0.25;
    passChance *= 1 - this.getFootPenalty(passer);
    passChance *= playstyleMultiplier(passer, 'press_proven', 1.02, 1.05);
    passChance *= playstyleMultiplier(passer, 'tiki_taka', 1.05, 1.1);
    passChance *= playstyleMultiplier(passer, 'incisive_pass', 1.04, 1.08);
    passChance *= playstyleMultiplier(passer, 'pinged_pass', 1.04, 1.08);
    passChance *= playstyleMultiplier(passer, 'long_ball_pass', 1.03, 1.06);

    const receiverPressure = receiver ? this.getPressure(state, receiver) : 0;
    const receivePenalty = clamp(receiverPressure * 0.2, 0, 0.2);
    passChance *= 1 - receivePenalty;

    const passRisk = clamp(1 - passChance, 0, 1);
    const target = receiver?.position ?? passer.position;
    const interceptCandidate = receiver
      ? this.getInterceptionCandidate(state, passer, receiver, passChance)
      : null;
    const intercepted =
      interceptCandidate ? Math.random() < interceptCandidate.chance : false;
    const success = Math.random() < passChance;
    const passTarget =
      success && receiver
        ? this.applyTargetScatter(
            receiver.position,
            this.getPassScatter(passer, receiver, instructions, passChance),
            7
          )
        : target;
    const ballVelocity =
      success && !intercepted
        ? this.buildBallVelocity(state.ball.position, passTarget, 10 + (passSkill / 100) * 8)
        : { x: 0, y: 0 };

    if (intercepted && interceptCandidate) {
      return {
        type: 'pass',
        teamId,
        playerId: passer.id,
        playerName: passer.name,
        commentary: `${interceptCandidate.player.name} steps in to intercept.`,
        stats: {},
        ballPosition: { ...interceptCandidate.player.position },
        ballVelocity: { x: 0, y: 0 },
        passRisk,
        turnoverPlayerId: interceptCandidate.player.id,
        turnoverTeamId: interceptCandidate.player.teamId,
        turnoverReason: 'interception'
      };
    }

    if (success && receiver) {
      const aerialContest = this.getAerialContest(state, passer, receiver, instructions, context?.forceAerial);
      if (aerialContest && aerialContest.winner.teamId !== passer.teamId) {
        return {
          type: 'pass',
          teamId,
          playerId: passer.id,
          playerName: passer.name,
          commentary: `${aerialContest.winner.name} wins the header.`,
          stats: {},
          ballPosition: { ...aerialContest.winner.position },
          ballVelocity: { x: 0, y: 0 },
          passRisk,
          turnoverPlayerId: aerialContest.winner.id,
          turnoverTeamId: aerialContest.winner.teamId,
          turnoverReason: 'interception'
        };
      }

      if (!aerialContest) {
        const miscontrolChance = this.getMiscontrolChance(receiver, receiverPressure);
        if (Math.random() < miscontrolChance) {
          const opponent = this.findNearestOpponent(state, receiver.position, receiver.teamId);
          if (opponent) {
            return {
              type: 'pass',
              teamId,
              playerId: passer.id,
              playerName: passer.name,
              commentary: `${receiver.name} miscontrols under pressure.`,
              stats: {},
              ballPosition: { ...opponent.position },
              ballVelocity: { x: 0, y: 0 },
              passRisk,
              turnoverPlayerId: opponent.id,
              turnoverTeamId: opponent.teamId,
              turnoverReason: 'miscontrol'
            };
          }
        }
      }
    }

    if (success) {
      return {
        type: 'pass',
        teamId,
        playerId: passer.id,
        playerName: passer.name,
        commentary: `${passer.name} finds a passing lane.`,
        stats: { pass: true },
        ballPosition: { ...passer.position },
        ballVelocity,
        passRisk
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
      restartTeamId,
      passRisk
    };
  }

  private resolveShot(
    state: SimulationState,
    teamId: string,
    shooter: PlayerState,
    instructions?: TeamInstructions,
    context?: DecisionContext
  ): RuleDecision {
    let shotSkill = average(
      getAttribute(shooter, 'finishing'),
      getAttribute(shooter, 'long_shots'),
      getAttribute(shooter, 'technique'),
      getAttribute(shooter, 'composure')
    );

    if (context?.setPiece === 'free_kick') {
      const freeKick = getAttribute(shooter, 'free_kick_taking');
      shotSkill = average(shotSkill, freeKick, getAttribute(shooter, 'technique'));
    }
    if (context?.setPiece === 'penalty') {
      const penalty = getAttribute(shooter, 'penalty_taking');
      shotSkill = average(shotSkill, penalty, getAttribute(shooter, 'composure'));
    }

    const goal = this.getGoalPosition(teamId);
    const distance = Math.hypot(goal.x - shooter.position.x, goal.y - shooter.position.y);
    const distanceFactor = clamp(1 - distance / (this.pitch.width * 0.9), 0.25, 1);
    const chanceQuality = distance <= 12 && shotSkill >= 55 ? 'big' : 'normal';

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
    const consistency = getAttribute(shooter, 'consistency');
    const importantMatches = getAttribute(shooter, 'important_matches');
    const moraleFactor = this.getMoraleFactor(shooter);
    const fatigue = clamp(shooter.fatigue ?? 0, 0, 1);
    const pressurePenalty = clamp(pressure * (0.45 - composure / 220) * this.matchImportance, 0, 0.45);
    const pressureResilience = clamp(1 - (importantMatches / 100) * 0.12, 0.8, 1);
    goalChance *= 1 - pressurePenalty * pressureResilience;
    goalChance *= 1 - this.getFootPenalty(shooter);
    goalChance *= 0.9 + (consistency / 100) * 0.2;
    goalChance *= moraleFactor;
    goalChance *= 1 - fatigue * 0.3;

    let onTargetChance = clamp(0.4 + (shotSkill / 100) * 0.45, 0.4, 0.85) * (1 - pressurePenalty * 0.5);
    if (hasTrait(shooter, 'places_shots')) onTargetChance *= 1.05;
    if (hasTrait(shooter, 'shoots_with_power')) onTargetChance *= 0.97;
    if (hasTrait(shooter, 'curls_ball')) onTargetChance *= 1.02;
    onTargetChance *= 0.9 + (consistency / 100) * 0.2;
    onTargetChance *= moraleFactor;
    onTargetChance *= 1 - fatigue * 0.25;

    if (context?.setPiece === 'free_kick') {
      const freeKick = getAttribute(shooter, 'free_kick_taking');
      onTargetChance *= 0.95 + (freeKick / 100) * 0.12;
      goalChance *= 0.9 + (freeKick / 100) * 0.18;
    }
    if (context?.setPiece === 'penalty') {
      const penalty = getAttribute(shooter, 'penalty_taking');
      onTargetChance = clamp(onTargetChance + (penalty / 100) * 0.18, 0.55, 0.95);
      goalChance = clamp(goalChance + (penalty / 100) * 0.15, 0.2, 0.95);
    }

    const roll = Math.random();
    const shotTarget = this.applyTargetScatter(
      goal,
      this.getShotScatter(shooter, distanceFactor),
      5.5
    );
    const ballVelocity = this.buildBallVelocity(state.ball.position, shotTarget, 14 + (shotSkill / 100) * 10);

    const block = this.getBlockCandidate(state, shooter, teamId);
    if (block && Math.random() < block.chance) {
      const deflectionVelocity = this.buildLooseBallVelocity(block.player.position, 6);
      return {
        type: 'shot',
        teamId,
        playerId: shooter.id,
        playerName: shooter.name,
        commentary: `${block.player.name} gets in the way.`,
        stats: { shot: true },
        ballPosition: { ...block.player.position },
        ballVelocity: deflectionVelocity,
        chanceQuality
      };
    }

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
        restartTeamId,
        chanceQuality
      };
    }

    if (roll < onTargetChance) {
      const defendingTeamId = this.getOpponentTeamId(state, teamId);
      const goalkeeper = this.getGoalkeeper(state, defendingTeamId);
      const shotPower = this.getShotPower(shooter);

      if (goalkeeper) {
        const gkOutcome = this.resolveGoalkeeperOutcome(goalkeeper, shooter, distanceFactor, shotPower);
        if (gkOutcome.type === 'catch') {
          return {
            type: 'shot',
            teamId,
            playerId: shooter.id,
            playerName: shooter.name,
            commentary: `${goalkeeper.name} gathers the shot.`,
            stats: { shot: true },
            ballPosition: { ...goalkeeper.position },
            ballVelocity: { x: 0, y: 0 },
            chanceQuality,
            turnoverPlayerId: goalkeeper.id,
            turnoverTeamId: goalkeeper.teamId,
            turnoverReason: 'interception'
          };
        }
        if (gkOutcome.type === 'parry') {
          if (Math.random() < 0.45) {
            const restartPosition = this.getRestartPosition(state, 'corner', teamId, shooter.position);
            const restartTeamId = this.getRestartTeamId(state, 'corner', teamId);
            return {
              type: 'shot',
              teamId,
              playerId: shooter.id,
              playerName: shooter.name,
              commentary: `${goalkeeper.name} palms it wide for a corner.`,
              stats: { shot: true },
              ballPosition: { ...shooter.position },
              ballVelocity,
              restartType: 'corner',
              restartPosition,
              restartTeamId,
              chanceQuality
            };
          }
          if (Math.random() < 0.4) {
            const deflection = this.buildLooseBallVelocity(goalkeeper.position, 5.5);
            return {
              type: 'shot',
              teamId,
              playerId: shooter.id,
              playerName: shooter.name,
              commentary: `${goalkeeper.name} parries into danger.`,
              stats: { shot: true },
              ballPosition: { ...goalkeeper.position },
              ballVelocity: deflection,
              chanceQuality
            };
          }
          const defender = this.findNearestOpponent(state, goalkeeper.position, goalkeeper.teamId);
          if (defender) {
            return {
              type: 'shot',
              teamId,
              playerId: shooter.id,
              playerName: shooter.name,
              commentary: `${goalkeeper.name} parries and ${defender.name} clears.`,
              stats: { shot: true },
              ballPosition: { ...defender.position },
              ballVelocity: this.buildLooseBallVelocity(defender.position, 4.5),
              chanceQuality,
              turnoverPlayerId: defender.id,
              turnoverTeamId: defender.teamId,
              turnoverReason: 'interception'
            };
          }
        }
      }

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
        restartTeamId,
        chanceQuality
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
      restartTeamId,
      chanceQuality
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
    foulChance *= 0.95 + this.matchImportance * 0.1;

    if (Math.random() >= foulChance) {
      return null;
    }

    const foulPosition = { ...state.ball.position };
    return this.buildFoulDecision(state, defender, foulPosition, attackingTeamId);
  }

  private buildFoulDecision(
    state: SimulationState,
    offender: PlayerState,
    position: Vector2,
    attackingTeamId: string
  ): RuleDecision {
    const inBox = this.isInPenaltyArea(offender.teamId, position);
    const severity = this.getFoulSeverity(offender);
    const advantage = this.shouldPlayAdvantage(state, attackingTeamId, position, severity);
    const card = this.getCardOutcome(state, offender, position, attackingTeamId, severity, inBox);

    const restartPosition = inBox ? this.getPenaltySpot(offender.teamId) : this.clampPosition(position);
    const restartTeamId = this.getOpponentTeamId(state, offender.teamId);
    const cardText = card ? ` ${offender.name} is shown ${card === 'red' ? 'red' : 'a yellow'} card.` : '';

    const commentary = advantage
      ? `Advantage played for ${this.resolveTeamName(state, attackingTeamId)}.${cardText}`
      : inBox
        ? `Penalty! ${offender.name} brings down the attacker.${cardText}`
        : `Foul by ${offender.name}. Free kick awarded.${cardText}`;

    return {
      type: 'foul',
      teamId: offender.teamId,
      playerId: offender.id,
      playerName: offender.name,
      commentary,
      stats: { foul: true },
      advantage,
      card,
      ballPosition: advantage ? undefined : { ...position },
      ballVelocity: advantage ? undefined : { x: 0, y: 0 },
      restartType: advantage ? undefined : inBox ? 'penalty' : 'free_kick',
      restartPosition: advantage ? undefined : restartPosition,
      restartTeamId: advantage ? undefined : restartTeamId
    };
  }

  private getFoulSeverity(offender: PlayerState) {
    const aggression = getAttribute(offender, 'aggression');
    const tackling = getAttribute(offender, 'tackling');
    const dirtiness = getAttribute(offender, 'dirtiness');
    const bravery = getAttribute(offender, 'bravery');

    let severity = 0.15;
    severity += (aggression / 100) * 0.28;
    severity += (dirtiness / 100) * 0.32;
    severity += (bravery / 100) * 0.12;
    severity -= (tackling / 100) * 0.15;

    if (hasTrait(offender, 'dives_into_tackles')) severity += 0.08;
    if (hasTrait(offender, 'does_not_dive_into_tackles')) severity -= 0.05;

    return clamp(severity, 0, 1);
  }

  private getCardOutcome(
    state: SimulationState,
    offender: PlayerState,
    position: Vector2,
    attackingTeamId: string,
    severity: number,
    inBox: boolean
  ) {
    let redChance = 0.02 + severity * 0.12;
    let yellowChance = 0.14 + severity * 0.55;

    if (inBox) redChance += 0.05;
    if (this.isLastMan(state, offender, position, attackingTeamId)) redChance += 0.12;

    redChance = clamp(redChance, 0, 0.45);
    yellowChance = clamp(yellowChance, 0.1, 0.85);

    if (Math.random() < redChance) return 'red';
    if (Math.random() < yellowChance) return 'yellow';
    return undefined;
  }

  private shouldPlayAdvantage(
    state: SimulationState,
    attackingTeamId: string,
    position: Vector2,
    severity: number
  ) {
    if (severity > 0.8) return false;
    const direction = this.getAttackDirection(attackingTeamId);
    const ballAxis = this.getAttackAxis(position.x, direction);

    const attackersAhead = state.players.filter((player) => {
      if (player.teamId !== attackingTeamId || !isAvailable(player)) return false;
      const axis = this.getAttackAxis(player.position.x, direction);
      return axis > ballAxis + 5;
    }).length;

    const nearbyOpponents = state.players.filter((player) => {
      if (player.teamId === attackingTeamId || !isAvailable(player)) return false;
      const dist = Math.hypot(player.position.x - position.x, player.position.y - position.y);
      return dist < 12;
    }).length;

    let chance = 0.15 + (ballAxis / this.pitch.width) * 0.25;
    chance += Math.min(attackersAhead, 3) * 0.06;
    chance -= Math.min(nearbyOpponents, 3) * 0.04;
    chance -= severity * 0.25;

    return Math.random() < clamp(chance, 0.05, 0.45);
  }

  private isLastMan(
    state: SimulationState,
    offender: PlayerState,
    position: Vector2,
    attackingTeamId: string
  ) {
    const direction = this.getAttackDirection(attackingTeamId);
    const foulAxis = this.getAttackAxis(position.x, direction);
    if (foulAxis < this.pitch.width * 0.45) return false;

    const defendersAhead = state.players.filter((player) => {
      if (player.teamId !== offender.teamId || !isAvailable(player)) return false;
      const axis = this.getAttackAxis(player.position.x, direction);
      return axis > foulAxis + 2;
    });

    return defendersAhead.length <= 1;
  }

  private pickForwardTeammate(state: SimulationState, teamId: string, excludeId: string) {
    const direction = this.getAttackDirection(teamId);
    const teammates = state.players.filter(
      (player) => player.teamId === teamId && player.id !== excludeId && isAvailable(player)
    );
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
      if (opponent.teamId === player.teamId || !isAvailable(opponent)) continue;
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

  private getInterceptionCandidate(
    state: SimulationState,
    passer: PlayerState,
    receiver: PlayerState,
    passChance: number
  ) {
    const opponents = state.players.filter(
      (player) => player.teamId !== passer.teamId && isAvailable(player)
    );
    if (!opponents.length) return null;

    const baseIntercept = clamp(0.05 + (1 - passChance) * 0.35, 0.05, 0.45);
    let best: { player: PlayerState; chance: number } | null = null;

    opponents.forEach((opponent) => {
      const { distance, t } = this.getDistanceToSegment(passer.position, receiver.position, opponent.position);
      if (t < 0.12 || t > 0.95) return;
      if (distance > 6) return;

      const positioning = getAttribute(opponent, 'positioning');
      const anticipation = getAttribute(opponent, 'anticipation');
      const marking = getAttribute(opponent, 'marking');
      const acceleration = getAttribute(opponent, 'acceleration');
      const interceptSkill = average(positioning, anticipation, marking, acceleration);
      const closeness = clamp(1 - distance / 6, 0, 1);
      const timing = clamp(1 - Math.abs(0.5 - t) * 2, 0, 1);
      let multiplier = 0.6 + (interceptSkill / 100) * 0.6;

      if (hasPlaystyle(opponent, 'intercept')) multiplier *= 1.08;
      if (hasTrait(opponent, 'marks_opponent_tightly')) multiplier *= 1.06;
      if (hasTrait(opponent, 'dives_into_tackles')) multiplier *= 1.04;
      if (hasTrait(opponent, 'does_not_dive_into_tackles')) multiplier *= 0.95;

      const chance = clamp(baseIntercept * closeness * (0.6 + timing * 0.4) * multiplier, 0, 0.6);
      if (!best || chance > best.chance) {
        best = { player: opponent, chance };
      }
    });

    return best;
  }

  private getAerialContest(
    state: SimulationState,
    passer: PlayerState,
    receiver: PlayerState,
    instructions?: TeamInstructions,
    forceAerial?: boolean
  ) {
    const defendingTeamId = this.getOpponentTeamId(state, receiver.teamId);
    if (!forceAerial && !this.isAerialPass(passer, receiver, defendingTeamId, instructions)) return null;

    const defender = this.findNearestOpponent(state, receiver.position, receiver.teamId);
    const goalkeeper = this.getGoalkeeper(state, defendingTeamId);
    const inBox = this.isInPenaltyArea(defendingTeamId, receiver.position);

    const candidates: PlayerState[] = [];
    if (isAvailable(receiver)) candidates.push(receiver);
    if (defender && isAvailable(defender)) candidates.push(defender);
    if (goalkeeper && inBox && isAvailable(goalkeeper)) candidates.push(goalkeeper);

    const scored = candidates.map((player) => ({
      player,
      score: this.getAerialSkill(player)
    }));

    const total = scored.reduce((sum, entry) => sum + entry.score, 0) || 1;
    let roll = Math.random() * total;
    for (const entry of scored) {
      roll -= entry.score;
      if (roll <= 0) {
        return { winner: entry.player };
      }
    }

    return { winner: scored[0].player };
  }

  private isAerialPass(
    passer: PlayerState,
    receiver: PlayerState,
    defendingTeamId: string,
    instructions?: TeamInstructions
  ) {
    const dx = receiver.position.x - passer.position.x;
    const dy = receiver.position.y - passer.position.y;
    const distance = Math.hypot(dx, dy);
    const midY = this.pitch.height / 2;
    const passerWide = Math.abs(passer.position.y - midY) > 16;
    const receiverInBox = this.isInPenaltyArea(defendingTeamId, receiver.position);
    const crossingStyle = instructions?.crossing_style;
    const highCross = crossingStyle === 'High Crosses';
    const lowCross = crossingStyle === 'Low Crosses';

    if (lowCross) return false;
    if (highCross && passerWide && receiverInBox) return true;
    return distance >= 18 && (passerWide || receiverInBox);
  }

  private getAerialSkill(player: PlayerState) {
    if (this.isGoalkeeperRole(player)) {
      const aerial = getAttribute(player, 'aerial_reach');
      const command = getAttribute(player, 'command_of_area');
      const handling = getAttribute(player, 'handling');
      const jumping = getAttribute(player, 'jumping_reach');
      let skill = average(aerial, command, handling, jumping);
      if (hasPlaystyle(player, 'cross_claimer')) skill *= 1.08;
      if (hasPlaystyle(player, 'far_reach')) skill *= 1.05;
      return clamp(skill, 5, 140);
    }

    const jumping = getAttribute(player, 'jumping_reach');
    const heading = getAttribute(player, 'heading');
    const strength = getAttribute(player, 'strength');
    const bravery = getAttribute(player, 'bravery');
    const aggression = getAttribute(player, 'aggression');
    const height = player.heightCm ?? 180;
    const heightBoost = clamp((height - 170) / 40, 0, 0.35);
    let skill = average(jumping, heading, strength, bravery, aggression);
    skill *= 1 + heightBoost;

    if (hasPlaystyle(player, 'aerial')) skill *= 1.08;
    if (hasPlaystyle(player, 'power_header')) skill *= 1.08;
    if (hasTrait(player, 'penalty_box_player')) skill *= 1.05;

    return clamp(skill, 5, 140);
  }

  private getGoalkeeper(state: SimulationState, defendingTeamId: string) {
    const candidates = state.players.filter(
      (player) => player.teamId === defendingTeamId && isAvailable(player)
    );
    const explicit = candidates.find((player) => this.isGoalkeeperRole(player));
    if (explicit) return explicit;

    const goal = this.getGoalPosition(defendingTeamId);
    let closest: PlayerState | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const player of candidates) {
      const dist = Math.hypot(player.position.x - goal.x, player.position.y - goal.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = player;
      }
    }
    return closest;
  }

  private isGoalkeeperRole(player: PlayerState) {
    const roleId = player.roleId;
    if (!roleId) return false;
    return (
      roleId === 'goalkeeper' ||
      roleId === 'line_holding_keeper' ||
      roleId === 'no_nonsense_goalkeeper' ||
      roleId === 'sweeper_keeper' ||
      roleId === 'ball_playing_goalkeeper'
    );
  }

  private getMiscontrolChance(receiver: PlayerState, pressure: number) {
    const firstTouch = getAttribute(receiver, 'first_touch');
    const technique = getAttribute(receiver, 'technique');
    const composure = getAttribute(receiver, 'composure');
    const balance = getAttribute(receiver, 'balance');
    const fatigue = clamp(receiver.fatigue ?? 0, 0, 1);

    let chance = 0.04;
    chance += (1 - (firstTouch + technique) / 200) * 0.08;
    chance += (1 - balance / 100) * 0.05;
    chance += pressure * 0.08;
    chance += fatigue * 0.12;
    chance *= 1 - (composure / 100) * 0.15;

    if (hasPlaystyle(receiver, 'first_touch')) {
      chance *= receiver.playstylesPlus?.includes('first_touch') ? 0.6 : 0.75;
    }

    return clamp(chance, 0.02, 0.22);
  }

  private getPassScatter(
    passer: PlayerState,
    receiver: PlayerState,
    instructions: TeamInstructions | undefined,
    passChance: number
  ) {
    const passing = getAttribute(passer, 'passing');
    const vision = getAttribute(passer, 'vision');
    const technique = getAttribute(passer, 'technique');
    const composure = getAttribute(passer, 'composure');
    const fatigue = clamp(passer.fatigue ?? 0, 0, 1);
    const distance = Math.hypot(
      receiver.position.x - passer.position.x,
      receiver.position.y - passer.position.y
    );

    let error = 1 - (passing + vision + technique + composure) / 400;
    error += (1 - passChance) * 0.2;
    error += fatigue * 0.25;
    error += this.getWeatherAccuracyPenalty();
    error += this.getWindAccuracyPenalty(distance);

    if (this.environment.pitch === 'worn') error += 0.02;
    if (this.environment.pitch === 'heavy') error += 0.05;
    if (instructions?.passing_directness === 'Much Shorter') error -= 0.02;
    if (instructions?.passing_directness === 'Much More Direct') error += 0.03;

    if (hasPlaystyle(passer, 'tiki_taka')) error *= 0.85;
    if (hasPlaystyle(passer, 'incisive_pass')) error *= 0.9;
    if (hasPlaystyle(passer, 'pinged_pass')) error *= 0.92;
    if (hasPlaystyle(passer, 'long_ball_pass')) error *= 0.95;
    if (hasTrait(passer, 'plays_short_simple_passes')) error *= 0.85;
    if (hasTrait(passer, 'tries_long_range_passes')) error *= 1.12;

    const distanceScale = clamp(distance / 26, 0.7, 1.35);
    error *= distanceScale;

    return clamp(error, 0.015, 0.25);
  }

  private getShotScatter(shooter: PlayerState, distanceFactor: number) {
    const finishing = getAttribute(shooter, 'finishing');
    const technique = getAttribute(shooter, 'technique');
    const composure = getAttribute(shooter, 'composure');
    const fatigue = clamp(shooter.fatigue ?? 0, 0, 1);

    let error = 1 - (finishing + technique + composure) / 300;
    error += (1 - distanceFactor) * 0.12;
    error += fatigue * 0.2;
    error += this.getWeatherAccuracyPenalty();
    error += this.getWindAccuracyPenalty(22);

    if (hasPlaystyle(shooter, 'finesse_shot')) error *= 0.9;
    if (hasPlaystyle(shooter, 'power_shot')) error *= 0.95;
    if (hasTrait(shooter, 'curls_ball')) error *= 0.9;
    if (hasTrait(shooter, 'shoots_with_power')) error *= 1.05;

    return clamp(error, 0.02, 0.2);
  }

  private getWeatherAccuracyPenalty() {
    switch (this.environment.weather) {
      case 'rain':
        return 0.02;
      case 'snow':
        return 0.05;
      case 'storm':
        return 0.07;
      default:
        return 0;
    }
  }

  private getWindAccuracyPenalty(distance: number) {
    const windSpeed = Math.hypot(this.environment.wind.x, this.environment.wind.y);
    const windFactor = clamp(windSpeed / 12, 0, 0.3);
    const distanceFactor = clamp(distance / 30, 0.4, 1.3);
    return windFactor * distanceFactor * 0.08;
  }

  private applyTargetScatter(target: Vector2, scatter: number, scale = 10) {
    if (scatter <= 0) return { ...target };
    const angle = Math.random() * Math.PI * 2;
    const radius = (0.35 + Math.random() * 0.65) * scatter * scale;
    return {
      x: clamp(target.x + Math.cos(angle) * radius, 0.5, this.pitch.width - 0.5),
      y: clamp(target.y + Math.sin(angle) * radius, 0.5, this.pitch.height - 0.5)
    };
  }

  private getShotPower(shooter: PlayerState) {
    let power = 0.5;
    if (hasPlaystyle(shooter, 'power_shot')) power += 0.15;
    if (hasPlaystyle(shooter, 'finesse_shot')) power -= 0.05;
    if (hasPlaystyle(shooter, 'chip_shot')) power -= 0.08;
    if (hasTrait(shooter, 'shoots_with_power')) power += 0.08;
    if (hasTrait(shooter, 'places_shots')) power -= 0.05;
    return clamp(power, 0.3, 0.85);
  }

  private resolveGoalkeeperOutcome(
    goalkeeper: PlayerState,
    shooter: PlayerState,
    distanceFactor: number,
    shotPower: number
  ) {
    const reflexes = getAttribute(goalkeeper, 'reflexes');
    const handling = getAttribute(goalkeeper, 'handling');
    const oneOnOnes = getAttribute(goalkeeper, 'one_on_ones');
    const agility = getAttribute(goalkeeper, 'agility');
    const gkSkill = average(reflexes, handling, oneOnOnes, agility);

    const shotSkill = average(
      getAttribute(shooter, 'finishing'),
      getAttribute(shooter, 'technique'),
      getAttribute(shooter, 'composure')
    );

    let saveChance = 0.58 + (gkSkill - shotSkill) / 200 - distanceFactor * 0.22;
    saveChance *= 1 - shotPower * 0.25;
    saveChance *= this.getMoraleFactor(goalkeeper);
    saveChance *= 1 - (goalkeeper.fatigue ?? 0) * 0.25;

    if (hasPlaystyle(goalkeeper, 'quick_reflexes')) saveChance *= 1.08;
    if (hasPlaystyle(goalkeeper, 'far_reach')) saveChance *= 1.06;
    if (hasPlaystyle(goalkeeper, 'rush_out')) saveChance *= 1.03;
    if (hasPlaystyle(shooter, 'power_shot')) saveChance *= 0.94;

    saveChance = clamp(saveChance, 0.18, 0.9);
    if (Math.random() > saveChance) {
      return { type: 'parry' as const };
    }

    let catchChance = (handling / 100) * 0.6 + (1 - shotPower) * 0.35;
    catchChance *= 1 - (goalkeeper.fatigue ?? 0) * 0.15;
    catchChance = clamp(catchChance, 0.25, 0.85);
    return Math.random() < catchChance ? { type: 'catch' as const } : { type: 'parry' as const };
  }

  private getBlockCandidate(state: SimulationState, shooter: PlayerState, teamId: string) {
    const opponents = state.players.filter((player) => player.teamId !== teamId && isAvailable(player));
    if (!opponents.length) return null;

    const goal = this.getGoalPosition(teamId);
    let best: { player: PlayerState; chance: number } | null = null;

    opponents.forEach((opponent) => {
      const { distance, t } = this.getDistanceToSegment(shooter.position, goal, opponent.position);
      if (t < 0.05 || t > 0.85) return;
      if (distance > 4.2) return;
      const blockSkill = average(
        getAttribute(opponent, 'positioning'),
        getAttribute(opponent, 'anticipation'),
        getAttribute(opponent, 'tackling'),
        getAttribute(opponent, 'bravery')
      );
      const closeness = clamp(1 - distance / 4.2, 0, 1);
      let chance = 0.06 + closeness * 0.18 + (blockSkill - 50) / 300;
      if (hasPlaystyle(opponent, 'block')) chance *= 1.1;
      if (hasTrait(opponent, 'dives_into_tackles')) chance *= 1.05;
      chance = clamp(chance, 0.04, 0.35);
      if (!best || chance > best.chance) {
        best = { player: opponent, chance };
      }
    });

    return best;
  }

  private buildLooseBallVelocity(origin: Vector2, baseSpeed: number) {
    const angle = Math.random() * Math.PI * 2;
    const speed = baseSpeed * (0.6 + Math.random() * 0.6);
    return {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed
    };
  }

  private findNearestOpponent(state: SimulationState, position: Vector2, teamId: string) {
    let closest: PlayerState | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const player of state.players) {
      if (player.teamId === teamId || !isAvailable(player)) continue;
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

  private getFootPenalty(player: PlayerState) {
    const balance = getFootBalance(player);
    let penalty = clamp((1 - balance) * 0.12, 0, 0.12);
    if (hasTrait(player, 'avoids_using_weaker_foot')) penalty *= 1.3;
    if (hasTrait(player, 'attempts_to_develop_weaker_foot')) penalty *= 0.7;
    return clamp(penalty, 0, 0.18);
  }

  private getMoraleFactor(player: PlayerState) {
    const morale = player.morale ?? 60;
    return clamp(0.9 + (morale / 100) * 0.2, 0.85, 1.15);
  }

  private getDistanceToSegment(start: Vector2, end: Vector2, point: Vector2) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    const dist = Math.hypot(point.x - projX, point.y - projY);
    return { distance: dist, t };
  }

  private pickClosestOpponent(state: SimulationState, teamId: string) {
    let closest: PlayerState | null = null;
    let distance = Number.POSITIVE_INFINITY;

    for (const player of state.players) {
      if (player.teamId === teamId || !isAvailable(player)) continue;
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

    const defenders = state.players.filter((player) => player.teamId !== teamId && isAvailable(player));
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
