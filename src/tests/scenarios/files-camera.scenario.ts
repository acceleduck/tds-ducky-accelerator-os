import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "put your eaglercraft file in the file system of this proxy and run it"
scenario(
  'a duck drops a game file into the OS and runs it',
  {
    setup: {
      users: { duck: {} },
      files: {
        '/files/quackcraft.html': {
          text: '<!doctype html><html><head><title>QuackCraft</title></head><body><h1>EAGLER RUNS</h1></body></html>',
          type: 'text/html',
        },
      },
    },
  },
  async ({ users }) => {
    const duck = users.duck;

    await step('the desktop appears after boot', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('Files lists it with a Run button', async () => {
      await duck.page.getByRole('button', { name: 'Files' }).first().click();
      await expect(duck.page.getByText('quackcraft.html')).toBeVisible();
      await expect(duck.page.getByTestId('run-file')).toBeVisible();
    });

    await step('running it opens the sandboxed runner with the game inside', async () => {
      await duck.page.getByTestId('run-file').click();
      await expect(duck.page.getByTestId('file-runner')).toBeVisible();
      await expect(duck.page.getByLabel('Allow game saving')).toBeVisible();
      // the runner iframe points at the stored file itself
      const frame = duck.page.getByTestId('file-runner');
      await expect(frame).toBeVisible();
    });

    await step('the runner can pop the game out', async () => {
      await expect(duck.page.getByRole('link', { name: 'Open file in a new tab' })).toBeVisible();
    });
  },
);

// @kliv-spec-derived — from user intent: "camera … take fun pictures"
scenario('the Duck Cam app opens with camera and screen tabs', { setup: { users: { duck: {} } } }, async ({ users }) => {
  const duck = users.duck;

  await step('open Duck Cam from the desktop', async () => {
    await duck.page.goto('/');
    await duck.page.getByRole('button', { name: 'Duck Cam' }).first().click();
    await expect(duck.page.getByText('Take fun pictures with your webcam')).toBeVisible();
  });

  await step('the screen-record tab explains picking the game tab', async () => {
    await duck.page.getByRole('button', { name: 'Screen record' }).click();
    await expect(duck.page.getByText('Record the tab or window your game runs in')).toBeVisible();
    await expect(duck.page.getByRole('button', { name: 'Choose what to record' })).toBeVisible();
  });
});
