import { useCallback, useEffect, useState } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { useAuth } from '@/hooks/useAuth';
import { profileName, sanitizeDisplayName } from '@/lib/os/profile';
import type { ProfileRow } from '@/lib/os/profile';

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
  save: (patch: { name?: string; pfp?: string | null }) => Promise<void>;
}

/** The signed-in duck's own profile: display name + profile picture. */
export function useProfile(): ProfileApi {
  const { user } = useAuth();
  const uuid = user?.userUuid ?? null;
  const [row, setRow] = useState<ProfileRow | null>(null);
  const [rowId, setRowId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uuid) {
      setRow(null);
      setRowId(null);
      setReady(true);
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
        if (rows[0]) {
          setRow(rows[0]);
          setRowId(rows[0]._row_id);
        } else {
          setRow(null);
          setRowId(null);
        }
      } catch {
        // offline — keep whatever we had
      } finally {
        if (alive) setReady(true);
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
        const data = {
          user_uuid: uuid,
          display_name:
            patch.name !== undefined ? sanitizeDisplayName(patch.name) || null : row?.display_name ?? null,
          pfp: patch.pfp !== undefined ? patch.pfp : row?.pfp ?? null,
          updated_at: Math.floor(Date.now() / 1000),
        };
        if (rowId != null) {
          await db.update('user_profiles', { _row_id: `eq.${rowId}` }, data);
          setRow((prev) => (prev ? { ...prev, ...data } : prev));
        } else {
          const created = await db.insertOne<ProfileRow>('user_profiles', data);
          setRowId(created._row_id);
          setRow(created);
        }
      } finally {
        setSaving(false);
      }
    },
    [uuid, row, rowId],
  );

  return {
    ready,
    name: profileName(row, user?.email),
    rawName: sanitizeDisplayName(row?.display_name),
    pfp: row?.pfp ?? null,
    saving,
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
