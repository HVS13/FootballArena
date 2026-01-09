import { describe, expect, test } from 'vitest';
import { DataImportAgent } from '../agents/DataImportAgent';
import { attributeIds } from '../data/referenceData';

const buildAttributes = (value: number) =>
  attributeIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = value;
    return acc;
  }, {});

describe('DataImportAgent', () => {
  test('imports JSON with scaled attributes, playstyles, and traits', () => {
    const agent = new DataImportAgent();
    const attributes = buildAttributes(10);
    const payload = {
      teams: [
        {
          name: 'Team A',
          players: [
            {
              name: 'Alex Striker',
              positions: 'ST',
              ...attributes,
              playstyles: 'Power Shot|Tiki Taka',
              playstyles_plus: 'Finesse Shot',
              playerTraits: 'Dictates Tempo|Tries Killer Balls Often',
              shirtNo: 9,
              age: 24,
              heightCm: 182,
              weightKg: 76,
              leftFoot: 15,
              rightFoot: 18,
              nationality: 'Brazil'
            }
          ]
        }
      ]
    };

    const result = agent.importText(JSON.stringify(payload), 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.teams).toHaveLength(1);
    const player = result.teams[0].players[0];
    expect(player.attributes.passing).toBe(50);
    expect(player.leftFoot).toBe(75);
    expect(player.playstyles).toEqual(expect.arrayContaining(['power_shot', 'tiki_taka']));
    expect(player.playstylesPlus).toEqual(['finesse_shot']);
    expect(player.traits).toEqual(expect.arrayContaining(['dictates_tempo', 'tries_killer_balls_often']));
  });

  test('records errors for unknown playstyles', () => {
    const agent = new DataImportAgent();
    const payload = {
      players: [
        {
          name: 'Jordan Tester',
          positions: 'CM',
          ...buildAttributes(12),
          playstyles: 'Unknown Style'
        }
      ]
    };

    const result = agent.importText(JSON.stringify(payload), 'json');
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].players).toHaveLength(1);
    expect(result.errors.some((error) => error.message.includes('Unknown playstyle'))).toBe(true);
  });

  test('imports CSV across multiple teams', () => {
    const agent = new DataImportAgent();
    const headers = ['team', 'name', 'positions', ...attributeIds, 'leftFoot', 'rightFoot'];
    const rowValues = ['Team A', 'Sam Forward', 'ST', ...attributeIds.map(() => '11'), '14', '17'];
    const rowValues2 = ['Team B', 'Leo Mid', 'CM', ...attributeIds.map(() => '9'), '12', '15'];
    const csv = `${headers.join(',')}\n${rowValues.join(',')}\n${rowValues2.join(',')}`;

    const result = agent.importText(csv, 'csv');
    expect(result.errors).toHaveLength(0);
    expect(result.teams).toHaveLength(2);
    expect(result.teams[0].players).toHaveLength(1);
    expect(result.teams[1].players).toHaveLength(1);
  });
});
