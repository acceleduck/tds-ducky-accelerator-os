import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { auth } from '@/lib/shared/kliv-auth.js';
import type { KlivUser } from '@/lib/shared/kliv-auth.js';
import { loginToEmail } from '@/lib/os/username';

interface AuthApi {
  user: KlivUser | null;
  loading: boolean;
  /** Sign in with a username (a full email address still works for older accounts). */
  signIn: (identifier: string, password: string) => Promise<void>;
  /** Create an account from a username alone — no email is ever asked for. */
  signUp: (identifier: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Change the account password. Needs the current one as proof. */
  updatePassword: (current: string, next: string) => Promise<void>;
  /** Re-read the signed-in account from the server. */
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<KlivUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    auth
      .getCurrentUser()
      .then((u) => { if (alive) setUser(u); })
      .catch(() => { if (alive) setUser(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      user,
      loading,
      async signIn(identifier, password) {
        const result = await auth.signIn(loginToEmail(identifier), password);
        if (result.status === 'totp_required') {
          throw new Error(
            'This account uses an authenticator app, which this demo OS does not support yet.',
          );
        }
        setUser(result.user);
      },
      async signUp(identifier, password, name) {
        const created = await auth.signUp(loginToEmail(identifier), password, name ?? null);
        setUser(created);
      },
      async signOut() {
        await auth.signOut();
        setUser(null);
      },
      async updatePassword(current, next) {
        await auth.updateUser({ password: next, currentPassword: current });
      },
      async refresh() {
        const fresh = await auth.getUser(true);
        setUser(fresh);
      },
    }),
    [user, loading],
  );

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Map sign-in errors from the server to friendly messages. */
export function authErrorToMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('bad_credentials')) return "That username and password don't match.";
  if (msg.includes('email_exists') || msg.includes('registration_failed'))
    return 'That username is already taken — try signing in.';
  if (msg.includes('too_many_attempts')) return 'Too many tries — wait a little and try again.';
  if (msg.includes('insufficient_password_complexity'))
    return 'That password is too common or too short — pick something better.';
  if (msg.includes('user_inactive') || msg.includes('organization_disabled'))
    return 'This account is disabled.';
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
