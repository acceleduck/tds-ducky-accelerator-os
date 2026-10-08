import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "staff console will be a app you open using
// normal console by typing /AcceleduckInc"
scenario(
  'staff console opens from the terminal command',
  { setup: { users: { boss: {} } } },
  async ({ users }) => {
    const boss = users.boss;

    await step('the duck opens the terminal', async () => {
      await boss.page.goto('/');
      await boss.page.getByRole('button', { name: 'Duck Terminal' }).first().click();
      await expect(boss.page.getByLabel('Terminal input')).toBeVisible();
    });

    await step('typing /AcceleduckInc opens the hidden staff app', async () => {
      await boss.page.getByLabel('Terminal input').fill('/AcceleduckInc');
      await boss.page.getByLabel('Terminal input').press('Enter');
      await expect(boss.page.getByTestId('staff-app')).toBeVisible();
    });

    await step('the first duck claims ownership', async () => {
      await boss.page.getByTestId('claim-owner').click();
      await expect(boss.page.getByTestId('my-rank')).toContainText('Owner');
    });
  },
);
