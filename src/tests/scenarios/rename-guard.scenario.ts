import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "a guy changes his username again and pretends to be a different person"
scenario(
  'renames are announced, throttled and can never steal a name',
  { setup: { users: { sneaky: {}, honest: {} } } },
  async ({ users }) => {
    const sneaky = users.sneaky;
    const honest = users.honest;

    await step('sneaky picks a display name in Settings', async () => {
      await sneaky.page.goto('/');
      await sneaky.page.getByRole('button', { name: 'Settings' }).first().click();
      await sneaky.page.getByLabel('Display name').fill('Silent Drake');
      await sneaky.page.getByRole('button', { name: 'Save name' }).click();
      await expect(sneaky.page.getByText('Name saved')).toBeVisible();
    });

    await step('the lounge hears about the rename', async () => {
      await sneaky.page.getByRole('button', { name: 'DuckChat' }).first().click();
      await expect(sneaky.page.getByText('is now known as Silent Drake')).toBeVisible();
    });

    await step('a second rename the same day is refused', async () => {
      await sneaky.page.getByRole('button', { name: 'Settings' }).first().click();
      await sneaky.page.getByLabel('Display name').fill('Doctor Quack');
      await sneaky.page.getByRole('button', { name: 'Save name' }).click();
      await expect(sneaky.page.getByText('You renamed yourself recently')).toBeVisible();
    });

    await step('honest cannot take the name sneaky now wears', async () => {
      await honest.page.goto('/');
      await honest.page.getByRole('button', { name: 'Settings' }).first().click();
      await honest.page.getByLabel('Display name').fill('Silent Drake');
      await honest.page.getByRole('button', { name: 'Save name' }).click();
      await expect(honest.page.getByText('already belongs to another duck')).toBeVisible();
    });
  },
);
