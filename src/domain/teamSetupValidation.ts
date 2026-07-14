import { referenceData } from '../data/referenceData';
import { TeamSetupState } from './teamSetupTypes';

export type SetupValidationIssue = { path: string; message: string };

const roleGroupBySlot: Record<string, keyof typeof referenceData.roles> = {
  gk: 'goalkeeper', lb: 'full_back', rb: 'full_back', lcb: 'centre_back', rcb: 'centre_back',
  cb: 'centre_back', lwb: 'wing_back', rwb: 'wing_back', dm: 'defensive_midfield',
  ldm: 'defensive_midfield', rdm: 'defensive_midfield', cm: 'central_midfield',
  lcm: 'central_midfield', rcm: 'central_midfield', lm: 'wide_midfield', rm: 'wide_midfield',
  lam: 'attacking_midfield', ram: 'attacking_midfield', cam: 'attacking_midfield',
  ss: 'attacking_midfield', lw: 'winger', rw: 'winger', st: 'striker', lst: 'striker', rst: 'striker'
};

const dutiesByGroup: Record<string, string[]> = {
  goalkeeper: ['defend', 'support'], centre_back: ['defend', 'stopper', 'cover'],
  full_back: ['defend', 'support', 'attack'], wing_back: ['defend', 'support', 'attack'],
  defensive_midfield: ['defend', 'support'], central_midfield: ['defend', 'support', 'attack'],
  wide_midfield: ['support', 'attack'], attacking_midfield: ['support', 'attack'],
  winger: ['support', 'attack'], striker: ['support', 'attack']
};

const parseHex = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
};

const colorDistance = (left: string, right: string) => {
  const a = parseHex(left);
  const b = parseHex(right);
  if (!a || !b) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

export const validateTeamSetup = (setup: TeamSetupState | null): SetupValidationIssue[] => {
  if (!setup) return [{ path: 'setup', message: 'Match setup is missing.' }];
  const issues: SetupValidationIssue[] = [];
  if (setup.teams.length !== 2) issues.push({ path: 'teams', message: 'Exactly two teams are required.' });

  const teamIds = new Set<string>();
  setup.teams.forEach((team, teamIndex) => {
    const path = `teams.${teamIndex}`;
    if (!team.id || teamIds.has(team.id)) issues.push({ path: `${path}.id`, message: 'Team IDs must be unique.' });
    teamIds.add(team.id);
    if (team.roster.length < 11) issues.push({ path: `${path}.roster`, message: 'At least 11 players are required.' });
    if (team.slots.length !== 11) issues.push({ path: `${path}.slots`, message: 'Exactly 11 formation slots are required.' });
    if (team.bench.length > 9) issues.push({ path: `${path}.bench`, message: 'The bench may contain at most 9 players.' });

    const rosterIds = new Set<string>();
    const shirtNumbers = new Set<number>();
    team.roster.forEach((player, playerIndex) => {
      if (!player.id || rosterIds.has(player.id)) {
        issues.push({ path: `${path}.roster.${playerIndex}`, message: 'Every player needs a unique ID.' });
      }
      if (player.id) rosterIds.add(player.id);
      if (player.shirtNo !== undefined) {
        if (shirtNumbers.has(player.shirtNo)) {
          issues.push({ path: `${path}.roster.${playerIndex}.shirtNo`, message: 'Shirt numbers must be unique within a team.' });
        }
        shirtNumbers.add(player.shirtNo);
      }
    });

    const lineupIds = new Set<string>();
    team.slots.forEach((slot, slotIndex) => {
      const slotPath = `${path}.slots.${slotIndex}`;
      if (!slot.playerId) issues.push({ path: `${slotPath}.playerId`, message: `${slot.label} has no player.` });
      else if (!rosterIds.has(slot.playerId)) issues.push({ path: `${slotPath}.playerId`, message: `${slot.label} uses an unknown player.` });
      else if (lineupIds.has(slot.playerId)) issues.push({ path: `${slotPath}.playerId`, message: 'A player cannot occupy two slots.' });
      else lineupIds.add(slot.playerId);

      const group = roleGroupBySlot[slot.id];
      const validRoles = group ? referenceData.roles[group].map((role) => role.id) : [];
      if (slot.roleId && !validRoles.includes(slot.roleId)) {
        issues.push({ path: `${slotPath}.roleId`, message: `${slot.roleId} is not valid for ${slot.label}.` });
      }
      const validDuties = group ? dutiesByGroup[group] ?? [] : [];
      if (slot.dutyId && !validDuties.includes(slot.dutyId)) {
        issues.push({ path: `${slotPath}.dutyId`, message: `${slot.dutyId} is not valid for ${slot.label}.` });
      }
    });

    const benchIds = new Set<string>();
    team.bench.forEach((playerId, benchIndex) => {
      if (!rosterIds.has(playerId)) issues.push({ path: `${path}.bench.${benchIndex}`, message: 'Bench player is not in the roster.' });
      if (lineupIds.has(playerId)) issues.push({ path: `${path}.bench.${benchIndex}`, message: 'A starter cannot also be on the bench.' });
      if (benchIds.has(playerId)) issues.push({ path: `${path}.bench.${benchIndex}`, message: 'A bench player is duplicated.' });
      benchIds.add(playerId);
    });
  });

  if (setup.teams.length === 2 && colorDistance(setup.teams[0].primaryColor, setup.teams[1].primaryColor) < 80) {
    issues.push({ path: 'teams.kits', message: 'Primary kits are too similar. Choose more distinct colors.' });
  }
  return issues;
};

export const isTeamSetupValid = (setup: TeamSetupState | null) => validateTeamSetup(setup).length === 0;
