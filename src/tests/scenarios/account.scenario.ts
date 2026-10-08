import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "edit your account, add your own pfp" and "add logout etc"
scenario(
  'member edits their account and finds the power options',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the desktop appears after boot', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('open Settings from the desktop', async () => {
      await duck.page.getByRole('button', { name: 'Settings' }).first().click();
      await expect(duck.page.getByText('Personalization').first()).toBeVisible();
      await expect(duck.page.getByText('Account').first()).toBeVisible();
    });

    await step('set a display name', async () => {
      await duck.page.getByLabel('Display name').fill('Captain Quack');
      await duck.page.getByRole('button', { name: 'Save name' }).click();
      await expect(duck.page.getByText('Name saved')).toBeVisible();
    });

    await step('the profile is really saved to the account', async () => {
      const res = await duck.request('/api/v2/database/user_profiles?display_name=eq.Captain Quack');
      if (!res.ok) throw new Error(`expected the profile row, got HTTP ${res.status}`);
      const rows = res.json<{ display_name: string | null; pfp: string | null }[]>();
      if (rows.length < 1) throw new Error('no user_profiles row was saved with the new name');
    });

    await step('the start menu shows the name and opens account settings', async () => {
      await duck.page.getByRole('button', { name: 'Start' }).click();
      await expect(duck.page.getByRole('button', { name: 'Account settings' })).toBeVisible();
      await expect(duck.page.getByText('Captain Quack').first()).toBeVisible();
      await duck.page.getByRole('button', { name: 'Account settings' }).click();
      await expect(duck.page.getByText('Display name')).toBeVisible();
    });

    await step('the power menu offers sleep, lock, sign out, restart and shut down', async () => {
      await duck.page.getByRole('button', { name: 'Start' }).click();
      await duck.page.getByRole('button', { name: 'Power options' }).click();
      await expect(duck.page.getByRole('button', { name: 'Sleep' })).toBeVisible();
      await expect(duck.page.getByRole('button', { name: 'Lock' })).toBeVisible();
      // nth(1) — the Settings window's own sign-out button comes first in the DOM
      await expect(duck.page.getByRole('button', { name: 'Sign out' }).nth(1)).toBeVisible();
      await expect(duck.page.getByRole('button', { name: 'Restart' })).toBeVisible();
      await expect(duck.page.getByRole('button', { name: 'Shut down' })).toBeVisible();
    });
  },
);
