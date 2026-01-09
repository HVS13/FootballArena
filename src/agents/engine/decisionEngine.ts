import { PitchDimensions, SimulationState, Vector2 } from '../../domain/simulationTypes';
import { RuleDecision, RulesAgent } from '../RulesAgent';
import { RoleBehavior } from '../../data/roleBehavior';
import { clamp } from './engineMath';
import { RoleArchetypeProfile, SimPlayer } from './engineTypes';

export type DecisionContext = {
  state: SimulationState;
  pitch: PitchDimensions;
  rules: RulesAgent;
  getAttribute: (player: SimPlayer, id: string, fallback?: number) => number;
  getRoleBehavior: (player: SimPlayer) => RoleBehavior;
  getRoleArchetypeProfile: (player: SimPlayer) => RoleArchetypeProfile;
  getMoraleFactor: (player: SimPlayer) => number;
  getCreativeFreedomBias: (instructions?: Record<string, string>) => number;
  getAttackDirection: (teamId: string) => number;
  getAttackAxis: (x: number, direction: number) => number;
  getGoalPosition: (teamId: string) => Vector2;
  getLineDepth: (x: number, direction: number) => number;
  isInAttackingBox: (teamId: string, position: Vector2) => boolean;
  hasPlaystyle: (player: SimPlayer, id: string) => boolean;
  hasPlaystylePlus: (player: SimPlayer, id: string) => boolean;
  getPlaystyleBonus: (player: SimPlayer, id: string, base?: number, plus?: number) => number;
  getPlaystyleMultiplier: (player: SimPlayer, id: string, base?: number, plus?: number) => number;
  hasTrait: (player: SimPlayer, id: string) => boolean;
};

export const handleGoalkeeperPossession = (
  context: DecisionContext,
  goalkeeper: SimPlayer,
  instructions: Record<string, string> | undefined,
  pressure: number
) => {
  const target = chooseGoalkeeperTarget(context, goalkeeper, instructions);
  if (!target) return null;

  const gkInstructions = buildGoalkeeperInstructions(instructions);
  const decision = context.rules.decidePass(
    context.state,
    goalkeeper.teamId,
    goalkeeper,
    target,
    gkInstructions
  );
  if (pressure > 0.35 && Math.random() < 0.2) {
    decision.commentary = `${goalkeeper.name} clears under pressure.`;
  }
  return decision;
};

export const chooseGoalkeeperTarget = (
  context: DecisionContext,
  goalkeeper: SimPlayer,
  instructions: Record<string, string> | undefined
) => {
  const candidates = context.state.players.filter(
    (player) =>
      player.teamId === goalkeeper.teamId && player.id !== goalkeeper.id && !player.discipline?.red
  );
  if (!candidates.length) return null;

  const targetPref = instructions?.gk_distribution_target ?? 'Centre-Backs';
  const goalKickStyle = instructions?.goal_kicks ?? 'Mixed';
  let wantsShort = goalKickStyle === 'Short' || instructions?.short_goalkeeper_distribution === 'Yes';
  let wantsLong = goalKickStyle === 'Long';
  if (context.hasPlaystylePlus(goalkeeper, 'footwork')) wantsShort = true;
  if (context.hasPlaystylePlus(goalkeeper, 'far_throw')) wantsLong = true;
  if (!wantsShort && !wantsLong) {
    if (context.hasPlaystyle(goalkeeper, 'footwork')) wantsShort = true;
    if (context.hasPlaystyle(goalkeeper, 'far_throw')) wantsLong = true;
  }
  if (goalKickStyle === 'Mixed') {
    if (context.hasPlaystyle(goalkeeper, 'far_throw')) wantsLong = true;
    if (context.hasPlaystylePlus(goalkeeper, 'footwork')) wantsShort = true;
  }

  const midY = context.pitch.height / 2;
  const direction = context.getAttackDirection(goalkeeper.teamId);

  const withDepth = candidates.map((player) => {
    const depth = context.getLineDepth(player.homePosition.x, direction);
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
    const longDepth = context.hasPlaystylePlus(goalkeeper, 'far_throw') ? 0.7 : 0.6;
    pool = withDepth.filter((entry) => entry.depth >= longDepth);
    if (!pool.length) pool = withDepth;
  } else if (wantsShort) {
    const shortDepth = context.hasPlaystylePlus(goalkeeper, 'footwork') ? 0.45 : 0.5;
    pool = withDepth.filter((entry) => entry.depth < shortDepth);
    if (!pool.length) pool = withDepth;
  }

  const sorted = pool
    .slice()
    .sort((a, b) => {
      if (wantsLong) {
        const aScore = getAerialTargetScore(context, a.player, direction);
        const bScore = getAerialTargetScore(context, b.player, direction);
        return bScore - aScore;
      }
      return a.depth - b.depth;
    });

  return sorted[0]?.player ?? null;
};

export const getAerialTargetScore = (context: DecisionContext, player: SimPlayer, direction: number) => {
  const depth = context.getLineDepth(player.homePosition.x, direction);
  const aerial =
    (context.getAttribute(player, 'jumping_reach') + context.getAttribute(player, 'heading')) / 2;
  const strength = context.getAttribute(player, 'strength');
  return depth * 60 + aerial * 0.4 + strength * 0.2;
};

export const buildGoalkeeperInstructions = (instructions: Record<string, string> | undefined) => {
  const directness = instructions?.goal_kicks === 'Long' ? 'Much More Direct' : 'Shorter';
  return {
    ...instructions,
    passing_directness: directness
  };
};

export const getGoalkeeperCooldown = (instructions: Record<string, string> | undefined) => {
  const speed = instructions?.gk_distribution_speed ?? 'Balanced';
  if (speed === 'Faster') return 0.6;
  if (speed === 'Slower') return 1.4;
  return 1;
};

export const shouldCarryBall = (
  context: DecisionContext,
  player: SimPlayer,
  instructions?: Record<string, string>,
  pressure = 0
) => {
  const dribbling = context.getAttribute(player, 'dribbling');
  let carryChance = 0.15 + (dribbling / 100) * 0.3;
  const roleBehavior = context.getRoleBehavior(player);
  const roleProfile = context.getRoleArchetypeProfile(player);
  const moraleFactor = context.getMoraleFactor(player);
  const fatigue = player.fatigue ?? 0;

  const dribblingInstruction = instructions?.dribbling;
  if (dribblingInstruction === 'Encouraged') {
    carryChance += 0.08;
  } else if (dribblingInstruction === 'Reduced') {
    carryChance -= 0.08;
  }

  carryChance += context.getPlaystyleBonus(player, 'rapid', 0.06, 0.08);
  carryChance += context.getPlaystyleBonus(player, 'technical', 0.05, 0.07);
  carryChance += context.getPlaystyleBonus(player, 'press_proven', 0.04, 0.06);
  carryChance += context.getPlaystyleBonus(player, 'trickster', 0.04, 0.06);
  carryChance += context.getPlaystyleBonus(player, 'quick_step', 0.04, 0.06);
  carryChance += context.getPlaystyleBonus(player, 'flair', 0.03, 0.05);
  carryChance += context.getPlaystyleBonus(player, 'gamechanger', 0.04, 0.06);
  if (context.hasTrait(player, 'runs_with_ball_often')) carryChance += 0.12;
  if (context.hasTrait(player, 'runs_with_ball_rarely')) carryChance -= 0.18;
  if (context.hasTrait(player, 'knocks_ball_past_opponent')) carryChance += 0.06;
  if (context.hasTrait(player, 'tries_to_play_way_out_of_trouble')) carryChance += 0.05;
  if (context.hasTrait(player, 'runs_with_ball_down_left')) carryChance += 0.05;
  if (context.hasTrait(player, 'runs_with_ball_down_right')) carryChance += 0.05;
  if (context.hasTrait(player, 'runs_with_ball_down_centre')) carryChance += 0.04;

  carryChance += roleBehavior.carry * 0.18;
  carryChance += roleBehavior.risk * 0.08;
  carryChance -= roleBehavior.hold * 0.08;
  carryChance += roleProfile.decision.carryBias;

  carryChance *= moraleFactor * (1 - fatigue * 0.25);
  carryChance *= 1 - clamp(pressure * 0.55, 0, 0.45);
  carryChance = clamp(carryChance, 0.08, 0.55);
  return Math.random() < carryChance;
};

export const getActionCooldown = (
  context: DecisionContext,
  player: SimPlayer,
  instructions: Record<string, string> | undefined,
  actionType: RuleDecision['type'] | 'carry',
  pressure = 0
) => {
  const decisions = context.getAttribute(player, 'decisions');
  let base = 0.8 + (1 - decisions / 100) * 0.8;
  const roleBehavior = context.getRoleBehavior(player);
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

  if (context.hasTrait(player, 'dwells_on_ball')) base += 0.35;
  if (context.hasTrait(player, 'stops_play')) base += 0.25;
  if (context.hasTrait(player, 'dictates_tempo')) base += 0.2;
  if (context.hasTrait(player, 'plays_one_twos')) base -= 0.1;

  base *= 1 - clamp(roleBehavior.risk * 0.15, -0.12, 0.12);
  base *= 1 + roleBehavior.hold * 0.1;
  base *= clamp(1 - (morale - 60) / 400, 0.85, 1.15);
  base *= 1 + fatigue * 0.4;

  base *= 1 - clamp(pressure * 0.25, 0, 0.2);
  return clamp(base, 0.45, 2.2);
};

export const shouldShoot = (
  context: DecisionContext,
  player: SimPlayer,
  instructions: Record<string, string> | undefined,
  pressure: number,
  hasPassOption: boolean
) => {
  const teamId = player.teamId;
  const goal = context.getGoalPosition(teamId);
  const distance = Math.hypot(goal.x - player.position.x, goal.y - player.position.y);
  const shotSkill = getShotSkill(context, player);
  const roleBehavior = context.getRoleBehavior(player);
  const roleProfile = context.getRoleArchetypeProfile(player);
  const creativeBias = context.getCreativeFreedomBias(instructions);
  const moraleFactor = context.getMoraleFactor(player);
  const fatigue = player.fatigue ?? 0;

  const shotsInstruction = instructions?.shots_from_distance;
  let maxRange = shotsInstruction === 'Encouraged' ? 32 : shotsInstruction === 'Reduced' ? 22 : 26;
  if (context.hasTrait(player, 'shoots_from_distance')) maxRange += 5;
  if (context.hasTrait(player, 'refrains_from_taking_long_shots')) maxRange -= 6;
  if (distance > maxRange) return false;

  let desire = 0.1 + (shotSkill / 100) * 0.35;
  const distanceFactor = clamp(1 - distance / maxRange, 0.1, 1);
  desire *= distanceFactor + 0.4;

  if (distance <= 14) desire += 0.2;
  if (shotsInstruction === 'Encouraged') desire += 0.06;
  if (shotsInstruction === 'Reduced') desire -= 0.08;

  desire += context.getPlaystyleBonus(player, 'power_shot', 0.05, 0.07);
  desire += context.getPlaystyleBonus(player, 'finesse_shot', 0.05, 0.07);
  desire += context.getPlaystyleBonus(player, 'chip_shot', 0.03, 0.05);
  desire += context.getPlaystyleBonus(player, 'trivela', 0.04, 0.06);
  desire += context.getPlaystyleBonus(
    player,
    'acrobatic',
    distance <= 14 ? 0.03 : 0.01,
    distance <= 14 ? 0.05 : 0.02
  );
  desire += context.getPlaystyleBonus(player, 'gamechanger', 0.05, 0.07);
  if (distance <= 12) {
    desire += context.getPlaystyleBonus(player, 'aerial', 0.03, 0.05);
  }
  if (distance <= 10) {
    desire += context.getPlaystyleBonus(player, 'power_header', 0.03, 0.05);
    desire += context.getPlaystyleBonus(player, 'precision_header', 0.02, 0.04);
  }
  if (context.hasTrait(player, 'shoots_with_power')) desire += 0.04;
  if (context.hasTrait(player, 'places_shots')) desire += 0.03;
  if (context.hasTrait(player, 'tries_first_time_shots') && distance <= 18) desire += 0.05;
  if (context.hasTrait(player, 'attempts_overhead_kicks') && distance <= 10) desire += 0.03;
  if (context.hasTrait(player, 'likes_to_lob_keeper') && distance <= 14) desire += 0.04;
  if (context.hasTrait(player, 'likes_to_round_keeper') && distance <= 12) desire += 0.03;
  if (context.hasTrait(player, 'looks_for_pass_rather_than_attempting_to_score')) desire -= 0.1;
  if (context.hasTrait(player, 'penalty_box_player') && distance <= 12) desire += 0.06;
  if (context.hasTrait(player, 'plays_with_back_to_goal')) desire -= 0.08;
  if (context.hasTrait(player, 'stops_play')) desire -= 0.06;

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
};

export const getShotSkill = (context: DecisionContext, player: SimPlayer) => {
  const finishing = context.getAttribute(player, 'finishing');
  const longShots = context.getAttribute(player, 'long_shots');
  const technique = context.getAttribute(player, 'technique');
  const composure = context.getAttribute(player, 'composure');
  return (finishing + longShots + technique + composure) / 4;
};

export const choosePassTarget = (
  context: DecisionContext,
  teamId: string,
  passer: SimPlayer,
  instructions: Record<string, string> | undefined
) => {
  const candidates = context.state.players.filter(
    (player) => player.teamId === teamId && player.id !== passer.id && !player.discipline?.red
  );
  if (!candidates.length) return null;

  const desiredDistance = getDesiredPassDistance(context, passer, instructions);
  const roleBehavior = context.getRoleBehavior(passer);
  const roleProfile = context.getRoleArchetypeProfile(passer);
  const creativeBias = context.getCreativeFreedomBias(instructions);
  const inventive = context.hasPlaystyle(passer, 'inventive');
  const flair = context.hasPlaystyle(passer, 'flair');
  const gamechanger = context.hasPlaystyle(passer, 'gamechanger');
  const whippedPass = context.hasPlaystyle(passer, 'whipped_pass');
  const longBall = context.hasPlaystyle(passer, 'long_ball_pass');
  const riskBias =
    roleBehavior.risk +
    creativeBias +
    roleProfile.decision.riskBias +
    (inventive ? context.getPlaystyleBonus(passer, 'inventive', 0.08, 0.12) : 0) +
    (flair ? context.getPlaystyleBonus(passer, 'flair', 0.05, 0.08) : 0) +
    (gamechanger ? context.getPlaystyleBonus(passer, 'gamechanger', 0.08, 0.12) : 0);
  const fatigue = passer.fatigue ?? 0;
  const fatigueRiskScale = 1 - fatigue * 0.5;
  const direction = context.getAttackDirection(teamId);
  const progressThrough = instructions?.progress_through;
  const passerVision = context.getAttribute(passer, 'vision');
  const passerPassing = context.getAttribute(passer, 'passing');
  const rangeFactor = 0.7 + (passerPassing + passerVision) / 200;
  const prefersShort = context.hasTrait(passer, 'plays_short_simple_passes');
  const triesKiller = context.hasTrait(passer, 'tries_killer_balls_often');
  const playsNoThrough = context.hasTrait(passer, 'plays_no_through_balls');
  const likesSwitch = context.hasTrait(passer, 'likes_to_switch_ball_to_other_flank');
  const oneTwos = context.hasTrait(passer, 'plays_one_twos');
  const midline = context.pitch.height / 2;

  const scored = candidates
    .map((receiver) => {
      const dx = receiver.position.x - passer.position.x;
      const dy = receiver.position.y - passer.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 3) return null;

      const forward = dx * direction;
      let distanceScore = 1 - clamp(Math.abs(distance - desiredDistance) / (desiredDistance * 0.9), 0, 1);
      let forwardScore = clamp(forward / (desiredDistance * 1.3), -0.4, 1);
      const openness = getOpponentDistance(context, receiver.position, teamId);
      const opennessScore = clamp(openness / 10, 0, 1);
      const runTarget = receiver.tacticalPosition ?? receiver.targetPosition ?? receiver.position;
      const runAhead =
        context.getAttackAxis(runTarget.x, direction) -
        context.getAttackAxis(receiver.position.x, direction);
      let runBonus = clamp(runAhead / 12, 0, 0.25);
      if (context.hasTrait(receiver, 'likes_to_try_to_beat_offside_trap')) runBonus *= 1.2;
      if (context.hasTrait(receiver, 'moves_into_channels')) runBonus *= 1.1;
      if (context.hasTrait(passer, 'tries_killer_balls_often')) runBonus *= 1.2;
      if (context.hasPlaystyle(passer, 'incisive_pass')) {
        runBonus *= context.getPlaystyleMultiplier(passer, 'incisive_pass', 1.15, 1.2);
      }
      if (context.hasTrait(passer, 'plays_no_through_balls')) runBonus *= 0.6;

      let sideBonus = 0;
      if (progressThrough === 'Left' && receiver.position.y < context.pitch.height / 2) sideBonus = 0.12;
      if (progressThrough === 'Right' && receiver.position.y > context.pitch.height / 2) sideBonus = 0.12;
      if (
        likesSwitch &&
        ((passer.position.y < midline && receiver.position.y > midline) ||
          (passer.position.y > midline && receiver.position.y < midline))
      ) {
        sideBonus += 0.12;
      }
      if (
        context.hasPlaystyle(passer, 'trivela') &&
        ((passer.position.y < midline && receiver.position.y > midline) ||
          (passer.position.y > midline && receiver.position.y < midline))
      ) {
        sideBonus += context.getPlaystyleBonus(passer, 'trivela', 0.06, 0.09);
      }

      if (roleBehavior.width > 0.1) {
        const sameSide =
          Math.sign(receiver.position.y - midline) === Math.sign(passer.position.y - midline);
        if (sameSide) sideBonus += Math.abs(roleBehavior.width) * 0.1;
      }
      if (roleBehavior.width < -0.1) {
        const centrality = 1 - Math.abs(receiver.position.y - midline) / midline;
        sideBonus += centrality * Math.abs(roleBehavior.width) * 0.12;
      }
      if (roleBehavior.cross > 0.05) {
        const wideZone = Math.abs(passer.position.y - midline) > 10;
        if (wideZone && context.isInAttackingBox(teamId, receiver.position)) {
          sideBonus += roleBehavior.cross * 0.12;
        }
      }
      if (whippedPass) {
        const wideZone = Math.abs(passer.position.y - midline) > 10;
        if (wideZone && context.isInAttackingBox(teamId, receiver.position)) {
          sideBonus += context.getPlaystyleBonus(passer, 'whipped_pass', 0.12, 0.16);
        }
      }

      if (prefersShort && distance > desiredDistance) {
        distanceScore *= 0.85;
      }
      if (longBall && distance > desiredDistance) {
        distanceScore *= context.getPlaystyleMultiplier(passer, 'long_ball_pass', 1.08, 1.12);
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

      let score = 0.42 * distanceScore + 0.24 * opennessScore + 0.2 * forwardScore + sideBonus + runBonus;
      score *= clamp(rangeFactor, 0.6, 1.3);

      if (context.rules.isOffsidePosition(context.state, teamId, receiver)) {
        score *= 0.25;
      }

      if (distance > desiredDistance * 1.7) {
        score *= 0.6;
      }

      return { receiver, score: Math.max(0, score) };
    })
    .filter((entry): entry is { receiver: SimPlayer; score: number } => Boolean(entry))
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
};

export const getPassLeadPosition = (
  context: DecisionContext,
  passer: SimPlayer,
  receiver: SimPlayer,
  instructions: Record<string, string> | undefined
) => {
  const direction = context.getAttackDirection(passer.teamId);
  const target = receiver.tacticalPosition ?? receiver.targetPosition ?? receiver.position;
  const receiverAxis = context.getAttackAxis(receiver.position.x, direction);
  const targetAxis = context.getAttackAxis(target.x, direction);
  const runAhead = targetAxis - receiverAxis;
  if (runAhead < 2) return null;

  const vision = context.getAttribute(passer, 'vision');
  const decisions = context.getAttribute(passer, 'decisions');
  const technique = context.getAttribute(passer, 'technique');
  const throughSkill = (vision + decisions + technique) / 300;
  let chance = 0.25 + throughSkill * 0.5;
  if (context.hasTrait(passer, 'tries_killer_balls_often')) chance += 0.18;
  chance += context.getPlaystyleBonus(passer, 'incisive_pass', 0.12, 0.16);
  chance += context.getPlaystyleBonus(passer, 'inventive', 0.08, 0.12);
  chance += context.getPlaystyleBonus(passer, 'gamechanger', 0.06, 0.1);
  chance += context.getPlaystyleBonus(passer, 'trivela', 0.04, 0.06);
  if (context.hasTrait(passer, 'plays_no_through_balls')) chance -= 0.25;
  if (instructions?.passing_directness === 'Much Shorter') chance -= 0.1;
  if (instructions?.passing_directness === 'Much More Direct') chance += 0.06;

  if (Math.random() > clamp(chance, 0.05, 0.75)) return null;
  return {
    x: clamp(target.x, 0.5, context.pitch.width - 0.5),
    y: clamp(target.y, 0.5, context.pitch.height - 0.5)
  };
};

export const getDesiredPassDistance = (
  context: DecisionContext,
  passer: SimPlayer,
  instructions: Record<string, string> | undefined
) => {
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

  const roleBehavior = context.getRoleBehavior(passer);
  const roleProfile = context.getRoleArchetypeProfile(passer);
  const creativeBias = context.getCreativeFreedomBias(instructions);
  const fatigue = passer.fatigue ?? 0;

  desired += context.getPlaystyleBonus(passer, 'tiki_taka', -3, -4);
  desired += context.getPlaystyleBonus(passer, 'long_ball_pass', 4, 6);
  desired += context.getPlaystyleBonus(passer, 'pinged_pass', 2, 3);
  desired += context.getPlaystyleBonus(passer, 'incisive_pass', 2, 3);
  desired += context.getPlaystyleBonus(passer, 'whipped_pass', 1, 2);
  desired += context.getPlaystyleBonus(passer, 'inventive', 1, 2);
  if (context.hasTrait(passer, 'plays_short_simple_passes')) desired -= 4;
  if (context.hasTrait(passer, 'tries_long_range_passes')) desired += 6;
  if (context.hasTrait(passer, 'tries_killer_balls_often')) desired += 4;
  if (context.hasTrait(passer, 'plays_with_back_to_goal')) desired -= 3;
  if (context.hasTrait(passer, 'stops_play')) desired -= 2;

  desired += (roleBehavior.risk + creativeBias) * 6;
  desired += roleBehavior.pass * 4;
  desired -= roleBehavior.hold * 2;
  desired += roleProfile.decision.passDistanceBias;
  desired *= 1 - fatigue * 0.12;

  return clamp(desired, 8, 36);
};

export const getOpponentDistance = (context: DecisionContext, position: Vector2, teamId: string) => {
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const player of context.state.players) {
    if (player.teamId === teamId || player.discipline?.red) continue;
    const dx = player.position.x - position.x;
    const dy = player.position.y - position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < closestDistance) {
      closestDistance = dist;
    }
  }
  return closestDistance;
};

export const findNearestOpponent = (context: DecisionContext, position: Vector2, teamId: string) => {
  const opponents = context.state.players.filter(
    (player) => player.teamId !== teamId && !player.discipline?.red
  );
  if (!opponents.length) return null;
  let best = opponents[0];
  let bestDistance = Math.hypot(position.x - best.position.x, position.y - best.position.y);
  opponents.forEach((player) => {
    const dist = Math.hypot(position.x - player.position.x, position.y - player.position.y);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = player;
    }
  });
  return best;
};

export const getPressureOnPlayer = (context: DecisionContext, player: SimPlayer) => {
  const distance = getOpponentDistance(context, player.position, player.teamId);
  if (!Number.isFinite(distance)) return 0;
  return clamp((6 - distance) / 6, 0, 1);
};
