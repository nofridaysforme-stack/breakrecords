'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from './Money.module.css';

const TABS = [
  ['Royalties', '/money/royalties'], ['Statements', '/money/statements'], ['Payouts', '/money/payouts'],
  ['Recoupment', '/money/recoupment'], ['Budgets', '/money/budgets'],
] as const;

/** Money section tabs (4b). Shown on every Money page so Statements and Budgets are reachable. */
export function MoneyTabs() {
  const path = usePathname() ?? '';
  return (
    <nav aria-label="Money" className={s.tabs}>
      {TABS.map(([label, href]) => (
        <Link key={href} href={href} className={s.tab} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
