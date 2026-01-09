import { SetPieceWizardSettings } from '../../data/setPieceWizard';
import { PitchDimensions, Vector2 } from '../../domain/simulationTypes';
import { clamp } from './engineMath';
import { SetPieceAssignments, SetPieceRoleScores, SimPlayer } from './engineTypes';

export type SetPieceContext = {
  pitch: PitchDimensions;
  getAttackDirection: (teamId: string) => number;
  getGoalPosition: (teamId: string) => Vector2;
  getAttribute: (player: SimPlayer, id: string, fallback?: number) => number;
  getPlaystyleBonus: (player: SimPlayer, id: string, standard: number, plus: number) => number;
  getPlaystyleMultiplier: (player: SimPlayer, id: string, base?: number, plus?: number) => number;
  hasPlaystyle: (player: SimPlayer, id: string) => boolean;
  hasPlaystylePlus: (player: SimPlayer, id: string) => boolean;
  hasTrait: (player: SimPlayer, id: string) => boolean;
  isGoalkeeperRole: (player: SimPlayer) => boolean;
  getActiveTeamPlayers: (teamId: string) => SimPlayer[];
};

export const getSetPieceAssignments = (
  context: SetPieceContext,
  teamId: string,
  takerId: string | null,
  settings: SetPieceWizardSettings
): SetPieceAssignments => {
  const candidates = context
    .getActiveTeamPlayers(teamId)
    .filter((player) => player.id !== takerId && !context.isGoalkeeperRole(player));
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
    scores: getSetPieceRoleScores(context, player)
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
};

export const getSetPieceRoleScores = (context: SetPieceContext, player: SimPlayer): SetPieceRoleScores => {
  const finishing = context.getAttribute(player, 'finishing');
  const offTheBall = context.getAttribute(player, 'off_the_ball');
  const anticipation = context.getAttribute(player, 'anticipation');
  const composure = context.getAttribute(player, 'composure');
  const passing = context.getAttribute(player, 'passing');
  const vision = context.getAttribute(player, 'vision');
  const technique = context.getAttribute(player, 'technique');
  const decisions = context.getAttribute(player, 'decisions');
  const pace = context.getAttribute(player, 'pace');
  const stamina = context.getAttribute(player, 'stamina');
  const positioning = context.getAttribute(player, 'positioning');
  const workRate = context.getAttribute(player, 'work_rate');
  const tackling = context.getAttribute(player, 'tackling');
  const strength = context.getAttribute(player, 'strength');

  const aerial = getAerialScore(context, player);
  const box = (finishing + offTheBall + anticipation + composure) / 4 + strength * 0.1;
  const creator = (passing + vision + technique + decisions) / 4;
  const recovery = (pace + stamina + positioning + workRate) / 4 + tackling * 0.08;

  return { aerial, box, creator, recovery };
};

export const assignSetPieceTargets = (players: SimPlayer[], targets: Vector2[], positions: Map<string, Vector2>) => {
  if (!players.length || !targets.length) return;
  const available = players.filter((player) => !positions.has(player.id));
  targets.forEach((target) => {
    const player = available.shift();
    if (player) {
      positions.set(player.id, target);
    }
  });
};

export const assignRecoveryPositions = (
  context: SetPieceContext,
  teamId: string,
  players: SimPlayer[],
  positions: Map<string, Vector2>
) => {
  if (!players.length) return;
  const slots = getRecoveryPositions(context, teamId, players.length);
  const available = players.filter((player) => !positions.has(player.id)).slice(0, slots.length);
  slots.forEach((slot, index) => {
    const player = available[index];
    if (player) {
      positions.set(player.id, slot);
    }
  });
};

export const getRecoveryPositions = (context: SetPieceContext, teamId: string, count: number) => {
  const direction = context.getAttackDirection(teamId);
  const baseX = context.pitch.width / 2 - direction * 14;
  const midY = context.pitch.height / 2;
  const offsets = count === 1 ? [0] : count === 2 ? [-8, 8] : count === 3 ? [-10, 0, 10] : [-12, -4, 4, 12];

  return offsets.slice(0, count).map((offset) => ({
    x: clamp(baseX, 1, context.pitch.width - 1),
    y: clamp(midY + offset, 1, context.pitch.height - 1)
  }));
};

export const getAerialScore = (context: SetPieceContext, player: SimPlayer) => {
  const jumping = context.getAttribute(player, 'jumping_reach');
  const heading = context.getAttribute(player, 'heading');
  const strength = context.getAttribute(player, 'strength');
  const bravery = context.getAttribute(player, 'bravery');
  const height = player.heightCm;
  const heightBoost = clamp((height - 170) / 40, 0, 0.35);
  const weightBoost = clamp(1 + (player.weightKg - 75) * 0.003, 0.9, 1.1);
  let ageFactor = 1;
  if (player.age < 22) ageFactor = 0.96 + (player.age - 18) * 0.01;
  if (player.age > 30) ageFactor = 1 - (player.age - 30) * 0.006;
  ageFactor = clamp(ageFactor, 0.9, 1.02);
  let score = (jumping + heading + strength + bravery) / 4;
  score *= (1 + heightBoost) * weightBoost * ageFactor;
  score *= context.getPlaystyleMultiplier(player, 'aerial', 1.05, 1.08);
  score *= context.getPlaystyleMultiplier(player, 'aerial_fortress', 1.1, 1.16);
  score *= context.getPlaystyleMultiplier(player, 'power_header', 1.05, 1.08);
  score *= context.getPlaystyleMultiplier(player, 'precision_header', 1.04, 1.07);
  if (context.hasTrait(player, 'penalty_box_player')) score *= 1.05;
  return score;
};

export const pickBestAerialTarget = (context: SetPieceContext, teamId: string, excludeIds: Set<string>) => {
  const candidates = context.getActiveTeamPlayers(teamId).filter(
    (player) => !excludeIds.has(player.id) && !context.isGoalkeeperRole(player)
  );
  if (!candidates.length) return null;
  return (
    candidates.reduce((best, player) => {
      const score = getAerialScore(context, player);
      if (!best || score > best.score) {
        return { player, score };
      }
      return best;
    }, null as null | { player: SimPlayer; score: number })?.player ?? null
  );
};

export const pickThrowInTarget = (
  context: SetPieceContext,
  teamId: string,
  taker: SimPlayer,
  settings: SetPieceWizardSettings
) => {
  const candidates = context.getActiveTeamPlayers(teamId).filter(
    (player) => player.id !== taker.id && !context.isGoalkeeperRole(player)
  );
  if (!candidates.length) return null;

  const direction = context.getAttackDirection(teamId);
  const ballAxis = direction === 1 ? taker.position.x : context.pitch.width - taker.position.x;
  const longThrowSkill = context.getAttribute(taker, 'long_throws');
  const longThrowThreshold = context.hasPlaystylePlus(taker, 'long_throw') ? 55 : 65;
  const hasLongThrow =
    longThrowSkill >= longThrowThreshold ||
    context.hasTrait(taker, 'possesses_long_flat_throw') ||
    context.hasTrait(taker, 'uses_long_throw_to_start_counter_attacks') ||
    context.hasPlaystyle(taker, 'long_throw');

  const prefersLong =
    settings.numbersCommitted === 'stay_high' || settings.defensivePosture === 'counter_attack';
  const longAxisThreshold = context.hasPlaystylePlus(taker, 'long_throw') ? 0.4 : 0.45;
  if (hasLongThrow && ballAxis > context.pitch.width * longAxisThreshold && prefersLong) {
    return pickBestAerialTarget(context, teamId, new Set([taker.id])) ?? candidates[0];
  }

  let closest: SimPlayer | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach((player) => {
    const dist = Math.hypot(player.position.x - taker.position.x, player.position.y - taker.position.y);
    if (dist < closestDistance) {
      closestDistance = dist;
      closest = player;
    }
  });
  return closest;
};

export const pickSetPieceTargetBySpot = (
  context: SetPieceContext,
  teamId: string,
  spot: Vector2,
  excludeIds: Set<string>
) => {
  const candidates = context.getActiveTeamPlayers(teamId).filter(
    (player) => !excludeIds.has(player.id) && !context.isGoalkeeperRole(player)
  );
  if (!candidates.length) return null;

  return (
    candidates.reduce((best, player) => {
      const aerial = getAerialScore(context, player);
      const distance = Math.hypot(player.position.x - spot.x, player.position.y - spot.y);
      const score = aerial - distance * 0.6;
      if (!best || score > best.score) {
        return { player, score };
      }
      return best;
    }, null as null | { player: SimPlayer; score: number })?.player ?? null
  );
};

export const getCornerDeliverySpot = (
  context: SetPieceContext,
  cornerPosition: Vector2,
  teamId: string,
  settings: SetPieceWizardSettings
) => {
  const goal = context.getGoalPosition(teamId);
  const midY = context.pitch.height / 2;
  const cornerSide = cornerPosition.y < midY ? -1 : 1;
  const baseX = goal.x === 0 ? 6 : context.pitch.width - 6;
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
    x: clamp(baseX + swingOffset, 1, context.pitch.width - 1),
    y: clamp(targetY, 1, context.pitch.height - 1)
  };
};

export const getFreeKickDeliverySpot = (
  context: SetPieceContext,
  freeKickPosition: Vector2,
  teamId: string,
  settings: SetPieceWizardSettings
) => {
  const goal = context.getGoalPosition(teamId);
  const midY = context.pitch.height / 2;
  const baseX = goal.x === 0 ? 8 : context.pitch.width - 8;
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
    x: clamp(baseX + swingOffset, 1, context.pitch.width - 1),
    y: clamp(targetY, 1, context.pitch.height - 1)
  };
};

export const buildWallPositions = (context: SetPieceContext, ball: Vector2, goal: Vector2, count: number) => {
  const dx = goal.x - ball.x;
  const dy = goal.y - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  const dirX = dx / length;
  const dirY = dy / length;
  const center = {
    x: clamp(ball.x + dirX * 8, 1, context.pitch.width - 1),
    y: clamp(ball.y + dirY * 8, 1, context.pitch.height - 1)
  };
  const perpX = -dirY;
  const perpY = dirX;
  const spacing = 1.6;

  return Array.from({ length: count }, (_, index) => {
    const offset = (index - (count - 1) / 2) * spacing;
    return {
      x: clamp(center.x + perpX * offset, 1, context.pitch.width - 1),
      y: clamp(center.y + perpY * offset, 1, context.pitch.height - 1)
    };
  });
};

export const getCornerTargetPositions = (
  context: SetPieceContext,
  goalX: number,
  midY: number,
  cornerSide: number,
  settings: SetPieceWizardSettings,
  count: number
) => {
  const baseX = goalX === 0 ? 6 : context.pitch.width - 6;
  const farX = goalX === 0 ? 9 : context.pitch.width - 9;
  const edgeX = goalX === 0 ? 18 : context.pitch.width - 18;
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
    x: clamp(pos.x, 1, context.pitch.width - 1),
    y: clamp(pos.y, 1, context.pitch.height - 1)
  }));
};

export const getCornerZonePositions = (context: SetPieceContext, goalX: number, midY: number, cornerSide: number) => {
  const zoneX = goalX === 0 ? 4.5 : context.pitch.width - 4.5;
  return [
    { x: zoneX, y: midY + cornerSide * 3 },
    { x: zoneX, y: midY },
    { x: zoneX, y: midY - cornerSide * 3 }
  ];
};

export const assignPostCoverage = (
  context: SetPieceContext,
  defenders: SimPlayer[],
  positions: Map<string, Vector2>,
  goalX: number,
  midY: number,
  cornerSide: number,
  settings: SetPieceWizardSettings
) => {
  if (settings.postCoverage === 'no_posts') return;
  const postX = goalX === 0 ? 0.8 : context.pitch.width - 0.8;
  const nearPost = { x: postX, y: clamp(midY + cornerSide * 3, 1, context.pitch.height - 1) };
  const farPost = { x: postX, y: clamp(midY - cornerSide * 3, 1, context.pitch.height - 1) };
  const targets = settings.postCoverage === 'both_posts' ? [nearPost, farPost] : [nearPost];

  targets.forEach((pos) => {
    const marker = pickClosestPlayerToPosition(defenders, pos, positions);
    if (marker) {
      positions.set(marker.id, pos);
    }
  });
};

export const assignZonalMarkers = (
  context: SetPieceContext,
  defenders: SimPlayer[],
  positions: Map<string, Vector2>,
  goalX: number,
  midY: number,
  cornerSide: number,
  settings: SetPieceWizardSettings
) => {
  if (settings.markingSystem === 'player') return;
  const zones = getCornerZonePositions(context, goalX, midY, cornerSide);
  const zoneCount = settings.markingSystem === 'hybrid' ? 2 : zones.length;
  zones.slice(0, zoneCount).forEach((pos) => {
    const marker = pickClosestPlayerToPosition(defenders, pos, positions);
    if (marker) {
      positions.set(marker.id, pos);
    }
  });
};

export const assignCounterOutlets = (
  context: SetPieceContext,
  teamId: string,
  defenders: SimPlayer[],
  positions: Map<string, Vector2>,
  count: number
) => {
  const available = defenders.filter((player) => !positions.has(player.id));
  if (!available.length) return;
  const sorted = available.slice().sort((a, b) => context.getAttribute(b, 'pace') - context.getAttribute(a, 'pace'));
  const direction = context.getAttackDirection(teamId);
  const midX = context.pitch.width / 2 - direction * 8;
  const midY = context.pitch.height / 2;

  sorted.slice(0, count).forEach((player, index) => {
    positions.set(player.id, {
      x: clamp(midX, 1, context.pitch.width - 1),
      y: clamp(midY + (index === 0 ? -8 : 8), 1, context.pitch.height - 1)
    });
  });
};

const pickClosestPlayerToPosition = (
  candidates: SimPlayer[],
  position: Vector2,
  reserved: Map<string, Vector2>
) => {
  let closest: SimPlayer | null = null;
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
};
