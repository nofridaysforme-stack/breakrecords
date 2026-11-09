import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { label } from '@/data/sample';
import { approvalIds } from '@/data/api';
import { authRequired, requireContext } from '@/server/context';
import { PublishedTheme } from '@/server/publishedTheme';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let labelName = label.name;
  let tenants: { id: string; name: string; current: boolean }[] = [];
  if (authRequired()) {
    const ctx = await requireContext();
    // Payees who don't run the label only ever see the payee portal (flows.md).
    if (ctx.role === 'payee') redirect('/portal');
    labelName = ctx.tenantName;
    tenants = ctx.tenants.map((t) => ({ id: t.tenantId, name: t.name, current: t.tenantId === ctx.tenantId }));
  }
  return (
    <>
      <PublishedTheme />
      <AppShell labelName={labelName} tenants={tenants} approvalIds={await approvalIds()}>
        {children}
      </AppShell>
    </>
  );
}
