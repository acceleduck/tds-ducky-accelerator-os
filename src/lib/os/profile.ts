import { displayName } from './chat';

/** One row of the user_profiles table — a duck's public identity. */
export interface ProfileRow {
  _row_id: number;
  user_uuid: string;
  display_name: string | null;
  pfp: string | null;
}

export const NAME_MAX = 24;
export const MAX_PFP_BYTES = 6 * 1024 * 1024;

/** Collapse whitespace, strip control characters and cap the length. */
export function sanitizeDisplayName(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

/** The name to show: the account's chosen name, or one derived from its email. */
export function profileName(
  profile: Pick<ProfileRow, 'display_name'> | null | undefined,
  email: string | null | undefined,
): string {
  return sanitizeDisplayName(profile?.display_name) || displayName(email);
}

/** Returns an error message when a file is unusable as a profile picture. */
export function pfpProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Profile pictures need to be an image (PNG, JPG, GIF or WebP).';
  }
  if (file.size > MAX_PFP_BYTES) {
    return 'That picture is over 6 MB — try a smaller one.';
  }
  return null;
}
