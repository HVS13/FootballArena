import { PitchDimensions, SimulationState, Vector2 } from '../../domain/simulationTypes';
import { RoleBehavior } from '../../data/roleBehavior';
import { clamp, lerp } from './engineMath';
import { TUNING } from '../../data/tuning';
import { PossessionState, RestartState, RoleArchetypeProfile, SimPlayer } from './engineTypes';

export type TacticalContext = {
  state: SimulationState;
  pitch: PitchDimensions;
  possession: PossessionState | null;
  restartState: RestartState | null;
  getTeamInstructions: (teamId: string) => Record<string, string> | undefined;
  getTeamScore: (teamId: string) => number;
  getRoleBehavior: (player: SimPlayer) => RoleBehavior;
  getRoleArchetypeProfile: (player: SimPlayer) => RoleArchetypeProfile;
  getAttackDirection: (teamId: string) => number;
  getAttribute: (player: SimPlayer, id: string, fallback?: number) => number;
  hasTrait: (player: SimPlayer, id: string) => boolean;
};

type TeamProfile = {
  speed: number;
  defensiveIQ: number;
  aggression: number;
  workRate: number;
};

export const updateTacticalTargets = (context: TacticalContext) => {
  if (context.restartState) {
    context.state.players.forEach((player) => {
      player.tacticalPosition = { ...player.homePosition };
      player.tacticalWander = 0.8;
    });
    return;
  }

  const possessionTeamId = context.possession?.teamId ?? null;
  const possessorId = context.possession?.playerId ?? null;
  const possessor =
    possessorId ? context.state.players.find((player) => player.id === possessorId) ?? null : null;
  const ball = context.state.ball.position;
  const pressTarget = possessor?.position ?? ball;
  const midY = context.pitch.height / 2;
  const teamShape = new Map<string, { defensiveLineAxis: number; engagementAxis: number; pressTrigger: number }>();
  const teamMarking = new Map<string, Map<string, SimPlayer>>();
  const pressingAssignments = new Map<string, { target: Vector2; intensity: number }>();
  const looseBallAssignments = possessionTeamId ? null : buildLooseBallAssignments(context, ball);
  const teamProfiles = new Map<string, TeamProfile>();

  context.state.teams.forEach((team) => {
    teamProfiles.set(team.id, buildTeamProfile(context, team.id));
  });

  context.state.teams.forEach((team) => {
    const instructions = context.getTeamInstructions(team.id);
    const direction = context.getAttackDirection(team.id);
    const profile = teamProfiles.get(team.id) ?? { speed: 0.5, defensiveIQ: 0.5, aggression: 0.5, workRate: 0.5 };
    teamShape.set(team.id, {
      defensiveLineAxis: getDefensiveLineAxis(instructions?.defensive_line, profile),
      engagementAxis: getLineOfEngagementAxis(instructions?.line_of_engagement, profile),
      pressTrigger: getPressTrigger(context, instructions, direction, ball, profile)
    });
    if (possessionTeamId && possessionTeamId !== team.id) {
      teamMarking.set(team.id, buildMarkingAssignments(context, team.id, direction));
      buildPressingAssignments(
        context,
        team.id,
        pressTarget,
        instructions,
        pressingAssignments
      );
    }
  });

  context.state.players.forEach((player) => {
    const behavior = context.getRoleBehavior(player);
    const roleProfile = context.getRoleArchetypeProfile(player);
    const instructions = context.getTeamInstructions(player.teamId);
    const direction = context.getAttackDirection(player.teamId);
    const base = player.homePosition;
    const lineDepth = getLineDepth(context, base.x, direction);
    const inPossession = possessionTeamId === player.teamId;
    const shape = teamShape.get(player.teamId);

    if (player.discipline?.red) {
      player.tacticalPosition = { ...player.position };
      player.tacticalWander = 0.2;
      player.targetPosition = { ...player.position };
      player.targetTimer = Math.min(player.targetTimer, 0.5);
      return;
    }

    if (isGoalkeeperRole(player)) {
      const goalX = getDefendingGoalX(context, player.teamId);
      const distanceToBall = Math.abs(ball.x - goalX);
      const sweeperFactor = clamp(behavior.advance, 0.05, 0.6);
      const maxAdvance = 5 + sweeperFactor * 10;
      const advance = clamp((distanceToBall / context.pitch.width) * maxAdvance, 1.5, maxAdvance);
      const pitchDirection = goalX === 0 ? 1 : -1;
      let anchorX = goalX + pitchDirection * advance;
      let anchorY = lerp(midY, ball.y, 0.1 + sweeperFactor * 0.25);

      anchorX = clamp(anchorX, player.radius, context.pitch.width - player.radius);
      anchorY = clamp(anchorY, player.radius, context.pitch.height - player.radius);

      player.tacticalPosition = { x: anchorX, y: anchorY };
      player.tacticalWander = 0.5;
      player.targetPosition = { x: anchorX, y: anchorY };
      player.targetTimer = Math.min(player.targetTimer, 0.4);
      return;
    }

    let advance = behavior.advance;
    let retreat = behavior.retreat;

    if (context.hasTrait(player, 'stays_back_at_all_times')) {
      advance = clamp(advance - 0.25, 0, 1);
      retreat = clamp(retreat + 0.15, 0, 1);
    }
    if (context.hasTrait(player, 'gets_forward_whenever_possible')) {
      advance = clamp(advance + 0.2, 0, 1);
    }
    if (context.hasTrait(player, 'gets_into_opposition_area')) {
      advance = clamp(advance + 0.15, 0, 1);
    }
    if (context.hasTrait(player, 'comes_deep_to_get_ball')) {
      advance = clamp(advance - 0.2, 0, 1);
      retreat = clamp(retreat + 0.1, 0, 1);
    }

    let widthBias = behavior.width;
    if (context.hasTrait(player, 'hugs_line')) widthBias += 0.2;
    if (context.hasTrait(player, 'cuts_inside')) widthBias -= 0.2;
    if (context.hasTrait(player, 'moves_into_channels')) widthBias += 0.12;
    if (inPossession) {
      widthBias += getAttackingWidthBias(instructions?.attacking_width);
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
      const defensiveLineOffset = getDefensiveLineOffset(instructions?.defensive_line);
      const lineScale = clamp(1.2 - lineDepth, 0.3, 1);
      anchorX += direction * defensiveLineOffset * lineScale;
    }
    const axisShift = inPossession ? roleProfile.inPossession.axisShift : roleProfile.outOfPossession.axisShift;
    anchorX += direction * axisShift;

    let anchorY = applyWidthBias(base.y, widthBias, midY);

    if (inPossession) {
      const roamPull = clamp(behavior.roam + roleProfile.inPossession.roamBias, 0, 1);
      anchorX = lerp(anchorX, ball.x, 0.08 * roamPull);
      anchorY = lerp(anchorY, ball.y, 0.12 * roamPull);

      const offTheBall = context.getAttribute(player, 'off_the_ball');
      const teamwork = context.getAttribute(player, 'teamwork');
      const supportFactor = clamp((offTheBall + teamwork) / 200, 0, 1);
      const playerAxis = getAttackAxis(context, anchorX, direction);
      const ballAxis = getAttackAxis(context, ball.x, direction);
      const axisDelta = clamp(ballAxis - playerAxis, -14, 14);
      let supportShift = axisDelta * (0.04 + supportFactor * 0.06);
      if (context.hasTrait(player, 'comes_deep_to_get_ball') && axisDelta < 0) {
        supportShift *= 1.2;
      }
      anchorX += direction * supportShift;

      if (player.id !== possessorId) {
        const anticipation = context.getAttribute(player, 'anticipation');
        const acceleration = context.getAttribute(player, 'acceleration');
        const decisions = context.getAttribute(player, 'decisions');
        const runSkill = clamp((offTheBall + anticipation + acceleration + decisions) / 400, 0, 1);
        let runBias = runSkill * 0.5 + behavior.advance * 0.45 + behavior.roam * 0.15;
        runBias += roleProfile.inPossession.runBias;

        if (context.hasTrait(player, 'comes_deep_to_get_ball')) runBias -= 0.25;
        if (context.hasTrait(player, 'stays_back_at_all_times')) runBias -= 0.3;
        if (context.hasTrait(player, 'gets_forward_whenever_possible')) runBias += 0.2;
        if (context.hasTrait(player, 'gets_into_opposition_area')) runBias += 0.15;
        if (context.hasTrait(player, 'likes_to_try_to_beat_offside_trap')) runBias += 0.18;
        if (context.hasTrait(player, 'arrives_late_in_opponents_area')) runBias += 0.12;
        if (context.hasTrait(player, 'plays_with_back_to_goal')) runBias -= 0.1;

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
        if (context.hasTrait(player, 'moves_into_channels')) {
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
        const channelTarget = getChannelLaneY(base.y, midY);
        anchorY = lerp(anchorY, channelTarget, clamp(channelBias, 0, 1));
      }

      const diagonalShift = roleProfile.inPossession.diagonalShift;
      if (Math.abs(diagonalShift) > 0.01) {
        const centerDir = base.y < midY ? 1 : -1;
        const centerPull = clamp(Math.abs(base.y - midY) / midY, 0.2, 1);
        anchorY += centerDir * diagonalShift * centerPull;
      }

      if (context.hasTrait(player, 'runs_with_ball_down_left')) {
        anchorY = lerp(anchorY, midY - midY * 0.45, 0.12);
      } else if (context.hasTrait(player, 'runs_with_ball_down_right')) {
        anchorY = lerp(anchorY, midY + midY * 0.45, 0.12);
      } else if (context.hasTrait(player, 'runs_with_ball_down_centre')) {
        anchorY = lerp(anchorY, midY, 0.12);
      }
    } else if (possessionTeamId) {
      const pressBias = getPressBias(instructions);
      const opponentId = getOpponentTeamId(context, player.teamId);
      const scoreDiff = opponentId ? context.getTeamScore(player.teamId) - context.getTeamScore(opponentId) : 0;
      const minute = context.state.time / 60;
      const chasingLate = scoreDiff < 0 ? clamp((minute - 55) / 25, 0, 1) : 0;
      const protectingLate = scoreDiff > 0 ? clamp((minute - 70) / 20, 0, 1) : 0;
      const urgency = clamp(chasingLate * 0.3 - protectingLate * 0.22, -0.3, 0.35);
      const pressTrigger = shape?.pressTrigger ?? 1;
      const pressPull = clamp(
        (behavior.press + pressBias + roleProfile.outOfPossession.pressBias + urgency) * pressTrigger,
        0,
        1.1
      );
      anchorX = lerp(anchorX, ball.x, 0.07 + pressPull * 0.15);
      anchorY = lerp(anchorY, ball.y, 0.06 + pressPull * 0.15);

      const compactness = getDefensiveCompactness(instructions);
      anchorY = midY + (anchorY - midY) * (1 - compactness);

      if (shape) {
        const lineTargetX = getLineTargetX(context, player, direction, shape.defensiveLineAxis, shape.engagementAxis);
        const lineWeight = 0.25 + behavior.retreat * 0.25 + (1 - behavior.roam) * 0.1;
        anchorX = lerp(anchorX, lineTargetX, clamp(lineWeight, 0.2, 0.55));
      }

      const defensiveLine = instructions?.defensive_line;
      let lineScale = 1;
      if (defensiveLine === 'Deeper') lineScale = 0.8;
      if (defensiveLine === 'Higher') lineScale = 1.1;
      if (defensiveLine === 'Much Higher') lineScale = 1.2;
      const lineAdjust = clamp((chasingLate * 1.4 - protectingLate * 1.8) * lineScale, -2, 2);
      anchorX += direction * lineAdjust;

      const lineBehavior = instructions?.defensive_line_behaviour;
      if (lineBehavior === 'Offside Trap') {
        anchorX += direction * 1.2;
      } else if (lineBehavior === 'Step Up') {
        anchorX += direction * 0.8;
      }

      const markingTarget = teamMarking.get(player.teamId)?.get(player.id) ?? findMarkingTarget(context, player);
      if (markingTarget) {
        const marking = context.getAttribute(player, 'marking');
        let markStrength = 0.04 + (marking / 100) * 0.22;
        if (context.hasTrait(player, 'marks_opponent_tightly')) markStrength += 0.12;
        markStrength += behavior.press * 0.08;
        markStrength = clamp(markStrength, 0, 0.35);
        anchorX = lerp(anchorX, markingTarget.position.x, markStrength);
        anchorY = lerp(anchorY, markingTarget.position.y, markStrength);
      }

      const pressAssignment = pressingAssignments.get(player.id);
      if (pressAssignment) {
        const pressWeight = 0.12 + pressAssignment.intensity * 0.35;
        anchorX = lerp(anchorX, pressAssignment.target.x, pressWeight);
        anchorY = lerp(anchorY, pressAssignment.target.y, pressWeight);
        player.tacticalWander = clamp((player.tacticalWander ?? 1) * 0.8, 0.4, 1.2);
        if (pressAssignment.intensity > 0.7) {
          player.targetPosition = { ...pressAssignment.target };
          player.targetTimer = Math.min(player.targetTimer, 0.35);
        }
      }
    } else if (looseBallAssignments && looseBallAssignments.has(player.id)) {
      const intensity = looseBallAssignments.get(player.id) ?? 0;
      anchorX = lerp(anchorX, ball.x, 0.12 + intensity * 0.3);
      anchorY = lerp(anchorY, ball.y, 0.12 + intensity * 0.3);
      player.tacticalWander = clamp((player.tacticalWander ?? 1) * 0.7, 0.35, 1.1);
      if (intensity > 0.7) {
        player.targetPosition = { ...ball };
        player.targetTimer = Math.min(player.targetTimer, 0.35);
      }
    }

    anchorX = clamp(anchorX, player.radius, context.pitch.width - player.radius);
    anchorY = clamp(anchorY, player.radius, context.pitch.height - player.radius);

    player.tacticalPosition = { x: anchorX, y: anchorY };

    let wander = 1 + behavior.roam * 0.7 - behavior.hold * 0.5;
    wander += inPossession ? roleProfile.inPossession.wanderBias : roleProfile.outOfPossession.wanderBias;
    if (!inPossession && possessionTeamId) {
      wander -= 0.05;
      const pressAssignment = pressingAssignments.get(player.id);
      if (pressAssignment) {
        wander -= pressAssignment.intensity * 0.2;
      }
    }
    const versatility = context.getAttribute(player, 'versatility');
    const versatilityFactor = 0.85 + (versatility / 100) * 0.3;
    player.tacticalWander = clamp(wander * versatilityFactor, 0.6, 1.6);

    const targetDistance = Math.hypot(player.targetPosition.x - anchorX, player.targetPosition.y - anchorY);
    if (targetDistance > 7) {
      player.targetPosition = { x: anchorX, y: anchorY };
      player.targetTimer = Math.min(player.targetTimer, 0.4);
    }
  });
};

const buildTeamProfile = (context: TacticalContext, teamId: string): TeamProfile => {
  const players = context.state.players.filter((player) => player.teamId === teamId && !player.discipline?.red);
  if (!players.length) {
    return { speed: 0.5, defensiveIQ: 0.5, aggression: 0.5, workRate: 0.5 };
  }
  let pace = 0;
  let acceleration = 0;
  let positioning = 0;
  let decisions = 0;
  let aggression = 0;
  let workRate = 0;
  players.forEach((player) => {
    pace += context.getAttribute(player, 'pace');
    acceleration += context.getAttribute(player, 'acceleration');
    positioning += context.getAttribute(player, 'positioning');
    decisions += context.getAttribute(player, 'decisions');
    aggression += context.getAttribute(player, 'aggression');
    workRate += context.getAttribute(player, 'work_rate');
  });
  const count = players.length;
  const speed = clamp((pace + acceleration) / (count * 200), 0, 1);
  const defensiveIQ = clamp((positioning + decisions) / (count * 200), 0, 1);
  const aggressionScore = clamp(aggression / (count * 100), 0, 1);
  const workRateScore = clamp(workRate / (count * 100), 0, 1);
  return {
    speed,
    defensiveIQ,
    aggression: aggressionScore,
    workRate: workRateScore
  };
};

const buildPressingAssignments = (
  context: TacticalContext,
  teamId: string,
  target: Vector2,
  instructions: Record<string, string> | undefined,
  assignments: Map<string, { target: Vector2; intensity: number }>
) => {
  const pressBias = getPressBias(instructions);
  const opponentId = getOpponentTeamId(context, teamId);
  const scoreDiff = opponentId ? context.getTeamScore(teamId) - context.getTeamScore(opponentId) : 0;
  const minute = context.state.time / 60;
  const chasingLate = scoreDiff < 0 ? clamp((minute - 55) / 25, 0, 1) : 0;
  const protectingLate = scoreDiff > 0 ? clamp((minute - 70) / 20, 0, 1) : 0;
  const neutralLate = scoreDiff === 0 ? clamp((minute - 65) / 25, 0, 1) * 0.1 : 0;
  let urgency = chasingLate * 0.35 + neutralLate - protectingLate * 0.25;
  if (instructions?.time_wasting === 'More Often' && scoreDiff > 0) {
    urgency -= 0.15;
  }
  if (instructions?.pressing_trap === 'Active') {
    const midY = context.pitch.height / 2;
    const wideZone = Math.abs(target.y - midY) > context.pitch.height * 0.32;
    if (wideZone) urgency += 0.12;
  }
  urgency = clamp(urgency, -0.3, 0.45);

  let pressCount = pressBias > 0.2 ? 3 : pressBias < -0.15 ? 1 : 2;
  if (urgency > 0.2) pressCount += 1;
  if (urgency < -0.2) pressCount -= 1;
  if (instructions?.pressing_trap === 'Active') {
    pressCount += 1;
  }
  pressCount = Math.round(clamp(pressCount, 1, 3));
  const candidates = context.state.players.filter(
    (player) => player.teamId === teamId && !player.discipline?.red && !isGoalkeeperRole(player)
  );

  if (!candidates.length) return;

  const scored = candidates.map((player) => {
    const behavior = context.getRoleBehavior(player);
    const profile = context.getRoleArchetypeProfile(player);
    const aggression = context.getAttribute(player, 'aggression');
    const workRate = context.getAttribute(player, 'work_rate');
    const acceleration = context.getAttribute(player, 'acceleration');
    const anticipation = context.getAttribute(player, 'anticipation');
    const bravery = context.getAttribute(player, 'bravery');
    const decisions = context.getAttribute(player, 'decisions');
    const pressSkill = clamp((aggression + workRate + acceleration + anticipation) / 400, 0, 1);
    const riskAppetite = clamp((aggression + bravery) / 200, 0, 1);
    const discipline = clamp(decisions / 100, 0, 1);
    const dist = Math.hypot(target.x - player.position.x, target.y - player.position.y);
    const distScore = 1 / (1 + dist);
    const pressFactor = clamp(behavior.press + profile.outOfPossession.pressBias + pressBias, -0.2, 1.2);
    const score =
      distScore *
      (0.6 + pressSkill * 0.8 + pressFactor + riskAppetite * 0.2 + urgency * 0.2 - discipline * 0.08);
    return { player, score, pressSkill, pressFactor, riskAppetite, discipline };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.slice(0, pressCount).forEach((entry, index) => {
    const intensityBase = 0.35 + entry.pressSkill * 0.45 + entry.pressFactor * 0.25;
    const intensity =
      clamp(
        intensityBase +
          (index === 0 ? 0.1 : 0) +
          entry.riskAppetite * 0.12 +
          urgency * 0.22 -
          entry.discipline * 0.06,
        0.25,
        0.95
      );
    assignments.set(entry.player.id, { target: { ...target }, intensity });
  });
};

const getOpponentTeamId = (context: TacticalContext, teamId: string) => {
  const team = context.state.teams.find((entry) => entry.id === teamId);
  if (!team) return null;
  const opponent = context.state.teams.find((entry) => entry.id !== teamId);
  return opponent?.id ?? null;
};

const buildLooseBallAssignments = (context: TacticalContext, ball: Vector2) => {
  const assignments = new Map<string, number>();
  context.state.teams.forEach((team) => {
    const instructions = context.getTeamInstructions(team.id);
    const transition = instructions?.defensive_transition;
    const players = context.state.players.filter(
      (player) => player.teamId === team.id && !player.discipline?.red && !isGoalkeeperRole(player)
    );
    if (!players.length) return;
    const sorted = players
      .map((player) => {
        const distance = Math.hypot(player.position.x - ball.x, player.position.y - ball.y);
        const acceleration = context.getAttribute(player, 'acceleration');
        const anticipation = context.getAttribute(player, 'anticipation');
        const bravery = context.getAttribute(player, 'bravery');
        const workRate = context.getAttribute(player, 'work_rate');
        const behavior = context.getRoleBehavior(player);
        const fatigue = clamp(player.fatigue ?? 0, 0, 1);
        const physicalScore =
          0.6 +
          (acceleration / 100) * 0.4 +
          (anticipation / 100) * 0.3 +
          (bravery / 100) * 0.2 +
          (workRate / 100) * 0.2;
        let contestScore = (1 / (1 + distance)) * physicalScore * (0.9 + behavior.press * 0.2);
        if (transition === 'Counter-Press') contestScore *= 1.08;
        if (transition === 'Regroup') contestScore *= 0.9;
        const score = contestScore * (1 - fatigue * 0.4);
        return { player, distance, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    sorted.forEach((entry, index) => {
      const base = index === 0 ? 0.8 : 0.55;
      const intensity = clamp(base + entry.score * 0.4, 0.4, 0.95);
      assignments.set(entry.player.id, intensity);
    });
  });
  return assignments;
};

export const getLineDepth = (context: TacticalContext, x: number, direction: number) => {
  const axis = getAttackAxis(context, x, direction);
  return clamp(axis / context.pitch.width, 0, 1);
};

export const getAttackAxis = (context: TacticalContext, x: number, direction: number) => {
  return direction === 1 ? x : context.pitch.width - x;
};

export const getLineOfEngagementAxis = (value: string | undefined, profile?: TeamProfile) => {
  const safeProfile = profile ?? { speed: 0.5, defensiveIQ: 0.5, aggression: 0.5, workRate: 0.5 };
  let base = TUNING.line.engagementAxis.mid;
  if (value === 'High Press') base = TUNING.line.engagementAxis.high;
  if (value === 'Low Block') base = TUNING.line.engagementAxis.low;
  const speedShift = (safeProfile.speed - 0.5) * TUNING.line.speedShift;
  const iqShift = (safeProfile.defensiveIQ - 0.5) * TUNING.line.positioningShift;
  const modifier = value === 'Low Block' ? 0.6 : value === 'High Press' ? 1 : 0.8;
  return clamp(base + (speedShift + iqShift) * modifier, 38, 66);
};

export const getDefensiveLineAxis = (value: string | undefined, profile?: TeamProfile) => {
  const safeProfile = profile ?? { speed: 0.5, defensiveIQ: 0.5, aggression: 0.5, workRate: 0.5 };
  let base = TUNING.line.defensiveAxis.standard;
  if (value === 'Deeper') base = TUNING.line.defensiveAxis.deeper;
  if (value === 'Higher') base = TUNING.line.defensiveAxis.higher;
  if (value === 'Much Higher') base = TUNING.line.defensiveAxis.muchHigher;
  const speedShift = (safeProfile.speed - 0.5) * TUNING.line.speedShift;
  const iqShift = (safeProfile.defensiveIQ - 0.5) * TUNING.line.positioningShift;
  const aggressionShift = (safeProfile.aggression - 0.5) * 1.5;
  const modifier = value === 'Deeper' ? 0.7 : value === 'Much Higher' ? 1.1 : 0.9;
  return clamp(base + (speedShift + iqShift + aggressionShift) * modifier, 18, 42);
};

export const getPressTrigger = (
  context: TacticalContext,
  instructions: Record<string, string> | undefined,
  direction: number,
  ball: Vector2,
  profile: TeamProfile
) => {
  const engagementAxis = getLineOfEngagementAxis(instructions?.line_of_engagement, profile);
  const ballAxis = getAttackAxis(context, ball.x, direction);
  const delta = (ballAxis - engagementAxis) / 18;
  return clamp(1 + delta, 0.6, 1.35);
};

export const getLineTargetX = (
  context: TacticalContext,
  player: SimPlayer,
  direction: number,
  defensiveLineAxis: number,
  engagementAxis: number
) => {
  const depth = getLineDepth(context, player.homePosition.x, direction);
  const profile = clamp(Math.pow(depth, 0.8), 0, 1);
  const axis = lerp(defensiveLineAxis, engagementAxis, profile);
  return direction === 1 ? axis : context.pitch.width - axis;
};

export const getLineBand = (depth: number) => {
  if (depth < 0.33) return 0;
  if (depth < 0.66) return 1;
  return 2;
};

export const buildMarkingAssignments = (context: TacticalContext, teamId: string, direction: number) => {
  const assignments = new Map<string, SimPlayer>();
  const taken = new Set<string>();
  const defenders = context.state.players.filter(
    (player) => player.teamId === teamId && !isGoalkeeperRole(player)
  );
  const opponents = context.state.players.filter((player) => player.teamId !== teamId);

  const sortedDefenders = defenders
    .slice()
    .sort(
      (a, b) =>
        getLineDepth(context, a.homePosition.x, direction) -
        getLineDepth(context, b.homePosition.x, direction)
    );

  sortedDefenders.forEach((defender) => {
    const marking = context.getAttribute(defender, 'marking');
    const positioning = context.getAttribute(defender, 'positioning');
    const behavior = context.getRoleBehavior(defender);
    const markSkill = (marking + positioning) / 2;
    const defensiveBias = behavior.retreat + behavior.press * 0.4;
    const allowMarking =
      markSkill >= 45 || defensiveBias >= 0.4 || context.hasTrait(defender, 'marks_opponent_tightly');
    if (!allowMarking) return;

    let markRadius = 10 + markSkill / 6;
    if (context.hasTrait(defender, 'marks_opponent_tightly')) {
      markRadius += 3;
    }

    const defenderAxis = getAttackAxis(context, defender.position.x, direction);
    const defenderBand = getLineBand(getLineDepth(context, defender.homePosition.x, direction));

    let best: { opponent: SimPlayer; score: number } | null = null;
    opponents.forEach((opponent) => {
      if (taken.has(opponent.id)) return;
      const distance = Math.hypot(
        opponent.position.x - defender.position.x,
        opponent.position.y - defender.position.y
      );
      if (distance > markRadius) return;
      const opponentAxis = getAttackAxis(context, opponent.position.x, direction);
      const axisDelta = opponentAxis - defenderAxis;
      let score = distance;
      const opponentBand = getLineBand(getLineDepth(context, opponent.position.x, direction));
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
};

export const applyWidthBias = (baseY: number, widthBias: number, midY: number) => {
  const clampedBias = clamp(widthBias, -0.6, 0.6);
  const offset = baseY - midY;
  return midY + offset * (1 + clampedBias);
};

export const getChannelLaneY = (baseY: number, midY: number) => {
  const side = Math.sign(baseY - midY);
  if (side === 0) return midY;
  const laneOffset = midY * 0.45;
  return midY + side * laneOffset;
};

export const getAttackingWidthBias = (value?: string) => {
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
};

export const getDefensiveLineOffset = (value?: string) => {
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
};

export const getPressBias = (instructions?: Record<string, string>) => {
  let bias = 0;
  if (instructions?.line_of_engagement === 'High Press') bias += 0.15;
  if (instructions?.line_of_engagement === 'Low Block') bias -= 0.15;
  if (instructions?.trigger_press === 'More Often') bias += 0.15;
  if (instructions?.trigger_press === 'Less Often') bias -= 0.15;
  if (instructions?.defensive_transition === 'Counter-Press') bias += 0.15;
  if (instructions?.defensive_transition === 'Regroup') bias -= 0.15;
  if (instructions?.pressing_trap === 'Active') bias += 0.08;
  return clamp(bias, -0.3, 0.35);
};

export const getDefensiveCompactness = (instructions?: Record<string, string>) => {
  let compactness = 0;
  if (instructions?.line_of_engagement === 'Low Block') compactness += 0.18;
  if (instructions?.line_of_engagement === 'High Press') compactness -= 0.1;
  if (instructions?.defensive_transition === 'Regroup') compactness += 0.12;
  if (instructions?.defensive_transition === 'Counter-Press') compactness -= 0.06;
  if (instructions?.pressing_trap === 'Active') compactness -= 0.04;
  return clamp(compactness, -0.15, 0.3);
};

export const findMarkingTarget = (context: TacticalContext, player: SimPlayer) => {
  const marking = context.getAttribute(player, 'marking');
  const positioning = context.getAttribute(player, 'positioning');
  const markingRadius = 10 + (marking + positioning) / 20;
  let closest: SimPlayer | null = null;
  let closestScore = Number.POSITIVE_INFINITY;
  for (const opponent of context.state.players) {
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
};

export const getDefendingGoalX = (context: TacticalContext, teamId: string) => {
  return context.getAttackDirection(teamId) === 1 ? 0 : context.pitch.width;
};

export const isGoalkeeperRole = (player: SimPlayer) => {
  const roleId = player.roleId;
  return (
    roleId === 'goalkeeper' ||
    roleId === 'line_holding_keeper' ||
    roleId === 'no_nonsense_goalkeeper' ||
    roleId === 'sweeper_keeper' ||
    roleId === 'ball_playing_goalkeeper'
  );
};

export const getCreativeFreedomBias = (instructions?: Record<string, string>) => {
  if (instructions?.creative_freedom === 'More Expressive') return 0.08;
  if (instructions?.creative_freedom === 'More Disciplined') return -0.08;
  return 0;
};

export const isInAttackingBox = (context: TacticalContext, teamId: string, position: Vector2) => {
  const goalX = teamId === context.state.teams[0]?.id ? context.pitch.width : 0;
  const boxDepth = 18;
  const boxHalfWidth = 20;
  const withinX = goalX === 0 ? position.x <= boxDepth : position.x >= context.pitch.width - boxDepth;
  const withinY = Math.abs(position.y - context.pitch.height / 2) <= boxHalfWidth;
  return withinX && withinY;
};
