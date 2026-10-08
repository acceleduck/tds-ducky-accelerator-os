import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user report: "apps stay shut once you close or minimize them"
scenario(
  'an app comes back after minimizing or closing it',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the desktop appears after boot', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('open Speed Test from the desktop', async () => {
      await duck.page.getByRole('button', { name: 'Speed Test' }).first().click();
      await expect(duck.page.getByLabel('Speed Test window')).toBeVisible();
    });

    await step('minimize it and bring it back from the taskbar', async () => {
      await duck.page.getByRole('button', { name: 'Minimize' }).click();
      // the desktop icon matches first; the taskbar button is the second one
      await duck.page.getByRole('button', { name: 'Speed Test' }).nth(1).click();
      await expect(duck.page.getByLabel('Speed Test window')).toBeVisible();
      await expect(duck.page.getByRole('button', { name: 'Start test' })).toBeVisible();
    });

    await step('close it, then reopen it from the desktop', async () => {
      await duck.page.getByRole('button', { name: 'Close' }).click();
      await expect(duck.page.getByRole('button', { name: 'Start test' })).toBeHidden();
      await duck.page.getByRole('button', { name: 'Speed Test' }).first().click();
      await expect(duck.page.getByLabel('Speed Test window')).toBeVisible();
    });
  },
);
