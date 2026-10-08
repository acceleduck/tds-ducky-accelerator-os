import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "typed searches must show real
// results, not a blank page" — DuckDuckGo's site refuses to render inside a
// proxied frame, so searches open the OS results page fed live by
// DuckDuckGo's search API, with every result loading the real page later.
scenario(
  'member searches and gets live results',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the OS desktop loads', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('open Duck Browser from the desktop', async () => {
      await duck.page.getByRole('button', { name: 'Duck Browser' }).first().click();
      await expect(duck.page.getByPlaceholder('Search the web')).toBeVisible();
    });

    await step('typed words open the results page', async () => {
      await duck.page.getByPlaceholder('Search the web').fill('crazygames');
      await duck.page.getByPlaceholder('Search the web').press('Enter');
      await expect(duck.page.getByLabel('Address and search bar')).toHaveValue('crazygames');
    });

    await step('live results arrive from DuckDuckGo', async () => {
      await expect(
        duck.page.getByText('Answer & links from DuckDuckGo · articles from Wikipedia'),
      ).toBeVisible();
    });
  },
);

// @kliv-spec-derived — from user intent: "the proxy doesn't work like a proxy" —
// a site that flatly refuses to be embedded must still load through the tunnel.
scenario(
  'member opens github.com through the tunnel',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the OS desktop loads', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('type an address that blocks embedding', async () => {
      await duck.page.getByRole('button', { name: 'Duck Browser' }).first().click();
      const bar = duck.page.getByLabel('Address and search bar');
      await bar.fill('github.com');
      await bar.press('Enter');
      await expect(bar).toHaveValue('https://github.com');
    });

    await step('it loads through the tunnel, not directly', async () => {
      await expect(duck.page.getByText('github.com · loaded through your tunnel')).toBeVisible();
    });
  },
);
