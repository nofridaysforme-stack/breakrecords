import { Suspense, type ReactNode } from 'react';
import { PortalNav } from '@/components/portal/PortalNav';
import s from '@/components/portal/Portal.module.css';
import { BackToWorkspace } from '@/components/portal/BackToWorkspace';
import { authRequired, requireContext } from '@/server/context';
import { PublishedTheme } from '@/server/publishedTheme';

// The payee portal (4f to 4h): what a label that pays you shows you, and nothing else of its.
// Your own workspace, with every tool, is one press away.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ctx = authRequired() ? await requireContext() : null;
  const label = ctx?.tenantName ?? 'Northline Records';
  const home = ctx?.role === 'payee' ? ctx.workspaces[0] : undefined;
  return (
    <div className={s.shell}>
      <PublishedTheme />
      <header className={s.header}>
        <div className={s.brand}><span className={s.mark} aria-hidden="true">I</span><span className={s.wordmark}>Indie SRVCS.</span></div>
        <Suspense><PortalNav /></Suspense>
        <p className={s.paidBy}><span className={s.deskOnly}>Paid by {label}</span><span className={s.phoneOnly}>via {label.split(' ')[0]}</span></p>
        {home && <BackToWorkspace id={home.tenantId} name={home.name} />}
      </header>
      <main id="main" className={s.main}>{children}</main>
      <Suspense><PortalNav phone /></Suspense>
    </div>
  );
}
