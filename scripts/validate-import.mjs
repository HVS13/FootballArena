#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const usage = () => {
  console.log('Usage: node scripts/validate-import.mjs <path-to-json-or-csv>');
};

const inputPath = process.argv[2];
if (!inputPath || inputPath === '--help' || inputPath === '-h') {
  usage();
  process.exit(1);
}

const resolvedPath = path.resolve(inputPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`File not found: ${resolvedPath}`);
  process.exit(1);
}

const normalizeKey = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const referencePath = path.join(repoRoot, 'src', 'data', 'referenceData.json');
const traitsPath = path.join(repoRoot, 'src', 'data', 'playerTraits.ts');

const referenceData = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
const attributeItems = [
  ...referenceData.attributes.technical,
  ...referenceData.attributes.goalkeeping,
  ...referenceData.attributes.mental,
  ...referenceData.attributes.physical,
  ...referenceData.attributes.hidden
];

const attributeIds = new Set(attributeItems.map((item) => item.id));
const attributeNameMap = new Map(attributeItems.map((item) => [normalizeKey(item.name), item.id]));
const attributeIdToName = new Map(attributeItems.map((item) => [item.id, item.name]));

const playstyleIdMap = new Map(
  referenceData.playstyles.flatMap((playstyle) => [
    [normalizeKey(playstyle.id), playstyle.id],
    [normalizeKey(playstyle.name), playstyle.id]
  ])
);

const traitText = fs.readFileSync(traitsPath, 'utf8');
const extractStrings = (text, key) => {
  const results = [];
  const regex = new RegExp(`${key}\\s*:\\s*(['"])(.*?)\\1`, 'g');
  let match;
  while ((match = regex.exec(text))) {
    results.push(match[2]);
  }
  return results;
};
const traitKeys = new Set();
extractStrings(traitText, 'id').forEach((value) => traitKeys.add(normalizeKey(value)));
extractStrings(traitText, 'name').forEach((value) => traitKeys.add(normalizeKey(value)));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
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

    if (char === '\n') {
      row.push(field.trim());
      if (row.some((value) => value.length)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
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

const scaleAttributeValue = (value) => {
  if (Number.isNaN(value)) return null;
  if (value < 0) return null;
  if (value <= 20) return Math.round(value * 5);
  if (value <= 100) return Math.round(value);
  return null;
};

const parseList = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }
  return String(raw)
    .split(/[|;/,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
};

const getRawValue = (record, keys) => {
  for (const key of keys) {
    if (key in record) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return undefined;
};

const parseRequiredNumber = (rawValue, errors, row, field, options = {}) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    errors.push({ row, field, message: 'Value is required.' });
    return undefined;
  }
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (Number.isNaN(value)) {
    errors.push({ row, field, message: `Invalid number: ${rawValue}` });
    return undefined;
  }

  if (options.scale) {
    const scaled = scaleAttributeValue(value);
    if (scaled === null) {
      errors.push({ row, field, message: `Invalid value: ${rawValue}` });
      return undefined;
    }
    return scaled;
  }

  if (options.min !== undefined && value < options.min) {
    errors.push({ row, field, message: `Value must be >= ${options.min}` });
    return undefined;
  }
  if (options.max !== undefined && value > options.max) {
    errors.push({ row, field, message: `Value must be <= ${options.max}` });
    return undefined;
  }

  return value;
};

const parseRequiredString = (rawValue, errors, row, field) => {
  if (rawValue === undefined || rawValue === null) {
    errors.push({ row, field, message: 'Value is required.' });
    return undefined;
  }
  const value = String(rawValue).trim();
  if (!value) {
    errors.push({ row, field, message: 'Value is required.' });
    return undefined;
  }
  return value;
};

const validatePlayer = (record, row, errors) => {
  const name = String(record.name || record.player || '').trim();
  if (!name) {
    errors.push({ row, field: 'name', message: 'Player name is required.' });
  }

  const positionsRaw = record.positions ?? record.position ?? '';
  const positions = Array.isArray(positionsRaw)
    ? positionsRaw.map((pos) => String(pos).trim()).filter(Boolean)
    : String(positionsRaw).split(/[|;/]/g).map((pos) => pos.trim()).filter(Boolean);
  if (!positions.length) {
    errors.push({ row, field: 'positions', message: 'At least one position is required.' });
  }

  const nestedAttributes =
    record.attributes && typeof record.attributes === 'object' ? record.attributes : {};
  const attributeSource = { ...nestedAttributes, ...record };
  const attributes = {};

  Object.entries(attributeSource).forEach(([key, rawValue]) => {
    const attrKey = attributeNameMap.get(normalizeKey(key));
    if (!attrKey) return;
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const scaled = scaleAttributeValue(value);
    if (scaled === null) {
      errors.push({ row, field: key, message: `Invalid attribute value: ${rawValue}` });
      return;
    }
    attributes[attrKey] = scaled;
  });

  const missing = Array.from(attributeIds).filter((id) => attributes[id] === undefined);
  if (missing.length) {
    const missingNames = missing.map((id) => attributeIdToName.get(id) || id);
    errors.push({
      row,
      field: 'attributes',
      message: `Missing attributes: ${missingNames.join(', ')}`
    });
  }

  parseRequiredNumber(getRawValue(record, ['age']), errors, row, 'age', { min: 14, max: 45 });
  parseRequiredNumber(
    getRawValue(record, ['heightCm', 'height_cm', 'height', 'Height', 'height (cm)']),
    errors,
    row,
    'heightCm',
    { min: 140, max: 220 }
  );
  parseRequiredNumber(
    getRawValue(record, ['weightKg', 'weight_kg', 'weight', 'Weight', 'weight (kg)']),
    errors,
    row,
    'weightKg',
    { min: 45, max: 120 }
  );
  parseRequiredNumber(
    getRawValue(record, ['leftFoot', 'left_foot', 'left foot', 'Left Foot', 'leftfoot']),
    errors,
    row,
    'leftFoot',
    { min: 0, max: 100, scale: true }
  );
  parseRequiredNumber(
    getRawValue(record, ['rightFoot', 'right_foot', 'right foot', 'Right Foot', 'rightfoot']),
    errors,
    row,
    'rightFoot',
    { min: 0, max: 100, scale: true }
  );
  parseRequiredString(
    getRawValue(record, ['nationality', 'nation', 'country']),
    errors,
    row,
    'nationality'
  );

  const playstyles = parseList(record.playstyles ?? record.playstyle ?? record.play_styles);
  playstyles.forEach((value) => {
    if (!playstyleIdMap.has(normalizeKey(value))) {
      errors.push({ row, field: 'playstyles', message: `Unknown playstyle: ${value}` });
    }
  });

  const playstylesPlus = parseList(
    record.playstyles_plus ?? record.playstyle_plus ?? record.playstylesPlus ?? record.playstylePlus
  );
  playstylesPlus.forEach((value) => {
    if (!playstyleIdMap.has(normalizeKey(value))) {
      errors.push({ row, field: 'playstylesPlus', message: `Unknown playstyle: ${value}` });
    }
  });

  const traits = parseList(record.playerTraits ?? record.player_traits ?? record.traits);
  traits.forEach((value) => {
    if (!traitKeys.has(normalizeKey(value))) {
      errors.push({ row, field: 'playerTraits', message: `Unknown player trait: ${value}` });
    }
  });
};

const validateJson = (text, errors) => {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    errors.push({ field: 'json', message: 'Invalid JSON file.' });
    return { teams: 0, players: 0 };
  }

  if (typeof data !== 'object' || data === null) {
    errors.push({ field: 'json', message: 'JSON root must be an object.' });
    return { teams: 0, players: 0 };
  }

  const root = data;
  const teams = Array.isArray(root.teams) ? root.teams : null;
  const players = Array.isArray(root.players) ? root.players : null;

  let teamCount = 0;
  let playerCount = 0;

  if (teams) {
    teamCount = teams.length;
    teams.forEach((team, teamIndex) => {
      const playersList = Array.isArray(team.players) ? team.players : [];
      playersList.forEach((player, index) => {
        playerCount += 1;
        validatePlayer(player, index + 1, errors);
      });
    });
    return { teams: teamCount, players: playerCount };
  }

  if (players) {
    teamCount = 1;
    players.forEach((player, index) => {
      playerCount += 1;
      validatePlayer(player, index + 1, errors);
    });
    return { teams: teamCount, players: playerCount };
  }

  errors.push({ field: 'json', message: 'JSON must include "teams" or "players".' });
  return { teams: 0, players: 0 };
};

const validateCsv = (text, errors) => {
  const rows = parseCsv(text);
  if (!rows.length) {
    errors.push({ field: 'csv', message: 'CSV file is empty.' });
    return { teams: 0, players: 0 };
  }

  const headers = rows[0].map((header) => header.trim());
  let playerCount = 0;
  const teams = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] ?? '';
    });
    const teamName = String(record.team || record.Team || 'Team A').trim() || 'Team A';
    teams.add(teamName);
    playerCount += 1;
    validatePlayer(record, i + 1, errors);
  }

  return { teams: teams.size, players: playerCount };
};

const format = path.extname(resolvedPath).toLowerCase() === '.csv' ? 'csv' : 'json';
const text = fs.readFileSync(resolvedPath, 'utf8');
const errors = [];
const result = format === 'csv' ? validateCsv(text, errors) : validateJson(text, errors);

if (!result.players) {
  errors.push({ field: 'players', message: 'No players found.' });
}

if (!errors.length) {
  console.log(`OK: ${result.players} players across ${result.teams} team(s).`);
  process.exit(0);
}

console.error(`Found ${errors.length} issue(s) in ${result.players} player(s).`);
errors.slice(0, 50).forEach((error) => {
  const rowText = error.row ? `row ${error.row}` : 'row ?';
  console.error(`- ${rowText} [${error.field ?? 'field'}] ${error.message}`);
});
if (errors.length > 50) {
  console.error(`...and ${errors.length - 50} more.`);
}
process.exit(1);
