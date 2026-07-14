import { describe, expect, test } from 'vitest';
import { GameEngineAgent } from '../agents/GameEngineAgent';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { TeamMatchStats } from '../domain/matchTypes';
import { TeamSetupState } from '../domain/teamSetupTypes';
import { buildSetupFromTeams } from '../pages/TeamSetupPage';

const suite = process.env.CALIBRATION_MATRIX === '1' ? describe : describe.skip;
const seeds = [3101, 3109, 3121, 3137, 3163, 3181, 3203, 3221];

const cloneSetup = () => structuredClone(buildSetupFromTeams([]));

const applyInstructions = (setup: TeamSetupState, teamIndex: number, presetId: string) => {
  const preset = TACTICAL_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) throw new Error(`Unknown tactical preset ${presetId}`);
  setup.teams[teamIndex].instructions = { ...setup.teams[teamIndex].instructions, ...preset.instructions };
};

const changeStrength = (setup: TeamSetupState, teamIndex: number, delta: number) => {
  setup.teams[teamIndex].roster.forEach((player) => {
    Object.keys(player.attributes).forEach((attribute) => {
      player.attributes[attribute] = Math.max(1, Math.min(100, player.attributes[attribute] + delta));
    });
  });
};

const play = (setup: TeamSetupState, seed: number, environment: EnvironmentState = DEFAULT_ENVIRONMENT) => {
  const engine = new GameEngineAgent({ tickRate: 2, seed, teamSetup: setup, environment });
  engine.advanceTicks(14_000);
  expect(engine.isMatchComplete()).toBe(true);
  const stats = engine.getStats();
  return {
    home: stats.byTeam[setup.teams[0].id],
    away: stats.byTeam[setup.teams[1].id],
    snapshot: engine.getSnapshot()
  };
};

const sum = (samples: TeamMatchStats[], field: keyof TeamMatchStats) =>
  samples.reduce((total, sample) => total + Number(sample[field]), 0);

suite('minimum calibration matchup matrix', () => {
  test('tactical styles produce measurable aggregate differences', () => {
    const possession: TeamMatchStats[] = [];
    const counter: TeamMatchStats[] = [];
    const pressing: TeamMatchStats[] = [];
    const lowBlock: TeamMatchStats[] = [];
    let pressingFatigue = 0;
    let lowBlockFatigue = 0;

    seeds.forEach((seed) => {
      const styleSetup = cloneSetup();
      applyInstructions(styleSetup, 0, 'tiki_taka_433');
      applyInstructions(styleSetup, 1, 'counter_352');
      const styleResult = play(styleSetup, seed);
      possession.push(styleResult.home);
      counter.push(styleResult.away);

      const pressureSetup = cloneSetup();
      applyInstructions(pressureSetup, 0, 'gegenpress_4231');
      applyInstructions(pressureSetup, 1, 'low_block_532');
      const pressureResult = play(pressureSetup, seed + 100);
      pressing.push(pressureResult.home);
      lowBlock.push(pressureResult.away);
      pressingFatigue += pressureResult.snapshot.players
        .filter((player) => player.teamId === pressureSetup.teams[0].id)
        .reduce((total, player) => total + player.fatigue, 0);
      lowBlockFatigue += pressureResult.snapshot.players
        .filter((player) => player.teamId === pressureSetup.teams[1].id)
        .reduce((total, player) => total + player.fatigue, 0);
    });

    const possessionPasses = sum(possession, 'passesAttempted');
    const counterPasses = sum(counter, 'passesAttempted');
    const pressingDefensiveActions = sum(pressing, 'tacklesWon') + sum(pressing, 'interceptions');
    const lowBlockDefensiveActions = sum(lowBlock, 'tacklesWon') + sum(lowBlock, 'interceptions');

    console.log({ possessionPasses, counterPasses, pressingDefensiveActions, lowBlockDefensiveActions, pressingFatigue, lowBlockFatigue });

    const pressProfileDistance =
      Math.abs(sum(pressing, 'fouls') - sum(lowBlock, 'fouls')) +
      Math.abs(sum(pressing, 'passesAttempted') - sum(lowBlock, 'passesAttempted')) +
      Math.abs(pressingDefensiveActions - lowBlockDefensiveActions);
    expect(possessionPasses).toBeGreaterThan(counterPasses);
    expect(pressProfileDistance).toBeGreaterThan(5);
    expect(pressingFatigue).toBeGreaterThan(lowBlockFatigue);
  }, 120_000);

  test('stronger teams outperform weaker teams without fixed-side dependence', () => {
    let strongGoals = 0;
    let weakGoals = 0;
    let strongXg = 0;
    let weakXg = 0;
    let strongPasses = 0;
    let weakPasses = 0;
    let strongAttempts = 0;
    let weakAttempts = 0;

    seeds.forEach((seed) => {
      const strongHome = cloneSetup();
      changeStrength(strongHome, 0, 35);
      changeStrength(strongHome, 1, -35);
      const homeResult = play(strongHome, seed + 200);
      strongGoals += homeResult.home.goals;
      weakGoals += homeResult.away.goals;
      strongXg += homeResult.home.xg;
      weakXg += homeResult.away.xg;
      strongPasses += homeResult.home.passes;
      weakPasses += homeResult.away.passes;
      strongAttempts += homeResult.home.passesAttempted;
      weakAttempts += homeResult.away.passesAttempted;

      const strongAway = cloneSetup();
      changeStrength(strongAway, 0, -35);
      changeStrength(strongAway, 1, 35);
      const awayResult = play(strongAway, seed + 300);
      strongGoals += awayResult.away.goals;
      weakGoals += awayResult.home.goals;
      strongXg += awayResult.away.xg;
      weakXg += awayResult.home.xg;
      strongPasses += awayResult.away.passes;
      weakPasses += awayResult.home.passes;
      strongAttempts += awayResult.away.passesAttempted;
      weakAttempts += awayResult.home.passesAttempted;
    });

    console.log({ strongGoals, weakGoals, strongXg, weakXg, strongPasses, weakPasses, strongAttempts, weakAttempts });
    expect(strongGoals).toBeGreaterThan(weakGoals);
    expect(strongPasses / strongAttempts).toBeGreaterThan(weakPasses / weakAttempts);
  }, 120_000);

  test('weather changes physical load and control mode does not break identical tactics', () => {
    const clearFatigue: number[] = [];
    const severeFatigue: number[] = [];

    seeds.forEach((seed) => {
      const setup = cloneSetup();
      const clear = play(setup, seed + 400);
      const severe = play(cloneSetup(), seed + 400, {
        ...DEFAULT_ENVIRONMENT,
        weather: 'storm',
        pitch: 'heavy',
        temperatureC: 32,
        wind: { x: 5, y: 3 }
      });
      clearFatigue.push(clear.snapshot.players.reduce((total, player) => total + player.fatigue, 0));
      severeFatigue.push(severe.snapshot.players.reduce((total, player) => total + player.fatigue, 0));
    });
    expect(severeFatigue.reduce((a, b) => a + b, 0)).toBeGreaterThan(clearFatigue.reduce((a, b) => a + b, 0));

    const human = cloneSetup();
    const ai = cloneSetup();
    ai.teams.forEach((team) => { team.controlType = 'ai'; });
    play(human, 3999);
    play(ai, 3999);
  }, 120_000);
});
