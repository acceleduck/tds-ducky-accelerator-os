import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "game scores land on a shared leaderboard"
scenario(
  'arcade leaderboard shows real saved scores',
  { setup: { users: { gamer: {} } } },
  async ({ users }) => {
    const gamer = users.gamer;

    await step('a score is posted for duck-dash', async () => {
      const res = await gamer.request('/api/v2/database/game_scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { game: 'duck-dash', player_name: 'Pinch', score: 42 },
      });
      if (!res.ok) throw new Error(`could not post score, HTTP ${res.status}`);
    });

    await step('the arcade opens with Duck Dash', async () => {
      await gamer.page.goto('/');
      await expect(gamer.page.getByRole('button', { name: 'Start' })).toBeVisible();
      await gamer.page.getByRole('button', { name: 'Duckcade' }).first().click();
      await gamer.page.getByRole('button', { name: /Duck Dash/ }).click();
      await expect(gamer.page.getByRole('button', { name: /Duck Dash/ })).toBeVisible();
    });

    await step('the leaderboard shows the score', async () => {
      await expect(gamer.page.getByText('Pinch')).toBeVisible();
    });
  },
);

// @kliv-spec-derived — from user intent: "make sure plinko has a money system"
scenario(
  'plinko bets real DuckCoins from the shared wallet',
  { setup: { users: { gambler: {} } } },
  async ({ users }) => {
    const gambler = users.gambler;

    await step('the arcade opens on Plinko Pond', async () => {
      await gambler.page.goto('/');
      await gambler.page.getByRole('button', { name: 'Start' }).click();
      await gambler.page.getByRole('button', { name: 'Duckcade' }).first().click();
      await gambler.page.getByRole('button', { name: /Plinko Pond/ }).click();
    });

    await step('the wallet shows the starting DuckCoins', async () => {
      await expect(gambler.page.getByText(/DuckCoins/).first()).toBeVisible();
    });

    await step('a chip is dropped for a real bet', async () => {
      await gambler.page.getByRole('button', { name: /Drop — bet/ }).click();
    });

    await step('the settled result appears', async () => {
      await expect(gambler.page.getByText(/Last: ×/).first()).toBeVisible();
    });
  },
);

// @kliv-spec-derived — from user intent: "add a ww2 game like ravenfield"
scenario(
  'duck war 3 is ready to deploy',
  { setup: { users: { soldier: {} } } },
  async ({ users }) => {
    const soldier = users.soldier;

    await step('the arcade opens on Duck War 3', async () => {
      await soldier.page.goto('/');
      await soldier.page.getByRole('button', { name: 'Start' }).click();
      await soldier.page.getByRole('button', { name: 'Duckcade' }).first().click();
      await expect(soldier.page.getByRole('button', { name: /Duck War 3/ })).toBeVisible();
    });

    await step('the battlefield briefing is shown', async () => {
      await expect(soldier.page.getByLabel('Duck War 3 battlefield')).toBeVisible();
      await expect(soldier.page.getByRole('button', { name: 'Deploy' })).toBeVisible();
    });
  },
);
