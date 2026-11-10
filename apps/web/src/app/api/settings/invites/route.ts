import { NextResponse, type NextRequest } from 'next/server';
import { InviteCommand } from '@breakrecords/contract';
import { getSettings } from '@/data/api';
import { mockInvite, mockUninvite } from '@/server/mockSettings';
import { liveInvite, liveUninvite } from '@/server/live/settings';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';
import { sendInvite } from '@/server/mail';

/** Invite someone (owners): they can sign in with that address, and they're emailed. Audited. */
export async function POST(req: Request) {
  const body = InviteCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Send an email address and a role.');
  const who = await teamWriter('settings', 'invitations');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await liveInvite(who.ctx, body.data);
    if (!out.ok) return err(out.status, out.error, out.message);
    const appUrl = process.env.APP_URL || new URL(req.url).origin;
    const emailed = await sendInvite({ to: body.data.email, workspace: who.ctx.tenantName, role: body.data.role, appUrl });
    return NextResponse.json({ ...out.value, emailed });
  }
  const s = await getSettings();
  const payee = body.data.role !== 'payee' ? null : body.data.newPayee ? body.data.newPayee.name : s.payeeOptions.find((p) => p.id === body.data.payeeId)?.name ?? null;
  if (body.data.role === 'payee' && !payee) return err(404, 'not_found', 'No such payee.');
  await mockInvite(body.data.email, body.data.role, payee);
  // Sample data never emails anyone.
  return NextResponse.json({ ...(await getSettings()), emailed: false });
}

/** Withdraw an invitation nobody has used yet. DELETE /api/settings/invites?email=… */
export async function DELETE(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') ?? '').toLowerCase();
  if (!email) return err(400, 'invalid', 'Say which invitation.');
  const who = await teamWriter('settings', 'invitations');
  if ('refused' in who) return who.refused;
  if (who.ctx) { const out = await liveUninvite(who.ctx, email); return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message); }
  await mockUninvite(email);
  return NextResponse.json(await getSettings());
}
