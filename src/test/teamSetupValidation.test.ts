import { describe, expect, test } from 'vitest';
import { buildSetupFromTeams } from '../pages/TeamSetupPage';
import { validateTeamSetup } from '../domain/teamSetupValidation';
import { GameEngineAgent } from '../agents/GameEngineAgent';

describe('team setup validation', () => {
  test('accepts the built-in quick match setup', () => {
    expect(validateTeamSetup(buildSetupFromTeams([]))).toEqual([]);
  });

  test('rejects duplicate starters and indistinguishable kits', () => {
    const setup = buildSetupFromTeams([]);
    setup.teams[0].slots[1].playerId = setup.teams[0].slots[0].playerId;
    setup.teams[1].primaryColor = setup.teams[0].primaryColor;

    const messages = validateTeamSetup(setup).map((issue) => issue.message);
    expect(messages).toContain('A player cannot occupy two slots.');
    expect(messages).toContain('Primary kits are too similar. Choose more distinct colors.');
  });

  test('rejects invalid role and duty assignments for a slot', () => {
    const setup = buildSetupFromTeams([]);
    setup.teams[0].slots[0].roleId = 'advanced_forward';
    setup.teams[0].slots[0].dutyId = 'attack';

    const issues = validateTeamSetup(setup);
    expect(issues.some((issue) => issue.path.endsWith('roleId'))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith('dutyId'))).toBe(true);
  });

  test('prevents invalid setup from entering the match engine', () => {
    const setup = buildSetupFromTeams([]);
    setup.teams[0].slots[0].playerId = null;
    expect(() => new GameEngineAgent({ teamSetup: setup })).toThrow('Invalid match configuration');
  });

  test('rejects duplicate shirt numbers', () => {
    const setup = buildSetupFromTeams([]);
    setup.teams[0].roster[1].shirtNo = setup.teams[0].roster[0].shirtNo;
    expect(validateTeamSetup(setup).some((issue) => issue.path.endsWith('shirtNo'))).toBe(true);
  });
});
