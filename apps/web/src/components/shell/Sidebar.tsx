'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, CircleAlert, Handshake, KeyRound, MessageSquare, Plus } from 'lucide-react';
import { footerNav, isActive, primaryNav, type NavItem } from './nav';
import { useShellUI } from './ShellUI';
import { useWorkspace } from './Workspace';
import { useDecisions } from '@/data/decisions';
import s from './Sidebar.module.css';

// Label services (a licensee) add and open client workspaces from here.
const CLIENTS: NavItem = { label: 'Clients', href: '/clients', match: '/clients', icon: Building2 };
const staffClients = (kind: string) => kind === 'licensee';
// Labels that pay you (you're their payee): what your deal with each covers.
const CONNECTIONS: NavItem = { label: 'Labels I work with', href: '/connections', match: '/connections', icon: Handshake };

type Props = { labelName: string; staff?: boolean; tenants?: { id: string; name: string; current: boolean }[]; connections?: number; approvalIds: string[] };

export function Sidebar({ labelName, staff = false, tenants = [], connections = 0, approvalIds }: Props) {
  const pathname = usePathname() ?? '/';
  const approvalsCount = useDecisions().openCount(approvalIds);
  const { openPanel } = useShellUI();
  const { kind } = useWorkspace();

  return (
    <aside className={s.sidebar} aria-label="Sidebar">
      <Link href="/" className={s.brand}>
        <span className={s.mark} aria-hidden="true">I</span>
        <span className={s.wordmark}>Indie SRVCS.</span>
        <span className="visually-hidden">, home</span>
      </Link>

      <LabelSwitcher labelName={labelName} tenants={tenants} />

      <nav aria-label="Primary" className={s.nav}>
        {[...primaryNav, ...(staffClients(kind) ? [CLIENTS] : []), ...(connections > 0 ? [CONNECTIONS] : [])].map((item) => {
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
        {[...footerNav, ...(staff ? [{ label: 'Invite codes', href: '/admin/invite-codes', match: '/admin', icon: KeyRound }] : [])].map((item) => {
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

/**
 * The workspace you're working in. It opens a list to switch to another you run or work in,
 * and to start a new one of your own (signed in only).
 */
function LabelSwitcher({ labelName, tenants }: { labelName: string; tenants: { id: string; name: string; current: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const others = tenants.filter((t) => !t.current);
  const canOpen = tenants.length > 0; // signed in
  const { words } = useWorkspace();
  const choose = async (id: string) => {
    setError('');
    const res = await fetch('/api/session/tenant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: id }) }).catch(() => null);
    if (!res?.ok) { setError('Couldn’t switch. Try again.'); return; }
    window.location.assign('/'); // everything on screen belongs to the workspace, so start fresh
  };
  const start = async () => {
    setError(''); setBusy(true);
    const res = await fetch('/api/session/workspace', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.message ?? 'Couldn’t start a workspace. Try again.'); return; }
    window.location.assign('/onboarding');
  };
  return (
    <div className={s.switcherWrap} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className={s.switcher} aria-expanded={canOpen ? open : undefined} aria-controls={canOpen ? 'label-list' : undefined}
        onClick={() => canOpen && setOpen((o) => !o)}>
        <span>
          <span className={s.switcherKicker}>{words.kicker}</span>
          <span className={s.switcherName}>{labelName}</span>
          <span className="visually-hidden">{canOpen ? ', switch workspace' : ''}</span>
          <span className={s.switcherInitial} aria-hidden="true">{labelName.charAt(0)}</span>
        </span>
        {canOpen && <ChevronDown className={s.switcherChevron} size={14} aria-hidden="true" />}
      </button>
      {open && (
        <ul id="label-list" className={s.switcherList} aria-label="Switch workspace">
          {others.map((t) => <li key={t.id}><button type="button" className={s.switcherItem} onClick={() => choose(t.id)}>{t.name}</button></li>)}
          <li><button type="button" className={s.switcherItem} onClick={start} disabled={busy}><Plus size={12} aria-hidden="true" /> Start a new workspace</button></li>
        </ul>
      )}
      {error && <p className={s.switcherError} role="alert"><CircleAlert size={12} aria-hidden="true" />{error}</p>}
    </div>
  );
}
