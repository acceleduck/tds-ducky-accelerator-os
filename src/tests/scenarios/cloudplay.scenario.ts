import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "hook crazygames and itch.io games
// that actually play inside the OS, keep now.gg Roblox as a pop-out"
scenario(
  'cloudplay plays embedded games and offers the now.gg portal',
  { setup: { users: { player: {} } } },
  async ({ users }) => {
    const player = users.player;

    await step('the OS desktop loads', async () => {
      await player.page.goto('/');
      await player.page.getByRole('button', { name: 'Start' }).click();
    });

    await step('CloudPlay launches on the embed arcade', async () => {
      await player.page.getByRole('button', { name: 'CloudPlay' }).first().click();
      await expect(player.page.getByText('Smash Karts')).toBeVisible();
      await expect(player.page.getByLabel('Add a game by URL')).toBeVisible();
    });

    await step('a game opens in the built-in player', async () => {
      await player.page.getByRole('button', { name: /Smash Karts/ }).click();
      await expect(player.page.getByRole('button', { name: 'Back to arcade' })).toBeVisible();
    });

    await step('cloud portals still offer Roblox via now.gg', async () => {
      await player.page.getByRole('button', { name: 'Back to arcade' }).click();
      await player.page.getByRole('button', { name: 'Cloud portals' }).click();
      await expect(player.page.getByText('Roblox').first()).toBeVisible();
      await expect(player.page.getByText(/Open now\.gg in a new tab/)).toBeVisible();
    });
  },
);
