import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { label } from '@/data/sample';
import { approvalIds } from '@/data/api';
import { authRequired, requireContext } from '@/server/context';
import { PublishedTheme } from '@/server/publishedTheme';
import { isLive } from '@/server/modules';
import { liveNeedsOnboarding } from '@/server/live/onboarding';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let labelName = label.name;
  let tenants: { id: string; name: string; current: boolean }[] = [];
  let kind: 'artist' | 'label' | 'licensee' = 'label';
  let staff = false;
  if (authRequired()) {
    const ctx = await requireContext();
    // Payees who don't run the label only ever see the payee portal (flows.md).
    if (ctx.role === 'payee') redirect('/portal');
    // A workspace made by sign-up goes through onboarding first (its owners set it up).
    if (ctx.role === 'owner' && isLive('settings') && (await liveNeedsOnboarding(ctx))) redirect('/onboarding');
    labelName = ctx.tenantName;
    kind = ctx.tenantKind;
    staff = await (await import('@/server/live/inviteCodes')).liveIsPlatformAdmin(ctx.userId);
    tenants = ctx.tenants.map((t) => ({ id: t.tenantId, name: t.name, current: t.tenantId === ctx.tenantId }));
  }
  return (
    <>
      <PublishedTheme />
      <AppShell labelName={labelName} kind={kind} staff={staff} tenants={tenants} approvalIds={await approvalIds()}>
        {children}
      </AppShell>
    </>
  );
}
