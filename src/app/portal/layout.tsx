import { Suspense, type ReactNode } from 'react';
import { PortalNav } from '@/components/portal/PortalNav';
import s from '@/components/portal/Portal.module.css';

// The payee portal: people who get paid but don't run the label see only this (4f to 4h).
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.shell}>
      <header className={s.header}>
        <div className={s.brand}><span className={s.mark} aria-hidden="true">B</span><span className={s.wordmark}>Break Records.</span></div>
        <Suspense><PortalNav /></Suspense>
        <p className={s.paidBy}><span className={s.deskOnly}>Paid by Northline Records</span><span className={s.phoneOnly}>via Northline</span></p>
      </header>
      <main id="main" className={s.main}>{children}</main>
      <Suspense><PortalNav phone /></Suspense>
    </div>
  );
}
