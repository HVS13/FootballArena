import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const referenceData = JSON.parse(readFileSync(new URL('../src/data/referenceData.json', import.meta.url), 'utf8')) as {
  attributes: Record<string, Array<{ id: string }>>;
};
const attributeIds = Object.values(referenceData.attributes).flat().map((attribute) => attribute.id);

const buildImportedTeams = () => [
  { name: 'Imported North', prefix: 'north', nationality: 'Northland' },
  { name: 'Imported South', prefix: 'south', nationality: 'Southland' }
].map((team, teamIndex) => ({
  name: team.name,
  players: Array.from({ length: 20 }, (_, playerIndex) => ({
    id: `${team.prefix}-${playerIndex + 1}`,
    name: `${team.name} Player ${playerIndex + 1}`,
    shirtNo: playerIndex + 1,
    age: 20 + (playerIndex % 12),
    heightCm: 174 + (playerIndex % 14),
    weightKg: 68 + (playerIndex % 16),
    leftFoot: playerIndex % 3 === 0 ? 80 : 45,
    rightFoot: playerIndex % 3 === 0 ? 55 : 80,
    nationality: team.nationality,
    positions: playerIndex === 0 ? ['GK'] : ['CM'],
    attributes: Object.fromEntries(attributeIds.map((id) => [id, 55 + teamIndex * 5]))
  }))
}));

test('quick match completes the commentary-first local journey', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Full production-rate match runs once.');
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Football Arena' })).toBeVisible();
  await page.getByRole('button', { name: 'Quick Match' }).click();
  await expect(page.getByRole('heading', { name: 'Match View' })).toBeVisible();
  await page.getByRole('button', { name: 'Set speed to 16x' }).click();

  await page.clock.runFor(100_000);
  await page.clock.runFor(100_000);
  await expect(page.getByRole('button', { name: 'Start Second Half' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Second Half' }).click();

  await page.clock.runFor(100_000);
  await page.clock.runFor(100_000);
  await page.clock.runFor(100_000);
  await expect(page.getByText('Match finished. Full-time whistle blown.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rematch' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Teams' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Match' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
});

test('setup survives refresh and match controls work on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick Match' }).click();
  await page.getByRole('button', { name: 'Pause match' }).click();
  await expect(page.getByRole('button', { name: 'Resume match' })).toBeVisible();

  await page.goto('/setup');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Match' })).toBeEnabled();
});

test('imports two teams, starts a match, supports keyboard pause, and makes a human substitution', async ({ page }) => {
  await page.goto('/setup');
  await page.locator('#import-file').setInputFiles({
    name: 'local-teams.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ teams: buildImportedTeams() }))
  });

  await expect(page.getByText('Preview: 40 valid players across 2 teams.')).toBeVisible();
  await page.getByRole('button', { name: 'Apply Imported Teams' }).click();
  await expect(page.getByRole('button', { name: 'Start Match' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start Match' }).click();
  await expect(page.getByRole('heading', { name: 'Match View' })).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Resume match' })).toBeVisible();

  await page.getByLabel('Sub off player for Imported North').selectOption({ index: 1 });
  await page.getByLabel('Sub on player for Imported North').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Make substitution for Imported North' }).click();
  await expect(page.getByText('Subs: 1/5 | Windows: 1/3')).toBeVisible();
});
