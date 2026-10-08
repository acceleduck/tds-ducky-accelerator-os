import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  Copy,
  Hash,
  ImagePlus,
  Menu,
  MessageSquarePlus,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  Reply,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import db from '@/lib/shared/kliv-database.js';
import { functions } from '@/lib/shared/kliv-functions.js';
import content from '@/lib/shared/kliv-content.js';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useSettings } from '@/hooks/useSettings';
import { formatDuration } from '@/lib/os/format';
import {
  PUBLIC_LOUNGE,
  REACTION_EMOJIS,
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
  dmSlug,
  isMember,
  parsePollOptions,
  pollProblem,
  reactionSummary,
  replyQuote,
  tallyPollVotes,
} from '@/lib/os/chat';
import type { ChatChannel, ChatMessage, PollVoteRow, ReactionRow } from '@/lib/os/chat';
import { useProfile, useProfileDirectory } from '@/hooks/useProfile';
import { UserAvatar } from '../UserAvatar';
import {
  MAX_GROUP_MEMBERS,
  acceptedFriendUuids,
  friendViews,
  genCallCode,
  isRoomLive,
  isValidCode,
  normalizeCode,
  presentMembers,
  ringTargets,
} from '@/lib/os/calls';
import type { CallMember, CallRoom, FriendRow } from '@/lib/os/calls';
import { can, rankOf } from '@/lib/os/ranks';
import { getDeviceId } from '@/lib/os/device';
import { playRingtone } from '@/lib/os/ringtone';

interface Person {
  uuid: string;
  name: string;
}

interface AuthorRow {
  author_uuid: string;
  author_name: string;
  _created_at: number;
}

interface RankRow {
  user_uuid: string;
  rank: string;
}

interface GifItem {
  id: string;
  url: string;
  preview: string;
}

/** One poll message: question, live bars, one vote per duck. */
function PollCard({
  question,
  options,
  votes,
  me,
  closed,
  canEnd,
  onVote,
  onEnd,
}: {
  question: string;
  options: string[];
  votes: PollVoteRow[];
  me: string | null;
  closed: boolean;
  canEnd: boolean;
  onVote: (choice: number) => void;
  onEnd: () => void;
}) {
  const tally = tallyPollVotes(options, votes);
  const mine = votes.find((v) => v.user_uuid === me);
  return (
    <div
      data-testid="poll-card"
      className="mt-1 w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
    >
      <div className="flex items-start gap-2">
        <BarChart3 size={14} className="mt-0.5 shrink-0 text-[var(--os-accent)]" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-white/90">{question}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/35">
          {closed ? 'final' : `${tally.total} vote${tally.total === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {options.map((opt, i) => {
          const isMine = mine?.choice === i;
          const pct = tally.percents[i];
          return (
            <button
              key={i}
              type="button"
              data-testid={`poll-option-${i}`}
              disabled={closed}
              onClick={() => onVote(i)}
              className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-[13px] transition ${
                isMine
                  ? 'border-[var(--os-accent)] text-white'
                  : 'border-white/10 text-white/80 hover:border-white/25'
              } ${closed ? 'cursor-default' : ''}`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-[var(--os-accent)]/20 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{opt}</span>
                {isMine && <Check size={12} className="shrink-0 text-[var(--os-accent)]" />}
                {(mine || closed) && (
                  <span data-testid={`poll-pct-${i}`} className="shrink-0 text-[11px] tabular-nums text-white/50">
                    {pct}%
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-white/35">
        <span>{closed ? 'Poll ended' : 'One vote per duck — click another to change yours'}</span>
        {canEnd && !closed && (
          <button
            type="button"
            data-testid="end-poll"
            onClick={onEnd}
            className="rounded px-1.5 py-0.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            End poll
          </button>
        )}
      </div>
    </div>
  );
}

const IMAGE_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp)(\?\S*)?$/i;
const HEARTBEAT_MS = 15_000;

export default function DuckChatApp() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const me = user?.userUuid ?? null;
  const myProfile = useProfile();
  const myName = myProfile.name;
  const profiles = useProfileDirectory(!!me);

  /* channels + people */
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [authorRows, setAuthorRows] = useState<AuthorRow[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pollDraft, setPollDraft] = useState<{ question: string; options: string[] } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [votes, setVotes] = useState<PollVoteRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const [peopleMode, setPeopleMode] = useState<'dm' | 'friend'>('dm');
  const [showGroup, setShowGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* friends + calls + ranks */
  const [friendRows, setFriendRows] = useState<FriendRow[]>([]);
  const [rooms, setRooms] = useState<CallRoom[]>([]);
  const [members, setMembers] = useState<CallMember[]>([]);
  const [rankRows, setRankRows] = useState<RankRow[]>([]);
  const [activeCallCode, setActiveCallCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [incoming, setIncoming] = useState<CallRoom | null>(null);
  const [muteUntil, setMuteUntil] = useState(0);

  /* media + staff */
  const [showGifs, setShowGifs] = useState(false);
  const [gifQuery, setGifQuery] = useState('duck');
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [uploading, setUploading] = useState(false);
  const stopRingRef = useRef<(() => void) | null>(null);
  const seenRoomsRef = useRef<Set<number> | null>(null);
  const lastBeatRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------ data */

  const loadChannels = useCallback(async () => {
    if (!me) return;
    try {
      const lounge = await db.query<ChatChannel>('chat_channels', { slug: `eq.${PUBLIC_LOUNGE}`, limit: '1' });
      if (lounge.length === 0) {
        try {
          await db.insert('chat_channels', {
            slug: PUBLIC_LOUNGE,
            name: 'duck-lounge',
            kind: 'public',
            topic: 'The big pond — every duck is welcome 🦆',
            members: '',
          });
        } catch {
          // another duck created it first
        }
      }
      const chans = await db.query<ChatChannel>('chat_channels', { order: '_created_at.asc', limit: '200' });
      setChannels(chans);
      const authors = await db.query<AuthorRow>('chat_messages', {
        select: 'author_uuid,author_name,_created_at',
        order: '_created_at.desc',
        limit: '150',
      });
      setAuthorRows(authors);
      const seen = new Map<string, string>();
      for (const a of authors) if (a.author_uuid !== me) seen.set(a.author_uuid, a.author_name);
      setPeople([...seen.entries()].map(([uuid, name]) => ({ uuid, name })));
    } catch {
      // offline — keep whatever we have
    }
  }, [me]);

  const loadSocial = useCallback(async () => {
    if (!me) return;
    try {
      const [friends, liveRooms, present, ranks] = await Promise.all([
        db.query<FriendRow>('duck_friends', { order: '_created_at.desc', limit: '200' }),
        db.query<CallRoom>('duck_call_rooms', { status: 'eq.live', order: '_created_at.desc', limit: '50' }),
        db.query<CallMember>('duck_call_members', { order: 'last_seen.desc', limit: '200' }),
        db.query<RankRow>('chat_ranks', { limit: '200' }),
      ]);
      setFriendRows(friends);
      setRooms(liveRooms);
      setMembers(present);
      setRankRows(ranks);
    } catch {
      // offline — keep whatever we have
    }
  }, [me]);

  useEffect(() => {
    void loadChannels();
    void loadSocial();
    let lastRun = Date.now();
    const tick = async () => {
      const visible = document.visibilityState === 'visible';
      if (Date.now() - lastRun < (visible ? 5000 : 7000) - 100) return;
      lastRun = Date.now();
      await Promise.all([loadChannels(), loadSocial()]);
    };
    const id = window.setInterval(() => void tick(), 2000);
    const sync = () => {
      lastRun = 0;
      void tick();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [loadChannels, loadSocial]);

  useEffect(() => {
    if (!activeSlug && channels.some((c) => c.slug === PUBLIC_LOUNGE)) setActiveSlug(PUBLIC_LOUNGE);
  }, [channels, activeSlug]);

  const loadEngagement = useCallback(async (slug: string) => {
    try {
      const [v, r] = await Promise.all([
        db.query<PollVoteRow>('chat_poll_votes', { channel_slug: `eq.${slug}`, limit: '300' }),
        db.query<ReactionRow>('chat_reactions', { channel_slug: `eq.${slug}`, limit: '500' }),
      ]);
      setVotes(v);
      setReactions(r);
    } catch {
      // keep whatever we had
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!activeSlug) return;
    try {
      const rows = await db.query<ChatMessage>('chat_messages', {
        channel_slug: `eq.${activeSlug}`,
        order: '_created_at.desc',
        limit: '60',
      });
      setMessages(rows.reverse());
      await loadEngagement(activeSlug);
    } catch {
      // keep old messages
    }
  }, [activeSlug, loadEngagement]);

  useEffect(() => {
    if (!activeSlug) return;
    let lastRun = Date.now();
    const tick = async () => {
      const visible = document.visibilityState === 'visible';
      if (Date.now() - lastRun < (visible ? 2500 : 7000) - 100) return;
      lastRun = Date.now();
      await refreshMessages();
    };
    void refreshMessages();
    const id = window.setInterval(() => void tick(), 1500);
    const sync = () => {
      lastRun = 0;
      void tick();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [activeSlug, refreshMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  /* ------------------------------------------------------------ derived */

  const visibleChannels = useMemo(() => channels.filter((c) => isMember(c, me)), [channels, me]);
  const publicChannels = visibleChannels.filter((c) => c.kind === 'public');
  const groupChannels = visibleChannels.filter((c) => c.kind === 'group');
  const dmChannels = visibleChannels.filter((c) => c.kind === 'dm');
  const activeChannel = channels.find((c) => c.slug === activeSlug) ?? null;

  const nameByUuid = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) m.set(p.uuid, p.name);
    for (const f of friendRows) {
      m.set(f.requester_uuid, f.requester_name);
      m.set(f.addressee_uuid, f.addressee_name);
    }
    for (const r of rankRows) if (!m.has(r.user_uuid)) m.set(r.user_uuid, r.user_uuid.slice(0, 8));
    return m;
  }, [people, friendRows, rankRows]);

  const ranksMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rankRows) m.set(r.user_uuid, r.rank);
    return m;
  }, [rankRows]);
  const myRankId = (me && ranksMap.get(me)) || 'member';

  const friendList = useMemo(() => friendViews(friendRows, me), [friendRows, me]);

  const onlineSet = useMemo(() => {
    const s = new Set<string>();
    const cutoff = Date.now() - 10 * 60_000;
    for (const a of authorRows) if (a._created_at * 1000 > cutoff && a.author_uuid !== me) s.add(a.author_uuid);
    for (const m of members) if (m.last_seen > Date.now() - 20_000) s.add(m.user_uuid);
    return s;
  }, [authorRows, members, me]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.code === activeCallCode) ?? null,
    [rooms, activeCallCode],
  );
  const present = useMemo(
    () => (activeCallCode ? presentMembers(members, activeCallCode, Date.now()) : []),
    [members, activeCallCode],
  );
  const myMember = present.find((m) => m.user_uuid === me) ?? null;
  const livePublicRoom = rooms.find((r) => isRoomLive(r) && r.visibility === 'public') ?? null;
  const myPrivateRooms = rooms.filter((r) => isRoomLive(r) && r.host_uuid === me && r.visibility === 'private');

  const peerName = (ch: ChatChannel): string => {
    if (ch.kind !== 'dm') return ch.name;
    const other = ch.members.split('|').find((u) => u && u !== me);
    return nameByUuid.get(other ?? '') ?? 'Duck';
  };

  const mutedNow = muteUntil > Date.now();
  const composerPlaceholder = activeChannel
    ? activeChannel.kind === 'dm'
      ? `Message @${peerName(activeChannel)}`
      : `Message #${activeChannel.name}`
    : 'Pick a channel';

  /* -------------------------------------------------------------- ring */

  useEffect(() => {
    if (!me || rooms.length === 0) return;
    if (seenRoomsRef.current === null) {
      seenRoomsRef.current = new Set(rooms.filter(isRoomLive).map((r) => r._row_id));
      return;
    }
    const friends = acceptedFriendUuids(friendRows, me);
    const targets = ringTargets(rooms, seenRoomsRef.current, me, friends, Date.now());
    for (const r of rooms) if (isRoomLive(r)) seenRoomsRef.current.add(r._row_id);
    if (targets.length > 0 && !incoming && !activeCallCode) {
      setIncoming(targets[0]);
      stopRingRef.current = playRingtone(settings.callRingtone);
    }
  }, [rooms, me, friendRows, incoming, activeCallCode, settings.callRingtone]);

  const stopRing = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
  }, []);

  useEffect(() => stopRing, [stopRing]);

  /* ---------------------------------------------------------- messages */

  const modAct = async (op: string, extra: Record<string, unknown>) => {
    try {
      return await functions.post<{ ok: boolean; code?: string; userMessage?: string }>('chat-guard', {
        action: 'moderate',
        op,
        notice_channel: activeSlug ?? PUBLIC_LOUNGE,
        ...extra,
      });
    } catch {
      return { ok: false, userMessage: 'PondGuard is unreachable — try again' };
    }
  };

  const handleSlash = async (text: string): Promise<boolean> => {
    if (!text.startsWith('/')) return false;
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();
    if (cmd === 'help') {
      toast('Ranks live in the AcceleDuck Inc app — type /AcceleduckInc in the Duck Terminal');
      return true;
    }
    if (cmd === 'rank') {
      toast('/rank moved to the AcceleDuck Inc app — open it from the Duck Terminal with /AcceleduckInc');
      return true;
    }
    toast.error(`Unknown command /${cmd} — try /help`);
    return true;
  };

  const sendViaGuard = async (
    body: string,
    kind: 'text' | 'image' | 'poll' = 'text',
    extra: Record<string, unknown> = {},
  ): Promise<boolean> => {
    if (!activeSlug || !me || !body.trim()) return false;
    setSending(true);
    try {
      const res = await functions.post<{
        ok: boolean;
        code?: string;
        userMessage?: string;
        mutedUntil?: number;
      }>('chat-guard', {
        action: 'send',
        channel_slug: activeSlug,
        body,
        kind,
        author_name: myName,
        device: getDeviceId(),
        ...extra,
      });
      if (res?.ok) {
        setDraft('');
        await refreshMessages();
        return true;
      }
      if (res?.mutedUntil && res.mutedUntil > muteUntil) setMuteUntil(res.mutedUntil);
      toast.error(res?.userMessage ?? 'PondGuard blocked that');
      void refreshMessages();
      return false;
    } catch {
      toast.error('Message failed to send');
      return false;
    } finally {
      setSending(false);
    }
  };

  const submitDraft = async () => {
    const text = draft.trim();
    if (!text || mutedNow) return;
    if (await handleSlash(text)) {
      setDraft('');
      return;
    }
    const extra: Record<string, unknown> = {};
    if (replyTo) extra.reply_to = replyTo._row_id;
    const sent = await sendViaGuard(text, IMAGE_URL_RE.test(text) ? 'image' : 'text', extra);
    if (sent) setReplyTo(null);
  };

  const deleteMessage = async (rowId: number) => {
    const res = await modAct('delete', { row_id: rowId });
    if (res?.ok) {
      toast('Message deleted');
      await refreshMessages();
    } else {
      toast.error(res?.userMessage ?? 'Denied');
    }
  };

  const sendPoll = async () => {
    if (!pollDraft) return;
    const problem = pollProblem(pollDraft);
    if (problem) {
      toast.error(problem);
      return;
    }
    const question = pollDraft.question.replace(/\s+/g, ' ').trim();
    const options = pollDraft.options.map((o) => o.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const ok = await sendViaGuard(question, 'poll', { poll: { question, options } });
    if (ok) setPollDraft(null);
  };

  const voteOnPoll = async (m: ChatMessage, choice: number) => {
    if (!me || !activeSlug || m.poll_closed) return;
    const mine = votes.find((v) => v.message_row === m._row_id && v.user_uuid === me);
    if (mine && mine.choice === choice) return;
    try {
      if (!mine) {
        await db.insert('chat_poll_votes', {
          message_row: m._row_id,
          channel_slug: activeSlug,
          user_uuid: me,
          choice,
          updated_at: Date.now(),
        });
      } else {
        await db.update(
          'chat_poll_votes',
          { _row_id: `eq.${mine._row_id}` },
          { choice, updated_at: Date.now() },
        );
      }
      await refreshMessages();
    } catch {
      toast.error("That vote didn't land — try again");
    }
  };

  const toggleReaction = async (m: ChatMessage, emoji: string) => {
    if (!me || !activeSlug) return;
    const mine = reactions.find(
      (r) => r.message_row === m._row_id && r.user_uuid === me && r.emoji === emoji,
    );
    try {
      if (mine) {
        await db.delete('chat_reactions', { _row_id: `eq.${mine._row_id}` });
      } else {
        await db.insert('chat_reactions', {
          message_row: m._row_id,
          channel_slug: activeSlug,
          user_uuid: me,
          emoji,
          updated_at: Date.now(),
        });
      }
      await refreshMessages();
    } catch {
      toast.error("That reaction didn't stick — try again");
    }
  };

  const endPollMsg = async (rowId: number) => {
    const res = await modAct('endpoll', { row_id: rowId });
    if (res?.ok) {
      toast('Poll ended');
      await refreshMessages();
    } else {
      toast.error(res?.userMessage ?? 'Denied');
    }
  };

  /* ------------------------------------------------------------ media */

  const searchGifs = async (q: string) => {
    setGifLoading(true);
    setGifError('');
    try {
      const res = await functions.post<{ gifs?: GifItem[]; unavailable?: boolean; detail?: string }>(
        'duck-web',
        { action: 'gifs', q },
      );
      if (res?.unavailable || !res.gifs || res.gifs.length === 0) {
        setGifs([]);
        setGifError(res?.detail ?? 'No gifs came back — try another word');
      } else {
        setGifs(res.gifs);
      }
    } catch {
      setGifError('GIF search is unavailable right now');
    } finally {
      setGifLoading(false);
    }
  };

  const openGifs = () => {
    setShowGifs(true);
    if (gifs.length === 0) void searchGifs(gifQuery);
  };

  const onFile = async (file: File | undefined | null) => {
    if (!file || !activeSlug) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only images can be posted (JPG, PNG, GIF or WebP).');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error('That image is over 6 MB — try a smaller one.');
      return;
    }
    setUploading(true);
    try {
      const meta = await content.uploadFile(file, 'chat-uploads');
      await sendViaGuard(meta.path, 'image');
      toast.success('Image posted');
    } catch {
      toast.error('The upload got its feathers wet — try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /* -------------------------------------------------------- channels */

  const startDm = async (uuid: string) => {
    if (!me) return;
    const slug = dmSlug(me, uuid);
    if (!channels.some((c) => c.slug === slug)) {
      try {
        await db.insert('chat_channels', {
          slug,
          name: 'dm',
          kind: 'dm',
          topic: null,
          members: [me, uuid].sort().join('|'),
        });
      } catch {
        // already exists
      }
      await loadChannels();
    }
    setActiveSlug(slug);
    setActiveCallCode(null);
    setShowPeople(false);
  };

  const createGroup = async () => {
    if (!me) return;
    const name = groupName.trim() || 'Duck Squad';
    const slug = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const memberList = [me, ...groupMembers.slice(0, MAX_GROUP_MEMBERS - 1)];
    try {
      await db.insert('chat_channels', {
        slug,
        name,
        kind: 'group',
        topic: `${name} — a cozy little server`,
        members: memberList.join('|'),
      });
      await loadChannels();
      setActiveSlug(slug);
      setShowGroup(false);
      setGroupName('');
      setGroupMembers([]);
      toast.success(`Server "${name}" created (${memberList.length}/${MAX_GROUP_MEMBERS} ducks)`);
    } catch {
      toast.error('Could not create the server');
    }
  };

  /* -------------------------------------------------------- friends */

  const addFriend = async (p: Person) => {
    if (!me) return;
    if (p.uuid === me) return;
    try {
      await db.insert('duck_friends', {
        requester_uuid: me,
        requester_name: myName,
        addressee_uuid: p.uuid,
        addressee_name: p.name,
        status: 'pending',
        responded_at: null,
      });
      toast.success(`Friend request sent to ${p.name}`);
      await loadSocial();
    } catch {
      toast.error('Could not send that request');
    }
  };

  const respondFriend = async (row: FriendRow, status: 'accepted' | 'declined') => {
    try {
      await db.update('duck_friends', { _row_id: `eq.${row._row_id}` }, { status, responded_at: Date.now() });
      await loadSocial();
      if (status === 'accepted') toast.success(`${row.requester_name} is now a friend 🦆`);
    } catch {
      toast.error('That did not go through');
    }
  };

  /* ----------------------------------------------------------- calls */

  const joinRoom = useCallback(
    async (rawCode: string) => {
      const code = normalizeCode(rawCode);
      if (!me) return;
      if (!isValidCode(code)) {
        toast.error('Codes are 6 letters and digits');
        return;
      }
      let room: CallRoom | null = rooms.find((r) => r.code === code && isRoomLive(r)) ?? null;
      if (!room) {
        // the room may have just been created — check the store directly
        try {
          const found = await db.query<CallRoom>('duck_call_rooms', {
            code: `eq.${code}`,
            status: 'eq.live',
            limit: '1',
          });
          room = found[0] ?? null;
        } catch {
          room = null;
        }
      }
      if (!room) {
        toast.error('No live call with that code');
        return;
      }
      try {
        const existing = members.find((m) => m.room_code === code && m.user_uuid === me);
        if (existing) {
          await db.update('duck_call_members', { _row_id: `eq.${existing._row_id}` }, { last_seen: Date.now() });
        } else {
          await db.insert('duck_call_members', {
            room_code: code,
            user_uuid: me,
            user_name: myName,
            muted: 0,
            last_seen: Date.now(),
          });
        }
        lastBeatRef.current = Date.now();
        await loadSocial();
        setActiveCallCode(code);
        setIncoming(null);
        stopRing();
      } catch {
        toast.error('Could not join the call');
      }
    },
    [me, rooms, members, myName, stopRing],
  );

  const createRoom = useCallback(
    async (visibility: 'public' | 'private', title?: string) => {
      if (!me) return;
      if (visibility === 'public') {
        const live = rooms.find((r) => isRoomLive(r) && r.visibility === 'public');
        if (live) {
          await joinRoom(live.code);
          return;
        }
      }
      const code = genCallCode();
      try {
        await db.insert('duck_call_rooms', {
          code,
          visibility,
          status: 'live',
          host_uuid: me,
          host_name: myName,
          title: title ?? (visibility === 'public' ? 'Public pond call' : `${myName}'s private call`),
        });
        await loadSocial();
        await joinRoom(code);
        if (visibility === 'private') toast.success(`Private call ready — code ${code}`);
      } catch {
        toast.error('Could not start the call');
      }
    },
    [me, rooms, joinRoom, myName],
  );

  const leaveCall = useCallback(async () => {
    if (!me || !activeCallCode) return;
    const mine = members.find((m) => m.room_code === activeCallCode && m.user_uuid === me);
    if (mine) {
      db.update('duck_call_members', { _row_id: `eq.${mine._row_id}` }, { last_seen: 0 }).catch(() => {});
    }
    setActiveCallCode(null);
  }, [me, activeCallCode, members]);

  const endCall = useCallback(async () => {
    if (!me || !activeCallCode) return;
    const room = rooms.find((r) => r.code === activeCallCode);
    if (room && room.host_uuid === me) {
      try {
        await db.update('duck_call_rooms', { _row_id: `eq.${room._row_id}` }, { status: 'ended' });
      } catch {
        toast.error('Could not end the call');
      }
    }
    await leaveCall();
    await loadSocial();
  }, [me, activeCallCode, rooms, leaveCall]);

  const toggleMute = async () => {
    if (!me || !myMember) return;
    try {
      await db.update(
        'duck_call_members',
        { _row_id: `eq.${myMember._row_id}` },
        { muted: myMember.muted ? 0 : 1, last_seen: Date.now() },
      );
      await loadSocial();
    } catch {
      toast.error('Mic toggle failed');
    }
  };

  // While in a call: poll presence fast while focused, slow-but-alive in background.
  useEffect(() => {
    if (!activeCallCode || !me) return;
    let lastRun = Date.now();
    const tick = async () => {
      const visible = document.visibilityState === 'visible';
      if (Date.now() - lastRun < (visible ? 3000 : 7000) - 100) return;
      lastRun = Date.now();
      await loadSocial();
    };
    const poll = window.setInterval(() => void tick(), 1500);
    const sync = () => {
      lastRun = 0;
      void tick();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    const beat = window.setInterval(() => {
      const mine = members.find((m) => m.room_code === activeCallCode && m.user_uuid === me);
      if (mine) db.update('duck_call_members', { _row_id: `eq.${mine._row_id}` }, { last_seen: Date.now() }).catch(() => {});
    }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(beat);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [activeCallCode, me, members, loadSocial]);

  // Host ended the call → everyone drops out.
  useEffect(() => {
    if (!activeCallCode) return;
    if (rooms.length > 0 && !rooms.some((r) => r.code === activeCallCode && isRoomLive(r))) {
      setActiveCallCode(null);
      stopRing();
      toast('The call ended');
    }
  }, [rooms, activeCallCode, stopRing]);

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(
      () => toast.success(`Code ${code} copied — share it!`),
      () => toast(`Call code: ${code}`),
    );
  };

  /* ------------------------------------------------------------- render */

  return (
    <div className="relative flex h-full">
      {/* sidebar */}
      <aside
        className={`os-scroll absolute inset-y-0 left-0 z-20 w-60 overflow-y-auto border-r border-white/[0.06] bg-[#141830] p-3 transition-transform md:static md:z-auto md:bg-black/20 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="mb-3 px-1 text-sm font-bold tracking-wide text-white/90">🦆 DuckChat</div>

        <SectionTitle>Pond</SectionTitle>
        {publicChannels.map((ch) => (
          <ChannelRow
            key={ch.slug}
            testid="channel-public"
            active={ch.slug === activeSlug && !activeCallCode}
            icon={<Hash size={13} />}
            label={ch.name}
            onClick={() => {
              setActiveSlug(ch.slug);
              setActiveCallCode(null);
            }}
          />
        ))}

        <SectionTitle>
          My servers
          <button
            aria-label="Create server"
            onClick={() => setShowGroup(true)}
            className="ml-auto rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <Plus size={13} />
          </button>
        </SectionTitle>
        {groupChannels.length === 0 && <div className="px-2 pb-1 text-[11px] text-white/30">No servers yet</div>}
        {groupChannels.map((ch) => (
          <ChannelRow
            key={ch.slug}
            testid="channel-group"
            active={ch.slug === activeSlug && !activeCallCode}
            icon={<Hash size={13} />}
            label={ch.name}
            onClick={() => {
              setActiveSlug(ch.slug);
              setActiveCallCode(null);
            }}
          />
        ))}

        <SectionTitle>
          Friends
          <button
            aria-label="Add friend"
            onClick={() => {
              setPeopleMode('friend');
              setShowPeople(true);
            }}
            className="ml-auto rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <UserPlus size={13} />
          </button>
        </SectionTitle>
        {friendList.incoming.map((f) => (
          <div key={f.row._row_id} data-testid="friend-request" className="mb-1 flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5">
            <span className="truncate text-[12px] text-white/80">{f.name}</span>
            <button
              aria-label="Accept friend"
              data-testid="friend-accept"
              onClick={() => void respondFriend(f.row, 'accepted')}
              className="ml-auto rounded bg-emerald-500/20 p-1 text-emerald-300 hover:bg-emerald-500/30"
            >
              <Check size={12} />
            </button>
            <button
              aria-label="Decline friend"
              onClick={() => void respondFriend(f.row, 'declined')}
              className="rounded bg-white/10 p-1 text-white/50 hover:bg-red-500/20 hover:text-red-300"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {friendList.outgoing.map((f) => (
          <div key={f.row._row_id} className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-white/35">
            {f.name} <span className="italic">— waiting</span>
          </div>
        ))}
        {friendList.friends.length === 0 && friendList.incoming.length === 0 && (
          <div className="px-2 pb-1 text-[11px] text-white/30">Add ducks you meet in the pond</div>
        )}
        {friendList.friends.map((f) => (
          <div key={f.row._row_id} data-testid="friend-row" className="group flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-white/[0.05]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${onlineSet.has(f.uuid) ? 'bg-emerald-400' : 'bg-white/20'}`} />
            <span className="truncate text-[12px] text-white/75">{f.name}</span>
            <button
              aria-label={`Message ${f.name}`}
              onClick={() => void startDm(f.uuid)}
              className="ml-auto hidden rounded p-1 text-white/50 hover:bg-white/10 hover:text-white group-hover:block"
            >
              <Send size={11} />
            </button>
            <button
              aria-label={`Call ${f.name}`}
              onClick={() => void createRoom('private', `Call with ${f.name}`)}
              className="hidden rounded p-1 text-emerald-300/80 hover:bg-emerald-500/20 group-hover:block"
            >
              <Phone size={11} />
            </button>
          </div>
        ))}

        <SectionTitle>
          Direct messages
          <button
            aria-label="New direct message"
            onClick={() => {
              setPeopleMode('dm');
              setShowPeople(true);
            }}
            className="ml-auto rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <Plus size={13} />
          </button>
        </SectionTitle>
        {dmChannels.length === 0 && <div className="px-2 pb-1 text-[11px] text-white/30">Say hi in the lounge first</div>}
        {dmChannels.map((ch) => (
          <ChannelRow
            key={ch.slug}
            testid="channel-dm"
            active={ch.slug === activeSlug && !activeCallCode}
            icon={<span className="text-[11px]">@</span>}
            label={peerName(ch)}
            onClick={() => {
              setActiveSlug(ch.slug);
              setActiveCallCode(null);
            }}
          />
        ))}

        <SectionTitle>Calls</SectionTitle>
        {livePublicRoom ? (
          <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.08] px-2 py-1.5">
            <Phone size={12} className="text-emerald-300" />
            <span className="truncate text-[12px] text-white/80">Public pond call</span>
            <span className="text-[10px] text-emerald-300/80">
              {presentMembers(members, livePublicRoom.code, Date.now()).length} in
            </span>
            <button
              data-testid="join-public"
              onClick={() => void joinRoom(livePublicRoom.code)}
              className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
            >
              Join
            </button>
          </div>
        ) : (
          <button
            aria-label="Start public call"
            onClick={() => void createRoom('public')}
            className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90"
          >
            <Phone size={12} /> Start public call
          </button>
        )}
        <button
          data-testid="new-private-call"
          onClick={() => void createRoom('private')}
          className="mb-1.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90"
        >
          <Plus size={12} /> New private call (code)
        </button>
        <div className="mb-1.5 flex gap-1.5">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void joinRoom(joinCode);
            }}
            aria-label="Call code"
            placeholder="Paste call code"
            className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[11px] uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal placeholder:text-white/30 ${
              joinCode && !isValidCode(joinCode) ? 'border-red-400/40' : 'border-white/10'
            } bg-white/5 text-white focus:border-[var(--os-accent)] focus:outline-none`}
          />
          <button
            data-testid="join-code"
            onClick={() => void joinRoom(joinCode)}
            disabled={!isValidCode(joinCode)}
            className="rounded-lg bg-[var(--os-accent)] px-2.5 text-[11px] font-bold text-[#17131f] disabled:opacity-40"
          >
            Join
          </button>
        </div>
        {myPrivateRooms
          .filter((r) => r.code !== activeCallCode)
          .map((r) => (
            <div key={r._row_id} className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1">
              <span className="font-mono text-[11px] tracking-widest text-white/70">{r.code}</span>
              <button
                aria-label={`Copy code ${r.code}`}
                onClick={() => copyCode(r.code)}
                className="ml-auto rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <Copy size={11} />
              </button>
              <button
                onClick={() => void joinRoom(r.code)}
                className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/15"
              >
                Rejoin
              </button>
            </div>
          ))}

      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
          <button
            aria-label="Toggle channels"
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 md:hidden"
          >
            <Menu size={16} />
          </button>
          {activeCallCode && activeRoom ? (
            <>
              <Phone size={14} className="text-emerald-300" />
              <span className="truncate text-sm font-semibold text-white">{activeRoom.title ?? 'Call'}</span>
              <span
                className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] tracking-widest text-white/80"
                data-testid="call-code"
              >
                {activeRoom.code}
              </span>
              <button
                aria-label={`Copy code ${activeRoom.code}`}
                onClick={() => copyCode(activeRoom.code)}
                className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <Copy size={13} />
              </button>
              <span className="ml-auto text-xs text-white/50">
                <CallTimer startedAt={activeRoom._created_at} /> ·{' '}
                <span data-testid="call-count">{present.length}</span> in call
              </span>
            </>
          ) : activeChannel ? (
            <>
              <span className="truncate text-sm font-semibold text-white">
                {activeChannel.kind === 'dm' ? `@${peerName(activeChannel)}` : `#${activeChannel.name}`}
              </span>
              {activeChannel.topic && (
                <span className="hidden min-w-0 flex-1 truncate text-xs text-white/40 sm:block">
                  — {activeChannel.topic}
                </span>
              )}
              <button
                aria-label="Start call"
                title="Start a private call and share the code"
                onClick={() => void createRoom('private', `Call in ${activeChannel.kind === 'dm' ? `@${peerName(activeChannel)}` : `#${activeChannel.name}`}`)}
                className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                <Phone size={13} /> Call
              </button>
            </>
          ) : (
            <span className="text-sm text-white/40">Loading channels…</span>
          )}
        </div>

        {/* incoming call banner */}
        {incoming && !activeCallCode && (
          <div className="flex flex-wrap items-center gap-3 border-b border-emerald-400/20 bg-emerald-500/[0.08] px-4 py-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-medium text-emerald-300">
              📞 {incoming.host_name} started a {incoming.visibility === 'public' ? 'public call' : 'call'} — jump in!
            </span>
            <button
              onClick={() => void joinRoom(incoming.code)}
              className="ml-auto rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
            >
              Join call
            </button>
            <button
              onClick={() => {
                setIncoming(null);
                stopRing();
              }}
              className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/15"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeCallCode ? (
          /* -------------------------------------------------- call view */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="os-scroll grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-3">
              {present.map((m) => (
                <div
                  key={m._row_id}
                  data-testid={`call-member-${m.user_name}`}
                  className="group relative flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03]"
                >
                  <span className="relative">
                    {!m.muted && (
                      <span className="absolute -inset-1 animate-pulse rounded-full border border-emerald-400/40" />
                    )}
                    <UserAvatar
                      name={profiles.nameOf(m.user_uuid, m.user_name)}
                      pfp={profiles.pfpOf(m.user_uuid)}
                      seed={m.user_uuid}
                      size={48}
                    />
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-white/80">
                    {m.user_uuid === me && <span className="text-white/40">(you)</span>}
                    {profiles.nameOf(m.user_uuid, m.user_name)}
                    {m.muted && <MicOff size={12} className="text-red-300" />}
                  </span>
                </div>
              ))}
              {present.length === 0 && (
                <div className="col-span-full flex h-full items-center justify-center text-sm text-white/35">
                  Connecting to the call…
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/[0.06] p-3">
              <button
                onClick={() => void toggleMute()}
                aria-label={myMember?.muted ? 'Unmute microphone' : 'Mute microphone'}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium ${
                  myMember?.muted ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/85 hover:bg-white/15'
                }`}
              >
                {myMember?.muted ? <MicOff size={14} /> : <Mic size={14} />}
                {myMember?.muted ? 'Muted' : 'Mic on'}
              </button>
              {activeRoom?.host_uuid === me && (
                <button
                  onClick={() => void endCall()}
                  aria-label="End call"
                  className="flex items-center gap-1.5 rounded-xl bg-red-500/25 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/35"
                >
                  <PhoneOff size={14} /> End call
                </button>
              )}
              <button
                onClick={() => void leaveCall()}
                aria-label="Leave call"
                className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/15"
              >
                <PhoneOff size={14} /> Leave
              </button>
            </div>
            <div className="shrink-0 pb-2 text-center text-[10px] text-white/30">
              Voice is simulated in this demo — presence, codes and controls are real.
            </div>
          </div>
        ) : (
          /* ------------------------------------------------ messages view */
          <>
            <div ref={scrollRef} className="os-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white/35">
                  <MessageSquarePlus size={22} />
                  No messages yet — start the conversation!
                </div>
              )}
              {messages.map((m) =>
                m.kind === 'text' || m.kind === 'image' || m.kind === 'poll' ? (
                  <div key={m._row_id} className="group mb-2.5 flex gap-2.5">
                    <UserAvatar
                      className="mt-0.5"
                      name={profiles.nameOf(m.author_uuid, m.author_name)}
                      pfp={profiles.pfpOf(m.author_uuid)}
                      seed={m.author_uuid}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-white/90">
                          {profiles.nameOf(m.author_uuid, m.author_name)}
                        </span>
                        {m.author_uuid === me && (
                          <span className="rounded bg-white/10 px-1 text-[9px] uppercase text-white/50">you</span>
                        )}
                        <RankChip uuid={m.author_uuid} ranksMap={ranksMap} />
                        <span className="text-[10px] text-white/30">
                          {new Date(m._created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {can(myRankId, 'delete') && (
                          <button
                            aria-label={`Delete message ${m._row_id}`}
                            onClick={() => void deleteMessage(m._row_id)}
                            className="ml-auto hidden rounded p-0.5 text-white/30 hover:bg-white/10 hover:text-red-300 group-hover:block"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      {m.reply_to != null && (
                        <div className="mt-1 flex items-center gap-1.5 rounded-lg border-l-2 border-[var(--os-accent)]/60 bg-white/[0.04] px-2 py-1 text-[11px] text-white/45">
                          <Reply size={10} className="shrink-0" />
                          <span className="truncate">
                            <span className="text-white/70">{m.reply_author ?? 'Duck'}</span>{' '}
                            {m.reply_snippet ?? ''}
                          </span>
                        </div>
                      )}
                      {m.kind === 'image' ? (
                        <a href={m.body} target="_blank" rel="noreferrer" className="mt-1 inline-block">
                          <img
                            src={m.body}
                            alt={m.author_name}
                            loading="lazy"
                            className="max-h-64 max-w-full rounded-xl border border-white/10"
                          />
                        </a>
                      ) : m.kind === 'poll' ? (
                        <PollCard
                          question={m.poll_question ?? m.body}
                          options={parsePollOptions(m.poll_options)}
                          votes={votes.filter((v) => v.message_row === m._row_id)}
                          me={me}
                          closed={!!m.poll_closed}
                          canEnd={m.author_uuid === me || can(myRankId, 'delete')}
                          onVote={(i) => void voteOnPoll(m, i)}
                          onEnd={() => void endPollMsg(m._row_id)}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap break-words text-sm text-white/80">{m.body}</div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {reactionSummary(
                          reactions.filter((r) => r.message_row === m._row_id),
                          me,
                        ).map((chip) => (
                          <button
                            key={chip.emoji}
                            type="button"
                            onClick={() => void toggleReaction(m, chip.emoji)}
                            data-testid="reaction-chip"
                            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition ${
                              chip.mine
                                ? 'border-[var(--os-accent)]/70 bg-[var(--os-accent)]/15 text-white'
                                : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25'
                            }`}
                          >
                            <span>{chip.emoji}</span>
                            <span className="tabular-nums">{chip.count}</span>
                          </button>
                        ))}
                        <span className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label={`Reply to message ${m._row_id}`}
                            data-testid="reply-button"
                            onClick={() => setReplyTo(m)}
                            title="Reply"
                            className="rounded p-0.5 text-white/35 transition hover:bg-white/10 hover:text-white"
                          >
                            <Reply size={11} />
                          </button>
                          {REACTION_EMOJIS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              aria-label={`React ${e}`}
                              onClick={() => void toggleReaction(m, e)}
                              className="rounded p-0.5 text-[12px] opacity-70 transition hover:bg-white/10 hover:opacity-100"
                            >
                              {e}
                            </button>
                          ))}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={m._row_id} data-testid="system-message" className="my-1.5 text-center text-[11px] italic text-white/35">
                    {m.kind === 'system' && '🤖 '}
                    {m.kind === 'call-start' && '📞 '}
                    {m.kind === 'call-end' && '📴 '}
                    {m.body}
                  </div>
                ),
              )}
            </div>

            {/* reply preview + poll composer */}
            {replyTo && (
              <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-3 pt-2 text-xs text-white/50">
                <Reply size={12} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  Replying to{' '}
                  <span className="text-white/80">
                    {profiles.nameOf(replyTo.author_uuid, replyTo.author_name)}
                  </span>
                  : {replyQuote(replyTo.kind === 'image' ? '📷 picture' : replyTo.body)}
                </span>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTo(null)}
                  className="rounded p-0.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {pollDraft && (
              <div className="shrink-0 space-y-2 border-t border-white/[0.06] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                  <BarChart3 size={13} className="text-[var(--os-accent)]" /> Poll
                  <button
                    type="button"
                    aria-label="Cancel poll"
                    onClick={() => setPollDraft(null)}
                    className="ml-auto rounded p-0.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
                <input
                  value={pollDraft.question}
                  onChange={(e) => setPollDraft({ ...pollDraft, question: e.target.value })}
                  maxLength={140}
                  aria-label="Poll question"
                  placeholder="Ask the pond something…"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
                />
                {pollDraft.options.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={o}
                      onChange={(e) => {
                        const options = [...pollDraft.options];
                        options[i] = e.target.value;
                        setPollDraft({ ...pollDraft, options });
                      }}
                      maxLength={60}
                      aria-label={`Poll option ${i + 1}`}
                      placeholder={`Option ${i + 1}`}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
                    />
                    {pollDraft.options.length > POLL_MIN_OPTIONS && (
                      <button
                        type="button"
                        aria-label={`Remove option ${i + 1}`}
                        onClick={() =>
                          setPollDraft({
                            ...pollDraft,
                            options: pollDraft.options.filter((_, j) => j !== i),
                          })
                        }
                        className="rounded-xl bg-white/[0.06] px-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {pollDraft.options.length < POLL_MAX_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => setPollDraft({ ...pollDraft, options: [...pollDraft.options, ''] })}
                    className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    + Add option
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void sendPoll()}
                  disabled={sending || !activeSlug}
                  data-testid="create-poll"
                  className="w-full rounded-xl bg-[var(--os-accent)] py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
                >
                  Create poll
                </button>
              </div>
            )}

            {/* composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitDraft();
              }}
              className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] p-3"
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => void onFile(e.target.files?.[0])}
                aria-label="Upload an image"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!activeSlug || uploading || mutedNow}
                aria-label="Send a picture"
                title="Send a picture"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 transition hover:bg-white/10 disabled:opacity-40"
              >
                <ImagePlus size={15} />
              </button>
              <button
                type="button"
                onClick={openGifs}
                disabled={!activeSlug || mutedNow}
                className="h-10 shrink-0 rounded-xl bg-white/[0.06] px-3 text-xs font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-40"
              >
                GIF
              </button>
              <button
                type="button"
                onClick={() => setPollDraft({ question: '', options: ['', ''] })}
                disabled={!activeSlug}
                aria-label="Create a poll"
                title="Create a poll"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 transition hover:bg-white/10 disabled:opacity-40"
              >
                <BarChart3 size={15} />
              </button>
              <input
                value={mutedNow ? '' : draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={mutedNow ? `Muted by PondGuard — ${Math.ceil((muteUntil - Date.now()) / 1000)}s left` : composerPlaceholder}
                aria-label="Message"
                disabled={!activeSlug || mutedNow}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={sending || !draft.trim() || mutedNow}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--os-accent)] text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </form>
          </>
        )}
      </div>

      {/* people / friends picker */}
      {showPeople && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPeople(false)}>
          <div className="menu-pop os-glass-strong w-[min(340px,92vw)] rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-sm font-semibold text-white">
              {peopleMode === 'dm' ? 'Start a direct message' : 'Add a friend'}
            </div>
            <div className="mb-3 text-xs text-white/40">
              {peopleMode === 'dm' ? 'Ducks you’ve crossed paths with in chat' : 'Send a request — they accept it in their Friends list'}
            </div>
            {people.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/40">
                Nobody yet — post in #duck-lounge and come back!
              </div>
            ) : (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto os-scroll">
                {people.map((p) => (
                  <button
                    key={p.uuid}
                    data-testid={peopleMode === 'dm' ? 'person-row' : 'befriend-row'}
                    onClick={() => {
                      if (peopleMode === 'dm') void startDm(p.uuid);
                      else {
                        void addFriend(p);
                        setShowPeople(false);
                      }
                    }}
                    className="os-hover flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/10"
                  >
                    <UserAvatar
                      name={profiles.nameOf(p.uuid, p.name)}
                      pfp={profiles.pfpOf(p.uuid)}
                      seed={p.uuid}
                      size={32}
                    />
                    <span className="text-sm text-white/85">{profiles.nameOf(p.uuid, p.name)}</span>
                    {peopleMode === 'friend' && <UserPlus size={13} className="ml-auto text-white/40" />}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPeople(false)}
              className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs text-white/70 hover:bg-white/15"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* gif picker */}
      {showGifs && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowGifs(false)}>
          <div className="menu-pop os-glass-strong flex max-h-[80%] w-[min(420px,94vw)] flex-col rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-sm font-semibold text-white">Pick a GIF</div>
            <div className="mb-3 flex gap-2">
              <input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchGifs(gifQuery);
                }}
                aria-label="Search gifs"
                placeholder="Search gifs…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
              />
              <button
                onClick={() => void searchGifs(gifQuery)}
                className="rounded-xl bg-[var(--os-accent)] px-4 text-sm font-semibold text-[#17131f]"
              >
                Find
              </button>
            </div>
            <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
              {gifLoading && <div className="py-6 text-center text-xs text-white/40">Waddling through gifs…</div>}
              {gifError && !gifLoading && <div className="py-6 text-center text-xs text-red-300/80">{gifError}</div>}
              {!gifLoading && !gifError && (
                <div className="grid grid-cols-2 gap-2">
                  {gifs.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setShowGifs(false);
                        void sendViaGuard(g.url, 'image');
                      }}
                      className="overflow-hidden rounded-xl border border-white/10 hover:border-[var(--os-accent)]"
                    >
                      <img src={g.preview} alt="gif" loading="lazy" className="h-28 w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowGifs(false)}
              className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs text-white/70 hover:bg-white/15"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* group creator */}
      {showGroup && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowGroup(false)}>
          <div className="menu-pop os-glass-strong w-[min(360px,92vw)] rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
              <Users size={15} /> Create a server
            </div>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Server name (e.g. Midnight Paddlers)"
              aria-label="Server name"
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
            />
            <div className="mt-3 mb-1 text-xs text-white/40">
              Invite ducks ({Math.min(groupMembers.length, MAX_GROUP_MEMBERS - 1)}/{MAX_GROUP_MEMBERS - 1} — up to {MAX_GROUP_MEMBERS} total)
            </div>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto os-scroll">
              {people.length === 0 ? (
                <div className="py-4 text-center text-xs text-white/40">
                  No ducks to invite yet — they appear once they&apos;ve chatted.
                </div>
              ) : (
                people.map((p) => {
                  const checked = groupMembers.includes(p.uuid);
                  const full = groupMembers.length >= MAX_GROUP_MEMBERS - 1;
                  return (
                    <button
                      key={p.uuid}
                      data-testid="invite-row"
                      onClick={() =>
                        setGroupMembers((prev) =>
                          checked ? prev.filter((u) => u !== p.uuid) : full ? prev : [...prev, p.uuid],
                        )
                      }
                      className={`os-hover flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${
                        checked ? 'bg-[var(--os-accent-soft)]' : 'hover:bg-white/10'
                      }`}
                    >
                      <UserAvatar
                        name={profiles.nameOf(p.uuid, p.name)}
                        pfp={profiles.pfpOf(p.uuid)}
                        seed={p.uuid}
                        size={28}
                      />
                      <span className="flex-1 text-sm text-white/85">{profiles.nameOf(p.uuid, p.name)}</span>
                      <span className={`h-4 w-4 rounded border ${checked ? 'border-[var(--os-accent)] bg-[var(--os-accent)]' : 'border-white/25'}`} />
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void createGroup()}
                className="flex-1 rounded-xl bg-[var(--os-accent)] py-2 text-sm font-semibold text-[#17131f]"
              >
                Create server
              </button>
              <button
                onClick={() => setShowGroup(false)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/15"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ------------------------------------------------------------ bits */

function RankChip({ uuid, ranksMap }: { uuid: string; ranksMap: Map<string, string> }) {
  if (uuid === 'pondguard') {
    return (
      <span className="rounded bg-sky-400/20 px-1 text-[9px] font-bold uppercase text-sky-300">bot</span>
    );
  }
  const id = ranksMap.get(uuid);
  if (!id) return null;
  const r = rankOf(id);
  if (r.level === 0) return null;
  return (
    <span
      className="rounded px-1 text-[9px] font-bold uppercase"
      style={{ background: `${r.color}33`, color: r.color }}
    >
      {r.name}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 flex items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
      {children}
    </div>
  );
}

function ChannelRow({
  active,
  icon,
  label,
  onClick,
  testid,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`os-hover flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
        active ? 'bg-[var(--os-accent-soft)] text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
      }`}
    >
      <span className="text-white/40">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function CallTimer({ startedAt }: { startedAt: number }) {
  const now = useNow(true, 1000);
  return <span className="tabular-nums">{formatDuration(Math.max(0, (now.getTime() / 1000 - startedAt) * 1000))}</span>;
}
