import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "add an 'add app' option for people to add custom
// links so those links can work using the proxy"
scenario(
  'member pins a custom link and opens it through the proxy',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the desktop shows the Add app tile', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
      await expect(duck.page.getByRole('button', { name: 'Add app' })).toBeVisible();
    });

    await step('add a link through the Add app dialog', async () => {
      await duck.page.getByRole('button', { name: 'Add app' }).click();
      await duck.page.getByLabel('App name').fill('Duckpedia');
      await duck.page.getByLabel('Web address').fill('example.com');
      await duck.page.getByRole('button', { name: 'Add to desktop' }).click();
    });

    await step('the shortcut becomes a desktop icon', async () => {
      await expect(duck.page.getByRole('button', { name: 'Duckpedia' })).toBeVisible();
    });

    await step('opening it rides the Scramjet tunnel', async () => {
      await duck.page.getByRole('button', { name: 'Duckpedia' }).click();
      await expect(duck.page.getByText('loaded through your tunnel')).toBeVisible();
    });

    await step('the shortcut is saved for the next visit', async () => {
      const res = await duck.request('/api/v2/database/desktop_items?url=eq.https://example.com');
      if (!res.ok) throw new Error(`expected the shortcut row, got HTTP ${res.status}`);
      const rows = res.json<{ url: string; label: string }[]>();
      if (!rows.some((r) => r.label === 'Duckpedia')) {
        throw new Error('the custom link was not saved to the desktop');
      }
    });
  },
);
