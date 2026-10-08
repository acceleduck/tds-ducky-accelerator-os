export type CallVisibility = 'public' | 'private';
export type CallRoomStatus = 'live' | 'ended';

export interface CallRoom {
  _row_id: number;
  _created_at: number;
  code: string;
  visibility: string;
  status: string;
  host_uuid: string;
  host_name: string;
  title: string | null;
}

export interface CallMember {
  _row_id: number;
  room_code: string;
  user_uuid: string;
  user_name: string;
  muted: number;
  last_seen: number;
}

export interface FriendRow {
  _row_id: number;
  requester_uuid: string;
  requester_name: string;
  addressee_uuid: string;
  addressee_name: string;
  status: string;
  responded_at?: number | null;
}

/** Unambiguous alphabet — no 0/O/1/I — so codes read cleanly over voice. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const PRESENCE_WINDOW_MS = 20_000;
export const RING_FRESH_MS = 60_000;
export const MAX_GROUP_MEMBERS = 20;

export function genCallCode(len = CODE_LENGTH): string {
  let out = '';
  const rand = new Uint32Array(len);
  crypto.getRandomValues(rand);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[rand[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(raw: string): boolean {
  const c = normalizeCode(raw);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

export function isRoomLive(room: CallRoom): boolean {
  return room.status === 'live';
}

export function isPresent(m: CallMember, now: number): boolean {
  return m.last_seen > 0 && now - m.last_seen < PRESENCE_WINDOW_MS;
}

/** Who is actually in a room right now: right room, fresh heartbeat, newest row per duck. */
export function presentMembers(members: CallMember[], roomCode: string, now: number): CallMember[] {
  const newest = new Map<string, CallMember>();
  for (const m of members) {
    if (m.room_code !== roomCode) continue;
    const prev = newest.get(m.user_uuid);
    if (!prev || m.last_seen >= prev.last_seen) newest.set(m.user_uuid, m);
  }
  return [...newest.values()].filter((m) => isPresent(m, now)).sort((a, b) => b.last_seen - a.last_seen);
}

export interface FriendView {
  row: FriendRow;
  uuid: string;
  name: string;
}

export function friendViews(rows: FriendRow[], me: string | null) {
  const friends: FriendView[] = [];
  const incoming: FriendView[] = [];
  const outgoing: FriendView[] = [];
  for (const row of rows) {
    if (row.status === 'accepted') {
      const mine = row.requester_uuid === me;
      const uuid = mine ? row.addressee_uuid : row.requester_uuid;
      const name = mine ? row.addressee_name : row.requester_name;
      if (uuid !== me) friends.push({ row, uuid, name });
    } else if (row.status === 'pending') {
      if (me && row.addressee_uuid === me) {
        incoming.push({ row, uuid: row.requester_uuid, name: row.requester_name });
      } else if (me && row.requester_uuid === me) {
        outgoing.push({ row, uuid: row.addressee_uuid, name: row.addressee_name });
      }
    }
  }
  friends.sort((a, b) => a.name.localeCompare(b.name));
  return { friends, incoming, outgoing };
}

export function acceptedFriendUuids(rows: FriendRow[], me: string | null): Set<string> {
  return new Set(friendViews(rows, me).friends.map((f) => f.uuid));
}

/** Rooms worth ringing about: brand-new, live, joinable, and not started by me. */
export function ringTargets(
  rooms: CallRoom[],
  seenIds: Set<number>,
  me: string | null,
  friendUuids: Set<string>,
  nowMs: number,
): CallRoom[] {
  return rooms.filter(
    (r) =>
      isRoomLive(r) &&
      !seenIds.has(r._row_id) &&
      r.host_uuid !== me &&
      nowMs - r._created_at * 1000 < RING_FRESH_MS &&
      (r.visibility === 'public' || friendUuids.has(r.host_uuid)),
  );
}
