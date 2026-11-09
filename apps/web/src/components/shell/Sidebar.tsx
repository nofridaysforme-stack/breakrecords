'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, CircleAlert, MessageSquare } from 'lucide-react';
import { footerNav, isActive, primaryNav } from './nav';
import { useShellUI } from './ShellUI';
import { useDecisions } from '@/data/decisions';
import s from './Sidebar.module.css';

type Props = { labelName: string; tenants?: { id: string; name: string; current: boolean }[]; approvalIds: string[] };

export function Sidebar({ labelName, tenants = [], approvalIds }: Props) {
  const pathname = usePathname() ?? '/';
  const approvalsCount = useDecisions().openCount(approvalIds);
  const { openPanel } = useShellUI();

  return (
    <aside className={s.sidebar} aria-label="Sidebar">
      <Link href="/" className={s.brand}>
        <span className={s.mark} aria-hidden="true">B</span>
        <span className={s.wordmark}>Break Records.</span>
        <span className="visually-hidden">, home</span>
      </Link>

      <LabelSwitcher labelName={labelName} tenants={tenants} />

      <nav aria-label="Primary" className={s.nav}>
        {primaryNav.map((item) => {
          const Icon = item.icon;
          if (item.locked) {
            return (
              <div key={item.label} className={`${s.item} ${s.locked}`} aria-disabled="true" title={`${item.label}: Phase 2, coming later`}>
                <span className={s.dot} aria-hidden="true" />
                <Icon className={s.icon} size={20} aria-hidden="true" />
                <span className={s.label}>{item.label}<span className="visually-hidden">, Phase 2, coming later</span></span>
                <span className={s.tag} aria-hidden="true">Phase 2</span>
              </div>
            );
          }
          const active = isActive(item, pathname);
          const count = item.badge === 'approvals' ? approvalsCount : 0;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={s.item}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              <span className={s.dot} aria-hidden="true" />
              <Icon className={s.icon} size={20} aria-hidden="true" />
              <span className={s.label}>
                {item.label}
                {count > 0 && <span className="visually-hidden">, {count} waiting</span>}
              </span>
              {count > 0 && <span className={s.badge} aria-hidden="true">{count}</span>}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Secondary" className={s.footer}>
        <button type="button" className={`${s.item} ${s.footerItem} ${s.askItem}`} onClick={() => openPanel()} title="Ask the Label Head" aria-haspopup="dialog">
          <MessageSquare className={s.icon} size={18} aria-hidden="true" />
          <span className={s.label}>Ask the Label Head</span>
        </button>
        {footerNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`${s.item} ${s.footerItem}`}
              aria-current={isActive(item, pathname) ? 'page' : undefined}
              title={item.label}
            >
              <Icon className={s.icon} size={18} aria-hidden="true" />
              <span className={s.label}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** The label you're working in. With more than one, it opens a list to switch. */
function LabelSwitcher({ labelName, tenants }: { labelName: string; tenants: { id: string; name: string; current: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const others = tenants.filter((t) => !t.current);
  const choose = async (id: string) => {
    setError('');
    const res = await fetch('/api/session/tenant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: id }) }).catch(() => null);
    if (!res?.ok) { setError('Couldn’t switch. Try again.'); return; }
    window.location.assign('/'); // everything on screen belongs to the label, so start fresh
  };
  return (
    <div className={s.switcherWrap} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className={s.switcher} aria-expanded={others.length ? open : undefined} aria-controls={others.length ? 'label-list' : undefined}
        onClick={() => others.length && setOpen((o) => !o)}>
        <span>
          <span className={s.switcherKicker}>Label</span>
          <span className={s.switcherName}>{labelName}</span>
          <span className="visually-hidden">{others.length ? ', switch label' : ''}</span>
          <span className={s.switcherInitial} aria-hidden="true">{labelName.charAt(0)}</span>
        </span>
        {others.length > 0 && <ChevronDown className={s.switcherChevron} size={14} aria-hidden="true" />}
      </button>
      {open && (
        <ul id="label-list" className={s.switcherList} aria-label="Switch label">
          {others.map((t) => <li key={t.id}><button type="button" className={s.switcherItem} onClick={() => choose(t.id)}>{t.name}</button></li>)}
        </ul>
      )}
      {error && <p className={s.switcherError} role="alert"><CircleAlert size={12} aria-hidden="true" />{error}</p>}
    </div>
  );
}
