const KEY = 'duck-device-id';

/**
 * A stable per-browser id. It powers device bans: clearing site data resets it,
 * so treat it as best-effort — same as any client-side fingerprint.
 */
export function getDeviceId(): string {
  try {
    let v = window.localStorage.getItem(KEY);
    if (!v) {
      v = crypto.randomUUID();
      window.localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return 'unknown-device';
  }
}
