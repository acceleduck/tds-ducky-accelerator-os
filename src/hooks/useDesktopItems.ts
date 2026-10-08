import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import db from '@/lib/shared/kliv-database.js';
import type { DesktopItem, Point } from '@/lib/os/desktop';

interface DesktopRow {
  _row_id: number;
  key: string;
  label: string;
  url: string | null;
  emoji: string | null;
  x: number;
  y: number;
}

const mapRow = (r: DesktopRow): DesktopItem => ({
  key: r.key,
  label: r.label,
  url: r.url,
  emoji: r.emoji,
  x: r.x,
  y: r.y,
  rowId: r._row_id,
});

const SAVE_FAIL = 'Could not save your desktop — check your connection and try again.';

/**
 * The signed-in user's desktop rows: moved built-in apps and custom links.
 * Positions only reach the database once the icon is actually dragged, so an
 * untouched desktop stays empty.
 */
export function useDesktopItems() {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    db
      .query<DesktopRow>('desktop_items', { limit: '300' })
      .then((rows) => {
        if (alive) setItems(rows.map(mapRow));
      })
      .catch(() => {
        // an unreadable desktop falls back to the default grid
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  /** Persist a position: update the row if there is one, else create it. */
  const savePosition = useCallback(
    async (item: Omit<DesktopItem, 'rowId'>, pos: Point) => {
      const existing = byKey.get(item.key);
      setItems((prev) =>
        existing
          ? prev.map((i) => (i.key === item.key ? { ...i, x: pos.x, y: pos.y } : i))
          : [
              ...prev,
              { ...item, x: pos.x, y: pos.y, rowId: -1 },
            ],
      );
      try {
        if (existing) {
          await db.updateOne('desktop_items', { key: `eq.${item.key}` }, { x: pos.x, y: pos.y });
        } else {
          const row = await db.insertOne<DesktopRow>('desktop_items', {
            key: item.key,
            label: item.label,
            url: item.url,
            emoji: item.emoji,
            x: pos.x,
            y: pos.y,
          });
          setItems((prev) => prev.map((i) => (i.key === item.key ? mapRow(row) : i)));
        }
      } catch {
        toast.error(SAVE_FAIL);
      }
    },
    [byKey],
  );

  /** Add a custom link shortcut. Returns the new item, or null on failure. */
  const addLink = useCallback(
    async (item: Omit<DesktopItem, 'rowId'>) => {
      try {
        const row = await db.insertOne<DesktopRow>('desktop_items', {
          key: item.key,
          label: item.label,
          url: item.url,
          emoji: item.emoji,
          x: item.x,
          y: item.y,
        });
        const mapped = mapRow(row);
        setItems((prev) => [...prev, mapped]);
        return mapped;
      } catch {
        toast.error(SAVE_FAIL);
        return null;
      }
    },
    [],
  );

  /** Take a link off the desktop. */
  const removeItem = useCallback(
    async (key: string) => {
      setItems((prev) => prev.filter((i) => i.key !== key));
      try {
        await db.deleteOne('desktop_items', { key: `eq.${key}` });
      } catch {
        toast.error('Could not remove that shortcut — try again.');
      }
    },
    [],
  );

  /** Re-flow saved rows onto the default grid in the given key order. */
  const tidyAll = useCallback(
    async (order: string[], posFor: (index: number) => Point) => {
      const updates = new Map(
        order.map((key, index) => [key, posFor(index)] as const),
      );
      setItems((prev) =>
        prev.map((i) => {
          const pos = updates.get(i.key);
          return pos ? { ...i, x: pos.x, y: pos.y } : i;
        }),
      );
      try {
        await Promise.all(
          items
            .filter((i) => updates.has(i.key))
            .map((i) => {
              const pos = updates.get(i.key)!;
              return db.updateOne('desktop_items', { key: `eq.${i.key}` }, { x: pos.x, y: pos.y });
            }),
        );
      } catch {
        toast.error(SAVE_FAIL);
      }
    },
    [items],
  );

  return { items, byKey, ready, savePosition, addLink, removeItem, tidyAll };
}
