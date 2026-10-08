import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "discord like mechanics like polls"
scenario(
  'two ducks run a poll with one vote each and end it',
  { setup: { users: { quack: {}, feather: {} } } },
  async ({ users }) => {
    const quack = users.quack;
    const feather = users.feather;

    await step('both ducks open chat', async () => {
      await quack.page.goto('/');
      await quack.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(quack.page.getByText('#duck-lounge')).toBeVisible();
      await feather.page.goto('/');
      await feather.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(feather.page.getByText('#duck-lounge')).toBeVisible();
    });

    await step('quack creates a poll', async () => {
      await quack.page.getByRole('button', { name: 'Create a poll' }).click();
      await quack.page.getByLabel('Poll question').fill('Best pond snack?');
      await quack.page.getByLabel('Poll option 1').fill('Bread');
      await quack.page.getByLabel('Poll option 2').fill('Corn');
      await quack.page.getByTestId('create-poll').click();
      await expect(quack.page.getByText('Best pond snack?')).toBeVisible();
    });

    await step('the poll really landed as a poll message', async () => {
      const res = await quack.request(
        '/api/v2/database/chat_messages?kind=eq.poll&poll_question=eq.Best pond snack?',
      );
      if (!res.ok) throw new Error(`expected the poll row, got HTTP ${res.status}`);
      const rows = res.json<{ poll_question: string | null }[]>();
      if (rows.length < 1) throw new Error('no poll message was stored');
    });

    await step('both ducks vote, and each holds exactly one vote', async () => {
      await feather.page.getByTestId('poll-option-0').click();
      await expect(feather.page.getByTestId('poll-pct-0')).toBeVisible();
      await quack.page.getByTestId('poll-option-0').click();
      await expect(quack.page.getByTestId('poll-pct-0')).toContainText('100%');
      const res = await quack.request('/api/v2/database/chat_poll_votes');
      const rows = res.json<{ user_uuid: string }[]>();
      if (rows.length !== 2) throw new Error(`expected 2 vote rows, found ${rows.length}`);
    });

    await step('changing your vote moves it instead of adding one', async () => {
      await feather.page.getByTestId('poll-option-1').click();
      await expect(feather.page.getByTestId('poll-pct-1')).toContainText('50%');
      const res = await feather.request('/api/v2/database/chat_poll_votes');
      const rows = res.json<{ user_uuid: string }[]>();
      if (rows.length !== 2) throw new Error(`vote change duplicated rows: ${rows.length}`);
    });

    await step('quack ends the poll and feather sees it locked', async () => {
      await quack.page.getByTestId('end-poll').click();
      await expect(quack.page.getByText('Poll ended')).toBeVisible();
      await expect(feather.page.getByText('Poll ended')).toBeVisible();
    });

    await step('a reaction lands on a message', async () => {
      const box = feather.page.getByPlaceholder('Message #duck-lounge');
      await box.fill('polls are great');
      await box.press('Enter');
      await expect(feather.page.getByText('polls are great')).toBeVisible();
      await quack.page.getByRole('button', { name: 'React 👍' }).first().click();
      await expect(quack.page.getByTestId('reaction-chip').first()).toContainText('1');
    });
  },
);
