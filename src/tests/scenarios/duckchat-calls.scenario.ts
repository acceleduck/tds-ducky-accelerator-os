import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "friends option to priv chat", "private call needs a code you paste"
scenario(
  'two ducks become friends and join a private call by code',
  { setup: { users: { quack: {}, feather: {} } } },
  async ({ users }) => {
    const quack = users.quack;
    const feather = users.feather;

    await step('both ducks reach the desktop and open chat', async () => {
      await quack.page.goto('/');
      await quack.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(quack.page.getByText('#duck-lounge')).toBeVisible();
      await feather.page.goto('/');
      await feather.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(feather.page.getByText('#duck-lounge')).toBeVisible();
    });

    await step('quack posts so feather can find them', async () => {
      await quack.page.getByRole('button', { name: 'DuckChat' }).first().click();
      const box = quack.page.getByPlaceholder('Message #duck-lounge');
      await box.fill('anyone up for a call?');
      await box.press('Enter');
      await expect(feather.page.getByText('anyone up for a call?')).toBeVisible();
    });

    await step('feather sends a friend request and quack accepts', async () => {
      await feather.page.getByRole('button', { name: 'Add friend' }).click();
      await feather.page.getByTestId('befriend-row').first().click();
      // a fresh load guarantees quack sees the request even when the slow
      // social poll hasn't ticked yet
      await quack.page.goto('/');
      await quack.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(quack.page.getByText('#duck-lounge')).toBeVisible();
      await quack.page.getByRole('button', { name: 'Accept friend' }).first().click();
      await expect(quack.page.getByTestId('friend-row').first()).toBeVisible();
    });

    await step('quack starts a private call and gets a code', async () => {
      await quack.page.getByTestId('new-private-call').click();
      await expect(quack.page.getByTestId('call-code')).toBeVisible();
    });

    await step('feather pastes the code and lands in the group call', async () => {
      const res = await quack.request('/api/v2/database/duck_call_rooms?status=eq.live&visibility=eq.private&order=_created_at.desc&limit=1');
      if (!res.ok) throw new Error(`could not read the call room, got HTTP ${res.status}`);
      const rows = res.json<{ code: string }[]>();
      const code = rows[0]?.code ?? '';
      if (!code) throw new Error('no live private call room was found');
      await feather.page.getByLabel('Call code').fill(code);
      await feather.page.getByTestId('join-code').click();
      await expect(feather.page.getByTestId('call-count')).toContainText('2');
      await expect(quack.page.getByTestId('call-count')).toContainText('2');
    });

    await step('feather leaves and quack ends the call', async () => {
      await feather.page.getByRole('button', { name: 'Leave call' }).click();
      await quack.page.getByRole('button', { name: 'End call' }).click();
      await expect(quack.page.getByText('#duck-lounge')).toBeVisible();
    });
  },
);

// @kliv-spec-derived — from user intent: "anti spam bots protecting the server"
scenario(
  'PondGuard slows down a duck who floods the lounge',
  { setup: { users: { loud: {} } } },
  async ({ users }) => {
    const loud = users.loud;

    await step('the duck opens chat', async () => {
      await loud.page.goto('/');
      await loud.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(loud.page.getByText('#duck-lounge')).toBeVisible();
    });

    await step('five quick messages fly out', async () => {
      const box = loud.page.getByPlaceholder('Message #duck-lounge');
      for (const m of ['one', 'two', 'three', 'four', 'five']) {
        await box.fill(m);
        await box.press('Enter');
      }
    });

    await step('PondGuard speaks up in the channel', async () => {
      await expect(loud.page.getByText('PondGuard', { exact: false }).first()).toBeVisible();
    });
  },
);
