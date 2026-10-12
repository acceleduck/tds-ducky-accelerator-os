import { useCallback, useEffect, useState } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { functions } from '@/lib/shared/kliv-functions.js';
import { useAuth } from '@/hooks/useAuth';
import { profileName, sanitizeDisplayName } from '@/lib/os/profile';
import type { ProfileRow } from '@/lib/os/profile';

interface GuardReply {
  ok: boolean;
  code?: string;
  userMessage?: string;
  profile?: { display_name: string | null; pfp: string | null };
  nextRenameAt?: number;
}

interface ProfileApi {
  /** Finished the first load (row found or not). */
  ready: boolean;
  /** The name to display everywhere: chosen name, or one derived from the email. */
  name: string;
  /** The chosen name only — '' when the account never set one. */
  rawName: string;
  /** Path to the profile picture (under /content/pfps/), or null. */
  pfp: string | null;
  saving: boolean;
  /** Unix ms when the next rename unlocks — 0 when a rename is allowed now. */
  nextRenameAt: number;
  /**
   * Save a profile change. Every edit goes through the profile guard service,
   * which owns the rename rules (no stealing names, one rename a day,
   * announcements) — a rejection throws with a message meant for the duck.
   */
  save: (patch: { name?: string; pfp?: string | null }) => Promise<void>;
}

/** The signed-in duck's own profile: display name + profile picture. */
export function useProfile(): ProfileApi {
  const { user } = useAuth();
  const uuid = user?.userUuid ?? null;
  const [row, setRow] = useState<ProfileRow | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nextRenameAt, setNextRenameAt] = useState(0);

  useEffect(() => {
    if (!uuid) {
      setRow(null);
      setReady(true);
      setNextRenameAt(0);
      return;
    }
    let alive = true;
    setReady(false);
    (async () => {
      try {
        const rows = await db.query<ProfileRow>('user_profiles', {
          user_uuid: `eq.${uuid}`,
          limit: '1',
        });
        if (!alive) return;
        setRow(rows[0] ?? null);
      } catch {
        // offline — keep whatever we had
      } finally {
        if (alive) setReady(true);
      }
      try {
        const res = await functions.post<GuardReply>('profile-guard', { action: 'status' });
        if (alive && res?.ok) setNextRenameAt(res.nextRenameAt ?? 0);
      } catch {
        // offline — no countdown to show
      }
    })();
    return () => {
      alive = false;
    };
  }, [uuid]);

  const save = useCallback(
    async (patch: { name?: string; pfp?: string | null }) => {
      if (!uuid) throw new Error('Sign in before editing your profile');
      setSaving(true);
      try {
        const res = await functions.post<GuardReply>('profile-guard', {
          action: 'save',
          display_name: patch.name !== undefined ? sanitizeDisplayName(patch.name) || null : undefined,
          pfp: patch.pfp !== undefined ? patch.pfp : undefined,
        });
        if (!res || res.ok !== true) {
          throw new Error(res?.userMessage || 'Could not save — try again');
        }
        setNextRenameAt(res.nextRenameAt ?? 0);
        if (res.profile) {
          const saved = res.profile;
          setRow((prev) => {
            const base: ProfileRow = prev ?? { _row_id: 0, user_uuid: uuid, display_name: null, pfp: null };
            return { ...base, display_name: saved.display_name, pfp: saved.pfp };
          });
        }
      } catch (e) {
        // A refusal (cooldown, stolen name…) arrives as details on the error.
        const details = (e as { details?: unknown })?.details;
        const fromGuard =
          details && typeof details === 'object'
            ? (details as { userMessage?: unknown }).userMessage
            : null;
        if (typeof fromGuard === 'string' && fromGuard) throw new Error(fromGuard);
        throw e instanceof Error ? e : new Error('Could not save — try again');
      } finally {
        setSaving(false);
      }
    },
    [uuid],
  );

  return {
    ready,
    name: profileName(row, user?.email),
    rawName: sanitizeDisplayName(row?.display_name),
    pfp: row?.pfp ?? null,
    saving,
    nextRenameAt,
    save,
  };
}

export interface ProfileDirectory {
  /** Best name for a duck: their chosen name, or the fallback the caller has. */
  nameOf: (uuid: string | null | undefined, fallback: string) => string;
  /** That duck's profile picture, or null. */
  pfpOf: (uuid: string | null | undefined) => string | null;
  /** Ask for a fresh copy (e.g. right after saving your own profile). */
  refresh: () => void;
}

/**
 * Everyone's profiles, for showing avatars and chosen names in chat.
 * Refreshes on a slow timer (and when the tab becomes visible) — names and
 * pictures change rarely, so this stays well clear of hot-polling territory.
 */
export function useProfileDirectory(enabled: boolean): ProfileDirectory {
  const [map, setMap] = useState<Record<string, { name: string | null; pfp: string | null }>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const rows = await db.query<ProfileRow>('user_profiles', { limit: '200' });
        if (!alive) return;
        const next: Record<string, { name: string | null; pfp: string | null }> = {};
        for (const r of rows) next[r.user_uuid] = { name: r.display_name, pfp: r.pfp };
        setMap(next);
      } catch {
        // offline — keep whatever we had
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled, tick]);

  const nameOf = useCallback(
    (uuid: string | null | undefined, fallback: string) => {
      const chosen = uuid ? sanitizeDisplayName(map[uuid]?.name) : '';
      return chosen || fallback;
    },
    [map],
  );
  const pfpOf = useCallback(
    (uuid: string | null | undefined) => (uuid ? map[uuid]?.pfp ?? null : null),
    [map],
  );
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { nameOf, pfpOf, refresh };
}
