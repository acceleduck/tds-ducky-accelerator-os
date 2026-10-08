import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "make sure youtube and chatgpt work" —
// typing their addresses must land on the in-OS experiences, never a blank embed.
scenario(
  'member opens YouTube in Duck Browser',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the OS desktop loads', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('youtube.com opens the in-OS portal', async () => {
      await duck.page.getByRole('button', { name: 'Duck Browser' }).first().click();
      const bar = duck.page.getByLabel('Address and search bar');
      await bar.fill('youtube.com');
      await bar.press('Enter');
      await expect(duck.page.getByLabel('Search YouTube')).toBeVisible();
    });

    await step('a watch link opens the OS player', async () => {
      const bar = duck.page.getByLabel('Address and search bar');
      await bar.fill('https://youtu.be/dQw4w9WgXcQ');
      await bar.press('Enter');
      await expect(duck.page.getByRole('button', { name: 'YouTube', exact: true })).toBeVisible();
    });
  },
);

// @kliv-spec-derived — from user intent: "add ducky ai" + "make sure chatgpt works" —
// ChatGPT can't embed, so its page must offer the pop-out and launch Ducky AI.
scenario(
  'member reaches ChatGPT and Ducky AI',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the OS desktop loads', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('chatgpt.com shows the in-OS options', async () => {
      await duck.page.getByRole('button', { name: 'Duck Browser' }).first().click();
      const bar = duck.page.getByLabel('Address and search bar');
      await bar.fill('chatgpt.com');
      await bar.press('Enter');
      await expect(duck.page.getByText('OpenAI locks chatgpt.com')).toBeVisible();
    });

    await step('Ducky AI opens from the ChatGPT page', async () => {
      await duck.page.getByRole('button', { name: 'Ducky AI' }).first().click();
      await expect(duck.page.getByLabel('Message Ducky AI')).toBeVisible();
    });
  },
);
