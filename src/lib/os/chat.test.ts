// @kliv-spec-derived — from user intent: "two ducks in a DM always land in the same channel, and calls show who's in them"
import { describe, it, expect } from 'vitest';
import { PUBLIC_LOUNGE, activeCall, dmSlug, isMember, parseMembers } from './chat';
import type { ChatChannel, ChatMessage } from './chat';

describe('chat channels', () => {
  it('dmSlug is symmetric between two users', () => {
    expect(dmSlug('a-uuid', 'b-uuid')).toBe(dmSlug('b-uuid', 'a-uuid'));
    expect(dmSlug('a-uuid', 'b-uuid')).toBe('dm-a-uuid-b-uuid');
  });

  it('membership: public for everyone, dm only for members', () => {
    const pub: ChatChannel = { _row_id: 1, slug: PUBLIC_LOUNGE, name: 'duck-lounge', kind: 'public', topic: null, members: '', _created_at: 1 };
    const dm: ChatChannel = { _row_id: 2, slug: 'dm-x-y', name: 'dm', kind: 'dm', topic: null, members: 'x|y', _created_at: 1 };
    expect(isMember(pub, null)).toBe(true);
    expect(isMember(dm, 'x')).toBe(true);
    expect(isMember(dm, 'z')).toBe(false);
    expect(parseMembers('x|y')).toEqual(['x', 'y']);
  });
});

describe('activeCall', () => {
  const msg = (id: number, kind: ChatMessage['kind'], uuid: string, name: string, at = id): ChatMessage => ({
    _row_id: id,
    channel_slug: 'c',
    author_uuid: uuid,
    author_name: name,
    kind,
    body: 'b',
    _created_at: at,
  });

  it('tracks participants from join and leave messages', () => {
    const msgs = [
      msg(1, 'text', 'u1', 'A', 1),
      msg(2, 'call-start', 'u1', 'A', 2),
      msg(3, 'call-join', 'u2', 'B', 3),
      msg(4, 'call-leave', 'u1', 'A', 4),
    ];
    const call = activeCall(msgs)!;
    expect(call.startedBy).toBe('u1');
    expect(call.participants.map((p) => p.uuid)).toEqual(['u2']);
  });

  it('returns null after the call ends', () => {
    const msgs = [
      msg(1, 'call-start', 'u1', 'A', 1),
      msg(2, 'call-join', 'u2', 'B', 2),
      msg(3, 'call-end', 'u1', 'A', 3),
    ];
    expect(activeCall(msgs)).toBeNull();
  });

  it('returns null when there was never a call', () => {
    expect(activeCall([msg(1, 'text', 'u1', 'A')])).toBeNull();
  });
});
