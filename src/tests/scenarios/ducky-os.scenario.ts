import { scenario, step, expect } from 'kliv-scenario';

// @kliv-spec-derived — from user intent: "sign in, open the proxy app, connect, and the session must really be saved"
scenario(
  'member connects to a pond server and the session is saved',
  { setup: { users: { duck: {} } } },
  async ({ users }) => {
    const duck = users.duck;

    await step('the desktop appears after boot', async () => {
      await duck.page.goto('/');
      await expect(duck.page.getByRole('button', { name: 'Start' })).toBeVisible();
    });

    await step('open the Proxy Manager from the desktop', async () => {
      await duck.page.getByRole('button', { name: 'Proxy Manager' }).first().click();
      await expect(duck.page.getByText('Unprotected')).toBeVisible();
    });

    await step('the connection is configured against the public Wisp server', async () => {
      await expect(duck.page.getByLabel('Wisp endpoint')).toHaveValue('wss://wisp.mercurywork.shop/');
      await expect(duck.page.getByText('wss://wisp.mercurywork.shop/').first()).toBeVisible();
    });

    await step('connect through the Wisp endpoint', async () => {
      await duck.page.getByRole('button', { name: 'Connect' }).click();
      await expect(duck.page.getByText('Protected')).toBeVisible();
    });

    await step('the session row exists with the Wisp endpoint saved', async () => {
      const res = await duck.request('/api/v2/database/proxy_sessions?status=eq.connected');
      if (!res.ok) throw new Error(`expected a connected session row, got HTTP ${res.status}`);
      const rows = res.json<{ status: string; endpoint: string | null; wisp_status: string | null }[]>();
      const withWisp = rows.filter((r) => r.endpoint === 'wss://wisp.mercurywork.shop/');
      if (withWisp.length < 1) throw new Error('no session was saved with the Wisp endpoint');
      if (!withWisp.every((r) => r.wisp_status === 'online' || r.wisp_status === 'offline')) {
        throw new Error('the Wisp link result was not recorded on the session');
      }
    });
  },
);
