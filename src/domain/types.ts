export type AttributeValue = number;

export type PlayerAttributes = Record<string, AttributeValue>;

export type PlayerImport = {
  id?: string;
  name: string;
  shirtNo?: number;
  age: number;
  heightCm: number;
  weightKg: number;
  leftFoot: number;
  rightFoot: number;
  nationality: string;
  positions: string[];
  attributes: PlayerAttributes;
  playstyles?: string[];
  playstylesPlus?: string[];
  traits?: string[];
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
