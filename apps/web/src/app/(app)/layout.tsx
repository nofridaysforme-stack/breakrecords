import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { label } from '@/data/sample';
import { approvalIds } from '@/data/api';
import { authRequired, requireContext } from '@/server/context';
import { PublishedTheme } from '@/server/publishedTheme';
import { isLive, MODULE_LABEL, sampleModules } from '@/server/modules';
import { liveNeedsOnboarding } from '@/server/live/onboarding';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let labelName = label.name;
  let tenants: { id: string; name: string; current: boolean }[] = [];
  let kind: 'artist' | 'label' | 'licensee' = 'label';
  let staff = false;
  let connections = 0;
  let notSaved: string[] = [];
  if (authRequired()) {
    const ctx = await requireContext();
    // Inside a label that pays them, a payee sees only what their deal covers (the portal).
    // Their own workspace is where everything else is.
    if (ctx.role === 'payee') redirect('/portal');
    // A workspace made by sign-up goes through onboarding first (its owners set it up).
    if (ctx.role === 'owner' && isLive('settings') && (await liveNeedsOnboarding(ctx))) redirect('/onboarding');
    labelName = ctx.tenantName;
    kind = ctx.tenantKind;
    staff = await (await import('@/server/live/inviteCodes')).liveIsPlatformAdmin(ctx.userId);
    tenants = ctx.workspaces.map((t) => ({ id: t.tenantId, name: t.name, current: t.tenantId === ctx.tenantId }));
    connections = ctx.connections.length;
    // A signed-in deployment with a module on sample data: say so on every screen, so nobody types into it thinking it saves.
    notSaved = (await sampleModules()).map((m) => MODULE_LABEL[m]);
  }
  return (
    <>
      <PublishedTheme />
      {notSaved.length > 0 && (
        <p role="alert" style={{ margin: 0, padding: '10px 16px', background: 'var(--critical-bg, var(--surface))', color: 'var(--text)', borderBottom: '2px solid var(--critical)', fontSize: 'var(--fs-body)' }}>
          <strong>Not saved:</strong> {notSaved.join(', ')} {notSaved.length === 1 ? 'is' : 'are'} still on sample data on this site, so changes there are lost on the next page load. Add {notSaved.length === 1 ? 'it' : 'them'} to BR_LIVE_MODULES in Vercel and redeploy.
        </p>
      )}
      <AppShell labelName={labelName} kind={kind} staff={staff} tenants={tenants} connections={connections} approvalIds={await approvalIds()}>
        {children}
      </AppShell>
    </>
  );
}
