import 'server-only';
import { asUser } from '@breakrecords/db/client';
import type { InviteCodesResponse } from '@breakrecords/contract';
import { sql } from '../db';
import { hashInviteCode, inviteCodeHint, newInviteCode } from '../inviteCodes';

// Invite codes for sign-up. Only Indie SRVCS staff (platform_admins) make, list and revoke
// them; the database refuses anyone else.

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function liveIsPlatformAdmin(userId: string): Promise<boolean> {
  return asUser(sql, userId, async (tx) => (await tx<{ ok: boolean }[]>`SELECT app_is_platform_admin() AS ok`)[0].ok);
}

export function liveInviteCodes(userId: string): Promise<InviteCodesResponse> {
  return asUser(sql, userId, async (tx) => {
    const rows = await tx<{ id: string; hint: string; note: string; max_uses: number; uses: number; expires_at: Date | null; revoked_at: Date | null; created_at: Date; signed_up: string[] }[]>`SELECT * FROM app_invite_codes()`;
    const now = Date.now();
    return {
      codes: rows.map((r) => ({
        id: r.id, hint: r.hint, note: r.note, maxUses: r.max_uses, uses: r.uses, expires: r.expires_at ? day(r.expires_at) : null, created: day(r.created_at), signedUp: r.signed_up,
        status: r.revoked_at ? 'revoked' as const : r.expires_at && r.expires_at.getTime() < now ? 'expired' as const : r.uses >= r.max_uses ? 'used_up' as const : 'active' as const,
      })),
    };
  });
}

/** Makes a code and returns it (shown once) with the updated list. */
export async function liveCreateInviteCode(userId: string, c: { note: string; maxUses: number; expiresInDays: number | null }) {
  const code = newInviteCode();
  const expires = c.expiresInDays ? new Date(Date.now() + c.expiresInDays * 86_400_000) : null;
  await asUser(sql, userId, (tx) => tx`SELECT app_create_invite_code(${hashInviteCode(code)}, ${inviteCodeHint(code)}, ${c.note}, ${c.maxUses}, ${expires})`);
  return { code, ...(await liveInviteCodes(userId)) };
}

export async function liveRevokeInviteCode(userId: string, id: string) {
  await asUser(sql, userId, (tx) => tx`SELECT app_revoke_invite_code(${id})`);
  return liveInviteCodes(userId);
}
