export type TeamMatchStats = {
  possessionSeconds: number;
  passesAttempted: number;
  passes: number;
  shots: number;
  shotsOnTarget: number;
  shotsOffTarget: number;
  shotsBlocked: number;
  goals: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  corners: number;
  tacklesWon: number;
  interceptions: number;
  saves: number;
  xg: number;
  substitutions: number;
};

export type MatchStats = {
  byTeam: Record<string, TeamMatchStats>;
  clockSeconds: number;
};

export type CommentaryLine = {
  id: string;
  timeSeconds: number;
  text: string;
};
