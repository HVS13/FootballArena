import { MatchStats, TeamMatchStats } from '../domain/matchTypes';
import { SimulationState } from '../domain/simulationTypes';
import { MatchEvent } from '../domain/matchContracts';

const createTeamStats = (): TeamMatchStats => ({
  possessionSeconds: 0,
  passesAttempted: 0,
  passes: 0,
  shots: 0,
  shotsOnTarget: 0,
  shotsOffTarget: 0,
  shotsBlocked: 0,
  goals: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  offsides: 0,
  corners: 0,
  tacklesWon: 0,
  interceptions: 0,
  saves: 0,
  xg: 0,
  substitutions: 0
});

export class StatsAgent {
  private stats: MatchStats;

  constructor(teamIds: string[]) {
    const byTeam: Record<string, TeamMatchStats> = {};
    teamIds.forEach((id) => {
      byTeam[id] = createTeamStats();
    });

    this.stats = {
      byTeam,
      clockSeconds: 0
    };
  }

  step(state: SimulationState, dt: number, possessionTeamId?: string | null) {
    this.stats.clockSeconds = state.time;
    const possession = possessionTeamId === undefined ? this.resolvePossession(state) : possessionTeamId;

    if (possession) {
      this.stats.byTeam[possession].possessionSeconds += dt;
    }
  }

  static replay(teamIds: string[], events: MatchEvent[]) {
    const agent = new StatsAgent(teamIds);
    let possessionTeamId: string | null = null;
    let possessionStartedAt = 0;
    [...events].sort((left, right) => left.sequence - right.sequence).forEach((event) => {
      if (event.type === 'PossessionChanged' || event.type === 'FullTime') {
        if (possessionTeamId && agent.stats.byTeam[possessionTeamId]) {
          agent.stats.byTeam[possessionTeamId].possessionSeconds += Math.max(
            0,
            event.timeSeconds - possessionStartedAt
          );
        }
        possessionStartedAt = event.timeSeconds;
        if (event.type === 'PossessionChanged') {
          possessionTeamId = event.data?.controlled === true ? event.teamId ?? null : null;
        } else {
          possessionTeamId = null;
        }
      }
      agent.recordEvent(event);
      agent.stats.clockSeconds = Math.max(agent.stats.clockSeconds, event.timeSeconds);
    });
    return agent.getStats();
  }

  recordEvent(event: MatchEvent) {
    const teamId = event.teamId;
    if (!teamId || !this.stats.byTeam[teamId]) return;
    const stats = this.stats.byTeam[teamId];
    switch (event.type) {
      case 'PassAttempted':
        stats.passesAttempted += 1;
        break;
      case 'PassCompleted':
        stats.passes += 1;
        break;
      case 'ShotTaken': {
        stats.shots += 1;
        const outcome = event.data?.outcome;
        if (outcome === 'goal' || outcome === 'on_target') stats.shotsOnTarget += 1;
        if (outcome === 'off_target') stats.shotsOffTarget += 1;
        if (outcome === 'blocked') stats.shotsBlocked += 1;
        const xg = event.data?.xg;
        if (typeof xg === 'number') stats.xg += xg;
        break;
      }
      case 'GoalScored':
        stats.goals += 1;
        break;
      case 'FoulCommitted':
        stats.fouls += 1;
        break;
      case 'CardShown':
        if (event.data?.card === 'yellow') stats.yellowCards += 1;
        if (event.data?.card === 'red') stats.redCards += 1;
        break;
      case 'OffsideCalled':
        stats.offsides += 1;
        break;
      case 'CornerAwarded':
        stats.corners += 1;
        break;
      case 'TackleWon':
        stats.tacklesWon += 1;
        break;
      case 'InterceptionMade':
        stats.interceptions += 1;
        break;
      case 'SaveMade':
        stats.saves += 1;
        break;
      case 'SubstitutionMade':
        stats.substitutions += 1;
        break;
    }
  }

  recordPass(teamId: string) {
    this.stats.byTeam[teamId].passes += 1;
  }

  recordPassAttempt(teamId: string) {
    this.stats.byTeam[teamId].passesAttempted += 1;
  }

  recordShot(teamId: string) {
    this.stats.byTeam[teamId].shots += 1;
  }

  recordShotOnTarget(teamId: string) {
    this.stats.byTeam[teamId].shotsOnTarget += 1;
  }

  recordShotOffTarget(teamId: string) {
    this.stats.byTeam[teamId].shotsOffTarget += 1;
  }

  recordShotBlocked(teamId: string) {
    this.stats.byTeam[teamId].shotsBlocked += 1;
  }

  recordGoal(teamId: string) {
    this.stats.byTeam[teamId].goals += 1;
  }

  recordFoul(teamId: string) {
    this.stats.byTeam[teamId].fouls += 1;
  }

  recordYellow(teamId: string) {
    this.stats.byTeam[teamId].yellowCards += 1;
  }

  recordRed(teamId: string) {
    this.stats.byTeam[teamId].redCards += 1;
  }

  recordOffside(teamId: string) {
    this.stats.byTeam[teamId].offsides += 1;
  }

  recordCorner(teamId: string) {
    this.stats.byTeam[teamId].corners += 1;
  }

  recordTackle(teamId: string) {
    this.stats.byTeam[teamId].tacklesWon += 1;
  }

  recordInterception(teamId: string) {
    this.stats.byTeam[teamId].interceptions += 1;
  }

  recordSave(teamId: string) {
    this.stats.byTeam[teamId].saves += 1;
  }

  recordXg(teamId: string, value: number) {
    this.stats.byTeam[teamId].xg += value;
  }

  recordSubstitution(teamId: string) {
    this.stats.byTeam[teamId].substitutions += 1;
  }

  getStats() {
    return this.stats;
  }

  private resolvePossession(state: SimulationState) {
    let closestTeam: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const player of state.players) {
      if (player.discipline?.red) continue;
      const dx = player.position.x - state.ball.position.x;
      const dy = player.position.y - state.ball.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestTeam = player.teamId;
      }
    }

    return closestTeam;
  }
}
