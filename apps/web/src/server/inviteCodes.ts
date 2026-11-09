import 'server-only';
import { createHash, randomInt } from 'node:crypto';

// Invite codes look like INDIE-7KQ4-M9TX. Letters and digits that can't be mistaken for each
// other (no O/0, I/1/L). Only a hash is stored; the code is shown once when it's made.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `INDIE-${part()}-${part()}`;
}

/** Spaces, dashes and case don't matter when someone types it. */
export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashInviteCode = (code: string) => createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
export const inviteCodeHint = (code: string) => normalizeInviteCode(code).slice(-4);
