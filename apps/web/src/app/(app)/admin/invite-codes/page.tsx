import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Page } from '@/components/shell/Page';
import { InviteCodesView } from '@/components/admin/InviteCodesView';
import { authRequired, requireContext } from '@/server/context';

export const metadata: Metadata = { title: 'Invite codes' };

/** Indie SRVCS staff make the codes people sign up with. Nobody else sees this page. */
export default async function InviteCodesPage() {
  await connection(); // decided per request, never at build time
  if (!authRequired()) notFound();
  const ctx = await requireContext();
  const { liveInviteCodes, liveIsPlatformAdmin } = await import('@/server/live/inviteCodes');
  if (!(await liveIsPlatformAdmin(ctx.userId))) notFound();
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  return <Page><InviteCodesView initial={await liveInviteCodes(ctx.userId)} signUpUrl={`${appUrl}/sign-up`} /></Page>;
}
