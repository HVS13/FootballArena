export type TeamMatchStats = {
  possessionSeconds: number;
  passes: number;
  shots: number;
  goals: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
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
