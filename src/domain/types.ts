export type AttributeValue = number;

export type PlayerAttributes = Record<string, AttributeValue>;

export type PlayerImport = {
  id?: string;
  name: string;
  positions: string[];
  attributes: PlayerAttributes;
};

export type TeamImport = {
  name: string;
  players: PlayerImport[];
};

export type ImportError = {
  row?: number;
  field?: string;
  message: string;
};

export type ImportResult = {
  teams: TeamImport[];
  errors: ImportError[];
};
