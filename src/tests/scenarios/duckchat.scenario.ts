import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "people can public chat and private message each other"
scenario(
  'two ducks chat in the lounge and in DMs',
  { setup: { users: { quack: {}, feather: {} } } },
  async ({ users }) => {
    const quack = users.quack;
    const feather = users.feather;

    await step('both ducks reach the desktop', async () => {
      await quack.page.goto('/');
      await expect(quack.page.getByRole('button', { name: 'Start' })).toBeVisible();
      await feather.page.goto('/');
      await expect(feather.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('quack opens DuckChat and posts in the lounge', async () => {
      await quack.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(quack.page.getByText('#duck-lounge')).toBeVisible();
      const box = quack.page.getByPlaceholder('Message #duck-lounge');
      await box.fill('hello pond!');
      await box.press('Enter');
      await expect(quack.page.getByText('hello pond!')).toBeVisible();
    });

    await step('feather sees the message', async () => {
      await feather.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(feather.page.getByText('hello pond!')).toBeVisible();
    });

    await step('feather starts a DM with quack', async () => {
      await feather.page.getByRole('button', { name: 'New direct message' }).click();
      await feather.page.getByTestId('person-row').first().click();
      const dmBox = feather.page.getByPlaceholder(/Message @/);
      await dmBox.fill('psst hi');
      await dmBox.press('Enter');
    });

    await step('quack sees the DM arrive', async () => {
      await expect(quack.page.getByTestId('channel-dm').first()).toBeVisible();
      await quack.page.getByTestId('channel-dm').first().click();
      await expect(quack.page.getByText('psst hi')).toBeVisible();
    });
  },
);
