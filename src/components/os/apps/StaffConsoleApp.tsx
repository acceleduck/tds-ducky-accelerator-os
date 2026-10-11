import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, Shield } from 'lucide-react';
import db from '@/lib/shared/kliv-database.js';
import { functions } from '@/lib/shared/kliv-functions.js';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { avatarColor, displayName, initials } from '@/lib/os/chat';
import { canActOn, grantableRanks, rankOf } from '@/lib/os/ranks';

interface Person {
  uuid: string;
  name: string;
}

interface RankRow {
  user_uuid: string;
  rank: string;
}

interface AuthorRow {
  author_uuid: string;
  author_name: string;
  _created_at: number;
}

/**
 * AcceleDuck Inc — the staff console. Opened from the Duck Terminal with
 * /AcceleduckInc (it never appears on the desktop or in the start menu).
 * Every action is enforced server-side by the PondGuard service; this window
 * is just the remote control.
 */
export default function StaffConsoleApp() {
  const { user } = useAuth();
  const me = user?.userUuid ?? null;
  const myName = displayName(user?.email);

  const [people, setPeople] = useState<Person[]>([]);
  const [rankRows, setRankRows] = useState<RankRow[]>([]);
  const [modTarget, setModTarget] = useState<Person | null>(null);
  const [rankDraft, setRankDraft] = useState('member');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [ownerUsersLoaded, setOwnerUsersLoaded] = useState(false);
  const [ownerPw, setOwnerPw] = useState('');
  const [ownerStaffPw, setOwnerStaffPw] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const [authors, ranks] = await Promise.all([
        db.query<AuthorRow>('chat_messages', {
          select: 'author_uuid,author_name,_created_at',
          order: '_created_at.desc',
          limit: '150',
        }),
        db.query<RankRow>('chat_ranks', { limit: '200' }),
      ]);
      const seen = new Map<string, string>();
      for (const a of authors) if (a.author_uuid !== me) seen.set(a.author_uuid, a.author_name);
      setPeople([...seen.entries()].map(([uuid, name]) => ({ uuid, name })));
      setRankRows(ranks);
    } catch {
      // offline — keep what we have
    }
  }, [me]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 5000);
    const sync = () => void load();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [load]);

  const ranksMap = useMemo(() => new Map(rankRows.map((r) => [r.user_uuid, r.rank])), [rankRows]);
  const myRankId = (me && ranksMap.get(me)) || 'member';
  const myRank = rankOf(myRankId);
  const ownerExists = rankRows.some((r) => r.rank === 'owner');
  const roster = rankRows
    .map((r) => ({ uuid: r.user_uuid, name: ranksMap.has(r.user_uuid) ? r.user_uuid.slice(0, 8) : r.user_uuid.slice(0, 8), rank: rankOf(r.rank) }))
    .sort((a, b) => b.rank.level - a.rank.level);

  const modAct = async (op: string, extra: Record<string, unknown>) => {
    try {
      return await functions.post<{ ok: boolean; userMessage?: string }>('chat-guard', {
        action: 'moderate',
        op,
        notice_channel: 'duck-lounge',
        actor_name: myName,
        ...extra,
      });
    } catch {
      return { ok: false, userMessage: 'PondGuard is unreachable — try again' };
    }
  };

  const run = async (label: string, op: string, extra: Record<string, unknown> = {}) => {
    if (!modTarget) return;
    setBusy(true);
    const res = await modAct(op, { target_uuid: modTarget.uuid, target_name: modTarget.name, ...extra });
    setBusy(false);
    if (res?.ok) {
      toast.success(label);
      void load();
    } else {
      toast.error(res?.userMessage ?? 'Denied');
    }
  };

  const targetRankId = (modTarget && ranksMap.get(modTarget.uuid)) || 'member';
  const act = (power: 'mute' | 'ban' | 'ipban' | 'deviceban') =>
    modTarget ? canActOn(myRankId, power, targetRankId) : false;
  const grants = grantableRanks(myRankId);

  // Owner tools: pull the full member list once so passwords can be reset
  // even for ducks who have never chatted.
  useEffect(() => {
    if (myRankId !== 'owner' || ownerUsersLoaded) return;
    setOwnerUsersLoaded(true);
    (async () => {
      try {
        const res = await functions.post<{
          ok: boolean;
          users?: { uuid: string; username: string; name: string }[];
        }>('owner-tools', { action: 'list-users' });
        if (!res?.ok || !res.users) return;
        setPeople((prev) => {
          const seen = new Set(prev.map((p) => p.uuid));
          const extra = res
            .users!.filter((u) => u.uuid !== me && !seen.has(u.uuid))
            .map((u) => ({ uuid: u.uuid, name: u.username || u.name || u.uuid.slice(0, 8) }));
          return [...prev, ...extra];
        });
      } catch {
        // the full roster is a bonus — chat authors still work without it
      }
    })();
  }, [myRankId, ownerUsersLoaded, me]);

  const ownerSetPassword = async () => {
    if (!modTarget) return;
    setOwnerBusy(true);
    let res: { ok: boolean; userMessage?: string } | null = null;
    try {
      res = await functions.post<{ ok: boolean; userMessage?: string }>('owner-tools', {
        action: 'set-password',
        target_uuid: modTarget.uuid,
        new_password: ownerPw,
        staff_password: ownerStaffPw,
      });
    } catch {
      res = { ok: false, userMessage: 'The owner service is unreachable — try again' };
    }
    setOwnerBusy(false);
    if (res?.ok) {
      toast.success(`Password updated for ${modTarget.name} — they use it at the next sign-in`);
      setOwnerPw('');
      setOwnerStaffPw('');
    } else {
      toast.error(res?.userMessage ?? 'Denied');
    }
  };

  return (
    <div data-testid="staff-app" className="os-scroll h-full overflow-y-auto p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-500 to-zinc-800 text-white">
          <Shield size={16} />
        </span>
        <div>
          <div className="text-sm font-bold text-white">AcceleDuck Inc</div>
          <div className="text-[11px] text-white/40">Staff console — internal use only</div>
        </div>
        <span
          data-testid="my-rank"
          className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold text-[#17131f]"
          style={{ background: myRank.color }}
        >
          {myRank.name}
        </span>
      </div>

      <div className="mt-2 text-[11px] leading-relaxed text-white/40">
        {myRank.powers.length ? `Your powers: ${myRank.powers.join(', ')}` : 'No powers yet — ranks are granted by owners and head admins.'}
      </div>

      {!ownerExists && me && (
        <button
          data-testid="claim-owner"
          onClick={async () => {
            setBusy(true);
            const res = await modAct('claim-owner', {});
            setBusy(false);
            if (res?.ok) {
              toast.success('You are now the Owner of the pond 👑');
              void load();
            } else {
              toast.error(res?.userMessage ?? 'Denied');
            }
          }}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-[var(--os-accent)] py-2 text-sm font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-50"
        >
          Claim ownership (first duck only)
        </button>
      )}

      {roster.length > 0 && (
        <>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-wider text-white/35">Staff roster</div>
          <div className="mt-1.5 flex flex-col gap-1">
            {roster.map((r) => (
              <div key={r.uuid} data-testid="roster-row" className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: avatarColor(r.uuid) }}
                >
                  {initials(r.uuid)}
                </span>
                <span className="font-mono text-[11px] text-white/60">{r.uuid.slice(0, 10)}</span>
                <span
                  className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold text-[#17131f]"
                  style={{ background: r.rank.color }}
                >
                  {r.rank.name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 text-[10px] font-bold uppercase tracking-wider text-white/35">Pick a duck</div>
      <div className="os-scroll mt-1.5 flex max-h-36 flex-col gap-1 overflow-y-auto">
        {people.length === 0 && (
          <div className="py-3 text-center text-xs text-white/40">Nobody has chatted yet — ducks appear once they post.</div>
        )}
        {people.map((p) => {
          const selected = modTarget?.uuid === p.uuid;
          const r = rankOf(ranksMap.get(p.uuid));
          return (
            <button
              key={p.uuid}
              data-testid="mod-target"
              onClick={() => {
                setModTarget(p);
                setRankDraft('member');
              }}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                selected ? 'bg-[var(--os-accent-soft)]' : 'hover:bg-white/10'
              }`}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: avatarColor(p.uuid) }}
              >
                {initials(p.name)}
              </span>
              <span className="flex-1 truncate text-sm text-white/85">{p.name}</span>
              {r.level > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-[#17131f]" style={{ background: r.color }}>
                  {r.name}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {modTarget && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-xs text-white/60">
            Acting on <span className="font-semibold text-white">{modTarget.name}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              disabled={busy || !act('mute')}
              onClick={() => void run('Muted for 10m', 'mute', { seconds: 600 })}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-30"
            >
              Mute 10m
            </button>
            <button
              disabled={busy || !act('mute')}
              onClick={() => void run('Muted for 1h', 'mute', { seconds: 3600 })}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-30"
            >
              Mute 1h
            </button>
            <button
              disabled={busy || !(modTarget && (ranksMap.get(modTarget.uuid) ?? 'member'))}
              onClick={() => void run('Unmuted', 'unmute')}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/15 disabled:opacity-30"
            >
              Unmute
            </button>
            <button
              disabled={busy || !act('ban')}
              onClick={() => void run('Banned', 'ban')}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-30"
            >
              Ban
            </button>
            <button
              disabled={busy || !act('ipban')}
              onClick={() => void run('IP-banned', 'ipban')}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-30"
            >
              IP ban
            </button>
            <button
              disabled={busy || !act('deviceban')}
              onClick={() => void run('Device-banned', 'deviceban')}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-30"
            >
              Device ban
            </button>
            <button
              disabled={busy}
              onClick={() => void run('Ban lifted', 'unban', { kind: 'ban' })}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/15 disabled:opacity-30"
            >
              Unban
            </button>
          </div>

          {grants.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Staff password"
                aria-label="Staff password"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <select
                  value={rankDraft}
                  onChange={(e) => setRankDraft(e.target.value)}
                  aria-label="Set rank"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white focus:outline-none"
                >
                  {grants.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#141830]">
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !pw}
                  onClick={() => void run(`Rank set to ${rankDraft}`, 'rank', { rank: rankDraft, password: pw })}
                  className="rounded-lg bg-[var(--os-accent)] px-3 py-1.5 text-[11px] font-bold text-[#17131f] disabled:opacity-40"
                >
                  Set rank
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {myRankId === 'owner' && (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5" data-testid="owner-tools">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
            <KeyRound size={12} /> Owner only — reset a duck's password
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-white/40">
            Pick any duck above (the list includes everyone with an account), then set a new
            password for them. Only the pond owner can do this — everyone else changes their own
            in Settings.
          </div>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <input
              type="password"
              value={ownerPw}
              onChange={(e) => setOwnerPw(e.target.value)}
              aria-label="Owner new password"
              placeholder="New password for them (8+)"
              autoComplete="new-password"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
            <input
              type="password"
              value={ownerStaffPw}
              onChange={(e) => setOwnerStaffPw(e.target.value)}
              aria-label="Owner staff password"
              placeholder="Staff password"
              autoComplete="off"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
          </div>
          <button
            data-testid="owner-set-password"
            disabled={ownerBusy || !modTarget || ownerPw.length < 8 || !ownerStaffPw}
            onClick={() => void ownerSetPassword()}
            className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-[11px] font-bold text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
          >
            {ownerBusy && <Loader2 size={12} className="animate-spin" />} Set password
          </button>
        </div>
      )}

      <div className="mt-4 text-[10px] leading-relaxed text-white/30">
        Mods mute/ban lower ranks · admins ban/mute mods or lower (incl. IP &amp; device) · head admins ban in any way
        and mute admins, head mods and lower · rank changes need the staff password. Opened from the Duck Terminal
        with /AcceleduckInc.
      </div>
    </div>
  );
}
