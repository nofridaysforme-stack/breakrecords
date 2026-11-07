'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from './Ops.module.css';

export type LinkTab = { label: string; href: string; count?: number; exact?: boolean };

/** Section tabs that are links (5a Catalog, 5d Funding, Rights). Counts are mono, muted. */
export function LinkTabs({ label, tabs }: { label: string; tabs: LinkTab[] }) {
  const path = usePathname() ?? '';
  return (
    <nav aria-label={label} className={s.tabs}>
      {tabs.map((t) => {
        const on = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href} className={s.tab} aria-current={on ? 'page' : undefined}>
            {t.label}{t.count !== undefined && <span className={s.tabCount}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
