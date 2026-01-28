import { MatchStats, TeamMatchStats } from '../domain/matchTypes';
import { SimulationState } from '../domain/simulationTypes';

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
  private lastPossessingTeamId: string | null = null;

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
    const possession = possessionTeamId ?? this.resolvePossession(state);

    if (possession) {
      this.stats.byTeam[possession].possessionSeconds += dt;
      this.lastPossessingTeamId = possession;
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
