import { attributeIdToName, attributeIds, attributeNameMap, normalizeKey, referenceData } from '../data/referenceData';
import { playerTraitIdMap } from '../data/playerTraits';
import { ImportError, ImportResult, PlayerImport, TeamImport } from '../domain/types';

type FileFormat = 'json' | 'csv';

type NumberParseOptions = {
  min?: number;
  max?: number;
  integer?: boolean;
  scale?: boolean;
};

const DEFAULT_TEAM = 'Team A';

const SCALE_TO_100 = (value: number) => Math.round(value * 5);

const playstyleIdMap = new Map(
  referenceData.playstyles.flatMap((playstyle) => [
    [normalizeKey(playstyle.id), playstyle.id],
    [normalizeKey(playstyle.name), playstyle.id]
  ])
);

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (char === '
') {
      row.push(field.trim());
      if (row.some((value) => value.length)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    if (char === '') {
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((value) => value.length)) {
      rows.push(row);
    }
  }

  return rows;
};

const scaleAttributeValue = (value: number) => {
  if (Number.isNaN(value)) return null;
  if (value < 0) return null;
  if (value <= 20) {
    return SCALE_TO_100(value);
  }
  if (value <= 100) {
    return Math.round(value);
  }
  return null;
};

const normalizeAttributes = (raw: Record<string, unknown>, errors: ImportError[], row?: number) => {
  const attributes: Record<string, number> = {};

  for (const [key, rawValue] of Object.entries(raw)) {
    const attrKey = attributeNameMap.get(normalizeKey(key));
    if (!attrKey) {
      continue;
    }

    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const scaled = scaleAttributeValue(value);

    if (scaled === null) {
      errors.push({
        row,
        field: key,
        message: `Invalid attribute value: ${rawValue}`
      });
      continue;
    }

    attributes[attrKey] = scaled;
  }

  const missing = attributeIds.filter((id) => attributes[id] === undefined);
  if (missing.length) {
    const missingNames = missing.map((id) => attributeIdToName.get(id) || id);
    errors.push({
      row,
      field: 'attributes',
      message: `Missing attributes: ${missingNames.join(', ')}`
    });
  }

  return { attributes, isComplete: !missing.length };
};

const getRawValue = (raw: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in raw) {
      const value = raw[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return undefined;
};

const parseOptionalNumber = (
  rawValue: unknown,
  errors: ImportError[],
  row: number | undefined,
  field: string,
  options: NumberParseOptions = {}
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return undefined;
  }
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (Number.isNaN(value)) {
    errors.push({ row, field, message: `Invalid number: ${rawValue}` });
    return undefined;
  }

  let finalValue = value;
  if (options.scale) {
    const scaled = scaleAttributeValue(value);
    if (scaled === null) {
      errors.push({ row, field, message: `Invalid value: ${rawValue}` });
      return undefined;
    }
    finalValue = scaled;
  }

  if (options.integer) {
    finalValue = Math.round(finalValue);
  }

  if (options.min !== undefined && finalValue < options.min) {
    errors.push({ row, field, message: `Value must be >= ${options.min}` });
    return undefined;
  }
  if (options.max !== undefined && finalValue > options.max) {
    errors.push({ row, field, message: `Value must be <= ${options.max}` });
    return undefined;
  }

  return finalValue;
};

const parsePlaystyleList = (
  raw: unknown,
  errors: ImportError[],
  row: number | undefined,
  field: string
) => {
  if (!raw) return [];

  const values = Array.isArray(raw)
    ? raw.map((value) => String(value))
    : String(raw)
        .split(/[|;/,]/g)
        .map((value) => value.trim())
        .filter(Boolean);

  const result = new Set<string>();
  values.forEach((value) => {
    const normalized = playstyleIdMap.get(normalizeKey(value));
    if (!normalized) {
      errors.push({
        row,
        field,
        message: `Unknown playstyle: ${value}`
      });
      return;
    }
    result.add(normalized);
  });

  return Array.from(result);
};

const parseTraitList = (
  raw: unknown,
  errors: ImportError[],
  row: number | undefined,
  field: string
) => {
  if (!raw) return [];

  const values = Array.isArray(raw)
    ? raw.map((value) => String(value))
    : String(raw)
        .split(/[|;/,]/g)
        .map((value) => value.trim())
        .filter(Boolean);

  const result = new Set<string>();
  values.forEach((value) => {
    const normalized = playerTraitIdMap.get(normalizeKey(value));
    if (!normalized) {
      errors.push({
        row,
        field,
        message: `Unknown player trait: ${value}`
      });
      return;
    }
    result.add(normalized);
  });

  return Array.from(result);
};

const buildPlayer = (raw: Record<string, unknown>, errors: ImportError[], row?: number): PlayerImport | null => {
  const name = String(raw.name || raw.player || '').trim();
  if (!name) {
    errors.push({ row, field: 'name', message: 'Player name is required.' });
  }

  const positionsRaw = String(raw.positions || raw.position || '').trim();
  const positions = positionsRaw
    ? positionsRaw.split(/[|;/]/g).map((pos) => pos.trim()).filter(Boolean)
    : [];

  if (!positions.length) {
    errors.push({ row, field: 'positions', message: 'At least one position is required.' });
  }

  const nestedAttributes =
    raw.attributes && typeof raw.attributes === 'object' ? (raw.attributes as Record<string, unknown>) : {};
  const attributeSource = { ...nestedAttributes, ...raw };
  const { attributes, isComplete } = normalizeAttributes(attributeSource, errors, row);

  const playstyles = parsePlaystyleList(raw.playstyles ?? raw.playstyle ?? raw.play_styles, errors, row, 'playstyles');
  const playstylesPlus = parsePlaystyleList(
    raw.playstyles_plus ?? raw.playstyle_plus ?? raw.playstylesPlus ?? raw.playstylePlus,
    errors,
    row,
    'playstylesPlus'
  );

  const traits = parseTraitList(
    raw.playerTraits ?? raw.player_traits ?? raw.traits,
    errors,
    row,
    'playerTraits'
  );

  const shirtNo = parseOptionalNumber(
    getRawValue(raw, ['shirtNo', 'shirt_no', 'shirt', 'number', 'shirtNumber']),
    errors,
    row,
    'shirtNo',
    { min: 1, max: 99, integer: true }
  );

  const age = parseOptionalNumber(getRawValue(raw, ['age']), errors, row, 'age', { min: 14, max: 45 });
  const heightCm = parseOptionalNumber(
    getRawValue(raw, ['heightCm', 'height_cm', 'height', 'Height', 'height (cm)']),
    errors,
    row,
    'heightCm',
    { min: 140, max: 220 }
  );
  const weightKg = parseOptionalNumber(
    getRawValue(raw, ['weightKg', 'weight_kg', 'weight', 'Weight', 'weight (kg)']),
    errors,
    row,
    'weightKg',
    { min: 45, max: 120 }
  );

  const leftFoot = parseOptionalNumber(
    getRawValue(raw, ['leftFoot', 'left_foot', 'left foot', 'Left Foot', 'leftfoot']),
    errors,
    row,
    'leftFoot',
    { min: 0, max: 100, scale: true }
  );
  const rightFoot = parseOptionalNumber(
    getRawValue(raw, ['rightFoot', 'right_foot', 'right foot', 'Right Foot', 'rightfoot']),
    errors,
    row,
    'rightFoot',
    { min: 0, max: 100, scale: true }
  );

  const nationalityRaw = getRawValue(raw, ['nationality', 'nation', 'country']);
  const nationality = nationalityRaw ? String(nationalityRaw).trim() : undefined;

  if (!name || !positions.length || !isComplete) {
    return null;
  }

  return {
    id: raw.id ? String(raw.id) : undefined,
    name,
    shirtNo,
    age,
    heightCm,
    weightKg,
    leftFoot,
    rightFoot,
    nationality,
    positions,
    attributes,
    playstyles,
    playstylesPlus,
    traits
  };
};

const buildTeams = (players: Array<{ team: string; player: PlayerImport }>) => {
  const teamMap = new Map<string, TeamImport>();
  for (const entry of players) {
    if (!teamMap.has(entry.team)) {
      teamMap.set(entry.team, { name: entry.team, players: [] });
    }
    teamMap.get(entry.team)?.players.push(entry.player);
  }
  return Array.from(teamMap.values());
};

export class DataImportAgent {
  getReferenceData() {
    return referenceData;
  }

  async importFile(file: File): Promise<ImportResult> {
    const format = this.detectFormat(file);
    const text = await file.text();
    return this.importText(text, format);
  }

  detectFormat(file: File): FileFormat {
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.csv')) return 'csv';
    return 'json';
  }

  importText(text: string, format: FileFormat): ImportResult {
    const errors: ImportError[] = [];
    let teams: TeamImport[] = [];

    if (format === 'json') {
      teams = this.importJson(text, errors);
    } else {
      teams = this.importCsv(text, errors);
    }

    return { teams, errors };
  }

  importJson(text: string, errors: ImportError[]) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      errors.push({ message: 'Invalid JSON file.' });
      return [];
    }

    if (typeof data !== 'object' || data === null) {
      errors.push({ message: 'JSON root must be an object.' });
      return [];
    }

    const root = data as Record<string, unknown>;
    const teamsRaw = Array.isArray(root.teams) ? root.teams : null;
    const playersRaw = Array.isArray(root.players) ? root.players : null;

    if (teamsRaw) {
      return teamsRaw.map((team, index) => {
        const teamObj = team as Record<string, unknown>;
        const name = String(teamObj.name || `Team ${index + 1}`);
        const players = Array.isArray(teamObj.players) ? teamObj.players : [];
        const parsedPlayers = this.parsePlayers(players, errors);
        return { name, players: parsedPlayers };
      });
    }

    if (playersRaw) {
      const parsedPlayers = this.parsePlayers(playersRaw, errors);
      return [{ name: DEFAULT_TEAM, players: parsedPlayers }];
    }

    errors.push({ message: 'JSON must include "teams" or "players".' });
    return [];
  }

  parsePlayers(players: unknown[], errors: ImportError[]) {
    const results: PlayerImport[] = [];
    players.forEach((player, index) => {
      const record = player as Record<string, unknown>;
      const parsed = buildPlayer(record, errors, index + 1);
      if (parsed) {
        results.push(parsed);
      }
    });
    return results;
  }

  importCsv(text: string, errors: ImportError[]) {
    const rows = parseCsv(text);
    if (!rows.length) {
      errors.push({ message: 'CSV file is empty.' });
      return [];
    }

    const headers = rows[0].map((h) => h.trim());
    const entries: Array<{ team: string; player: PlayerImport }> = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = row[idx] ?? '';
      });

      const teamName = String(record.team || record.Team || DEFAULT_TEAM).trim() || DEFAULT_TEAM;
      const player = buildPlayer(record, errors, i + 1);

      if (player) {
        entries.push({ team: teamName, player });
      }
    }

    return buildTeams(entries);
  }
}
