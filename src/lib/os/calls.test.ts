import { describe, expect, it } from 'vitest';
import {
  CODE_LENGTH,
  MAX_GROUP_MEMBERS,
  genCallCode,
  isValidCode,
  normalizeCode,
  friendViews,
  presentMembers,
  ringTargets,
} from './calls';
import type { CallRoom } from './calls';

function room(over: Partial<CallRoom> = {}): CallRoom {
  return {
    _row_id: 1,
    _created_at: 0,
    code: 'K7QP2M',
    visibility: 'public',
    status: 'live',
    host_uuid: 'host',
    host_name: 'Host',
    title: null,
    ...over,
  };
}

describe('call codes', () => {
  it('generates 6-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = genCallCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(normalizeCode(code)).toBe(code);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('does not generate duplicate codes in a small batch', () => {
    const codes = new Set(Array.from({ length: 100 }, () => genCallCode()));
    expect(codes.size).toBe(100);
  });

  it('accepts pasted codes with spaces, dashes and lowercase', () => {
    expect(normalizeCode(' k7qp2m ')).toBe('K7QP2M');
    expect(normalizeCode('k7q-p2m')).toBe('K7QP2M');
    expect(isValidCode('k7q p2m')).toBe(true);
  });

  it('rejects codes that are too short or use confusing letters', () => {
    expect(isValidCode('ABC12')).toBe(false);
    expect(isValidCode('ABCO12')).toBe(false); // O is not in the alphabet
    expect(isValidCode('ABC012')).toBe(false); // 0 is not in the alphabet
  });
});

describe('call presence', () => {
  const now = 1_000_000;
  const members = [
    { _row_id: 1, room_code: 'K7QP2M', user_uuid: 'a', user_name: 'A', muted: 0, last_seen: now - 1000 },
    { _row_id: 2, room_code: 'K7QP2M', user_uuid: 'b', user_name: 'B', muted: 0, last_seen: now - 15_000 },
    { _row_id: 3, room_code: 'OTHER1', user_uuid: 'c', user_name: 'C', muted: 0, last_seen: now },
    { _row_id: 4, room_code: 'K7QP2M', user_uuid: 'a', user_name: 'A', muted: 1, last_seen: now - 500 },
    { _row_id: 5, room_code: 'K7QP2M', user_uuid: 'd', user_name: 'D', muted: 0, last_seen: 0 },
  ];

  it('counts only fresh heartbeats in the right room', () => {
    const present = presentMembers(members, 'K7QP2M', now);
    expect(present.map((m) => m.user_uuid)).toEqual(['a', 'b']);
  });

  it('keeps the newest row per duck', () => {
    const a = presentMembers(members, 'K7QP2M', now).find((m) => m.user_uuid === 'a');
    expect(a?._row_id).toBe(4);
  });
});

describe('friends', () => {
  const rows = [
    { _row_id: 1, requester_uuid: 'me', requester_name: 'Me', addressee_uuid: 'pal', addressee_name: 'Pal', status: 'accepted', responded_at: 1 },
    { _row_id: 2, requester_uuid: 'pal2', requester_name: 'Pal2', addressee_uuid: 'me', addressee_name: 'Me', status: 'accepted', responded_at: 2 },
    { _row_id: 3, requester_uuid: 'stranger', requester_name: 'Stranger', addressee_uuid: 'me', addressee_name: 'Me', status: 'pending', responded_at: null },
    { _row_id: 4, requester_uuid: 'me', requester_name: 'Me', addressee_uuid: 'shy', addressee_name: 'Shy', status: 'pending', responded_at: null },
    { _row_id: 5, requester_uuid: 'me', requester_name: 'Me', addressee_uuid: 'gone', addressee_name: 'Gone', status: 'declined', responded_at: 3 },
  ];

  it('splits rows into friends, incoming and outgoing requests', () => {
    const v = friendViews(rows, 'me');
    expect(v.friends.map((f) => f.uuid).sort()).toEqual(['pal', 'pal2']);
    expect(v.incoming.map((f) => f.uuid)).toEqual(['stranger']);
    expect(v.outgoing.map((f) => f.uuid)).toEqual(['shy']);
  });

  it('names the friend from the other side of the row', () => {
    const v = friendViews(rows, 'me');
    expect(v.friends.find((f) => f.uuid === 'pal')?.name).toBe('Pal');
    expect(v.friends.find((f) => f.uuid === 'pal2')?.name).toBe('Pal2');
  });
});

describe('ringing', () => {
  const now = 10_000_000_000;

  it('rings for fresh public rooms and fresh friend rooms, not my own', () => {
    const rooms = [
      room({ _row_id: 1, visibility: 'public', host_uuid: 'stranger', _created_at: now / 1000 - 5 }),
      room({ _row_id: 2, visibility: 'private', host_uuid: 'pal', _created_at: now / 1000 - 10 }),
      room({ _row_id: 3, visibility: 'public', host_uuid: 'me', _created_at: now / 1000 - 5 }),
      room({ _row_id: 4, visibility: 'private', host_uuid: 'stranger', _created_at: now / 1000 - 5 }),
      room({ _row_id: 5, visibility: 'public', host_uuid: 'stranger', _created_at: now / 1000 - 120 }),
    ];
    const targets = ringTargets(rooms, new Set(), 'me', new Set(['pal']), now);
    expect(targets.map((r) => r._row_id)).toEqual([1, 2]);
  });

  it('never rings twice for the same room', () => {
    const rooms = [room({ _row_id: 1, visibility: 'public', host_uuid: 'stranger', _created_at: now / 1000 - 5 })];
    expect(ringTargets(rooms, new Set([1]), 'me', new Set(), now)).toHaveLength(0);
  });
});

describe('group size', () => {
  it('allows groups up to 20 ducks', () => {
    expect(MAX_GROUP_MEMBERS).toBe(20);
  });
});
