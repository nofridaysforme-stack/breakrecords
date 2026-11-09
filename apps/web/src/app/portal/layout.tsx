import { Suspense, type ReactNode } from 'react';
import { PortalNav } from '@/components/portal/PortalNav';
import s from '@/components/portal/Portal.module.css';
import { authRequired, requireContext } from '@/server/context';
import { PublishedTheme } from '@/server/publishedTheme';

// The payee portal: people who get paid but don't run the label see only this (4f to 4h).
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const label = authRequired() ? (await requireContext()).tenantName : 'Northline Records';
  return (
    <div className={s.shell}>
      <PublishedTheme />
      <header className={s.header}>
        <div className={s.brand}><span className={s.mark} aria-hidden="true">B</span><span className={s.wordmark}>Break Records.</span></div>
        <Suspense><PortalNav /></Suspense>
        <p className={s.paidBy}><span className={s.deskOnly}>Paid by {label}</span><span className={s.phoneOnly}>via {label.split(' ')[0]}</span></p>
      </header>
      <main id="main" className={s.main}>{children}</main>
      <Suspense><PortalNav phone /></Suspense>
    </div>
  );
}
