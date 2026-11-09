'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert, Minus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TypeGlyph } from '@/components/ui/Status';
import { formatMoney } from '@breakrecords/core/money';
import type { getDepartments, getSettings } from '@/data/api';
import type { IntegrationState, SettingsSection } from '@/data/ops';
import { useShellUI, type Density } from '@/components/shell/ShellUI';
import o from '@/components/ops/Ops.module.css';
import s from './Settings.module.css';

type Data = Awaited<ReturnType<typeof getSettings>>;

export function SettingsNav({ nav, current }: { nav: Data['nav']; current: SettingsSection }) {
  return (
    <nav className={s.nav} aria-label="Settings">
      <p className={s.navTitle}>Settings</p>
      <ul className={s.navList}>
        {nav.map((n) => <li key={n.id}><Link href={`/settings/${n.id}`} className={s.navItem} aria-current={n.id === current ? 'page' : undefined}>{n.label}</Link></li>)}
      </ul>
    </nav>
  );
}

function Config({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className={s.config}><dt className={s.configLabel}>{label}</dt><dd className={mono ? s.configMono : s.configValue}>{value}</dd></div>;
}

const ICON: Record<IntegrationState, { Icon: typeof Check; cls: string }> = { ok: { Icon: Check, cls: o.good }, off: { Icon: Minus, cls: o.muted }, err: { Icon: CircleAlert, cls: o.critical } };

function Integrations({ items }: { items: Data['integrations'] }) {
  const [list, setList] = useState(items);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  return (
    <section className={o.section} aria-labelledby="int-h">
      <h2 id="int-h" className={o.sectionTitleLg}>Integrations</h2>
      {msg && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{msg}</p>}
      {error && <p className={o.small} role="alert" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--critical)' }}><CircleAlert size={14} aria-hidden="true" />{error}</p>}
      <ul className={s.ints}>
        {list.map((i) => {
          const { Icon, cls } = ICON[i.state];
          const action = i.state === 'ok' ? 'Manage' : i.state === 'err' ? 'Reconnect' : 'Connect';
          return (
            <li key={i.id} className={s.int}>
              <span className={s.abbr} aria-hidden="true">{i.abbr}</span>
              <span className={s.intBody}><span className={s.intName}>{i.name}</span><span className={`${s.intStatus} ${cls}`}><Icon size={12} strokeWidth={2.5} aria-hidden="true" />{i.status}</span></span>
              <Button size="sm" variant={i.state === 'ok' ? 'secondary' : 'primary'} aria-label={`${action} ${i.name}`}
                onClick={async () => {
                  setError('');
                  if (i.state === 'ok') { setMsg(`${i.name} is connected. Settings for it open here in the full app.`); return; }
                  try {
                    const res = await fetch(`/api/settings/integrations/${i.id}/connect`, { method: 'POST' });
                    const body = await res.json();
                    if (!res.ok) { setMsg(''); setError(body.message ?? `${i.name} wasn’t connected.`); return; }
                    setList(body.integrations);
                    setMsg(`${i.name} connected. Nothing is filed or paid through it without your approval.`);
                  } catch { setMsg(''); setError('Couldn’t reach the server. Nothing was connected.'); }
                }}>{action}</Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 5h and the undrawn Settings sections, built from the same parts. */
export function SettingsSectionView({ data, section, depts }: { data: Data; section: SettingsSection; depts: Awaited<ReturnType<typeof getDepartments>>['departments'] }) {
  const c = data.config;
  switch (section) {
    case 'routing':
      return (
        <>
          <section className={o.section} aria-labelledby="rt-h">
            <h1 id="rt-h" className={o.sectionTitleLg}>Approval routing</h1>
            <div className={o.tableWrap} role="region" aria-label="Approval routing rules" tabIndex={0}>
              <table className={`${o.table} ${s.routing}`}>
                <colgroup><col className={s.c1} /><col /><col className={s.c3} /><col className={s.c4} /></colgroup>
                <thead className={s.srHead}><tr><th scope="col">Type</th><th scope="col">What it covers</th><th scope="col">Approver</th><th scope="col">Threshold</th></tr></thead>
                <tbody>
                  {data.routing.map((r) => (
                    <tr key={r.type}>
                      <th scope="row"><span className={s.rtType}><TypeGlyph type={r.type} />{r.label}</span></th>
                      <td className={o.text2}>{r.rule}</td>
                      <td>{r.who}</td>
                      <td className={s.cap}>{r.cap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <dl className={s.configs}>
            <Config label="Statement period" value={c.statementPeriod} />
            <Config label="Minimum payout" value={formatMoney(c.minimumPayout)} mono />
            <Config label="Monthly agent spend cap" value={formatMoney(c.spendCap)} mono />
          </dl>
          <Integrations items={data.integrations} />
        </>
      );
    case 'integrations':
      return <Integrations items={data.integrations} />;
    case 'statements':
      return (
        <section className={o.section} aria-labelledby="st-h">
          <h1 id="st-h" className={o.sectionTitleLg}>Statements and payouts</h1>
          <dl className={s.configs}>
            <Config label="Statement period" value={c.statementPeriod} />
            <Config label="Minimum payout" value={formatMoney(c.minimumPayout)} mono />
            <Config label="Payout approval" value="Every batch" />
          </dl>
          <p className={o.small}>Balances under the minimum carry over to the next period. Every payout batch comes to you as an approval. See <Link href="/money/payouts" className={o.linkInline}>Payouts</Link>.</p>
        </section>
      );
    case 'limits': {
      const used = depts.reduce((n, d) => n + (d.spendCap ?? 0), 0);
      return (
        <section className={o.section} aria-labelledby="lm-h">
          <h1 id="lm-h" className={o.sectionTitleLg}>Limits and caps</h1>
          <dl className={s.configs}>
            <Config label="Monthly agent spend cap" value={formatMoney(c.spendCap)} mono />
            <Config label="Given to departments" value={formatMoney(used)} mono />
            <Config label="Unallocated" value={formatMoney(c.spendCap - used)} mono />
          </dl>
          <div className={o.tableWrap} role="region" aria-label="Department spend caps" tabIndex={0}>
            <table className={o.table}>
              <thead><tr><th scope="col">Department</th><th scope="col">Agent</th><th scope="col">Cap a month</th></tr></thead>
              <tbody>{depts.filter((d) => d.spendCap !== null).map((d) => <tr key={d.id}><th scope="row" className={o.rowName}><Link href={`/departments?dept=${d.id}`} className={o.linkInline} style={{ color: 'var(--text)' }}>{d.name}</Link></th><td className={o.text2}>{d.agent}</td><td className={o.mono}>{formatMoney(d.spendCap!)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className={o.small}>Raising a cap over $250 is a plan change, so it comes to you as an approval.</p>
        </section>
      );
    }
    case 'profile':
      return (
        <section className={o.section} aria-labelledby="pf-h">
          <h1 id="pf-h" className={o.sectionTitleLg}>Profile</h1>
          <dl className={`${o.kv} ${o.card}`} style={{ display: 'grid', padding: '18px 20px', gridTemplateColumns: '160px minmax(0, 1fr)' }}>
            <dt>Label</dt><dd>{c.name}</dd>
            <dt>Country</dt><dd>{c.country}</dd>
            <dt>Profile</dt><dd>{c.profile}</dd>
            <dt>Default autonomy</dt><dd>Draft and wait</dd>
          </dl>
          <p className={o.small}>Changing your profile changes which departments are on. <Link href="/onboarding/welcome" className={o.linkInline}>Run setup again</Link>.</p>
          <DensityControl />
        </section>
      );
    case 'team':
      return (
        <section className={o.section} aria-labelledby="tm-h">
          <h1 id="tm-h" className={o.sectionTitleLg}>Team and roles</h1>
          <div className={o.tableWrap} role="region" aria-label="Team" tabIndex={0}>
            <table className={o.table}>
              <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Approves</th></tr></thead>
              <tbody>{data.team.map((t) => <tr key={t.id}><th scope="row" className={o.rowName}>{t.name}</th><td className={o.text2}>{t.role}</td><td className={o.text2}>{t.role === 'Owner' ? 'Everything' : 'Filings'}</td></tr>)}</tbody>
            </table>
          </div>
          {data.canInvite && <Invites initial={data.invites} payees={data.payeeOptions} />}
        </section>
      );
    case 'billing':
      return (
        <section className={o.section} aria-labelledby="bl-h">
          <h1 id="bl-h" className={o.sectionTitleLg}>Billing</h1>
          <p className={o.text2}>Billing isn&apos;t set up in this preview. Nothing is charged.</p>
        </section>
      );
    default:
      return null;
  }
}

const DENSITY: { id: Density; name: string; text: string }[] = [
  { id: 'comfortable', name: 'Comfortable', text: 'More room. Best for a few releases.' },
  { id: 'compact', name: 'Compact', text: 'Tighter rows and padding for labels with many releases.' },
];

/** flows.md: the data-density="compact" toggle. Saved on this device. */
function DensityControl() {
  const { density, setDensity } = useShellUI();
  return (
    <fieldset className={s.density}>
      <legend className={o.sectionTitle}>Display density</legend>
      <div className={s.densityOpts}>
        {DENSITY.map((d) => (
          <label key={d.id} className={s.densityOpt}>
            <input type="radio" name="density" value={d.id} checked={density === d.id} onChange={() => setDensity(d.id)} />
            <span><span className={s.densityName}>{d.name}</span><span className={o.small} style={{ display: 'block' }}>{d.text}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Owners let people sign in. Nothing is emailed: the person signs in with the address you add. */
function Invites({ initial, payees }: { initial: Data['invites']; payees: Data['payeeOptions'] }) {
  const [list, setList] = useState(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'team' | 'payee'>('team');
  const [payeeId, setPayeeId] = useState(payees[0]?.id ?? '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const send = async (method: 'POST' | 'DELETE', target?: string) => {
    setMsg(''); setError('');
    try {
      const res = method === 'POST'
        ? await fetch('/api/settings/invites', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), role, ...(role === 'payee' ? { payeeId } : {}) }) })
        : await fetch(`/api/settings/invites?email=${encodeURIComponent(target!)}`, { method });
      const body = await res.json();
      if (!res.ok) { setError(body.message ?? 'That didn’t save.'); return; }
      setList(body.invites);
      setMsg(method === 'POST' ? `${email.trim()} can now sign in. Tell them to use this address; nothing is emailed from here.` : `Invitation for ${target} withdrawn.`);
      if (method === 'POST') setEmail('');
    } catch { setError('Couldn’t reach the server. Nothing changed.'); }
  };
  return (
    <section className={o.section} aria-labelledby="inv-h">
      <h2 id="inv-h" className={o.sectionTitle}>Invite someone</h2>
      <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (email.trim()) void send('POST'); }}>
        <label className={o.field}>Email<input className={o.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required /></label>
        <label className={o.field}>Role
          <select className={o.input} value={role} onChange={(e) => setRole(e.target.value as 'team' | 'payee')}>
            <option value="team">Team: works in the label</option>
            <option value="payee">Payee: sees their own statements and splits</option>
          </select>
        </label>
        {role === 'payee' && (
          <label className={o.field}>Which payee
            <select className={o.input} value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>{payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
        )}
        <div className={o.formActions}><Button variant="primary" type="submit" disabled={!email.trim()} disabledReason="Add an email address first.">Invite</Button></div>
      </form>
      {msg && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{msg}</p>}
      {error && <p className={o.small} role="alert" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--critical)' }}><CircleAlert size={14} aria-hidden="true" />{error}</p>}
      {list.length > 0 && (
        <div className={o.tableWrap} role="region" aria-label="Invitations" tabIndex={0}>
          <table className={o.table}>
            <thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Added</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Action</span></th></tr></thead>
            <tbody>{list.map((i) => (
              <tr key={i.email}>
                <th scope="row" className={o.rowName}>{i.email}</th>
                <td className={o.text2}>{i.role === 'payee' ? `Payee${i.payee ? `, ${i.payee}` : ''}` : i.role === 'owner' ? 'Owner' : 'Team'}</td>
                <td className={o.dateMono}>{i.added}</td>
                <td className={o.text2}>{i.joined ? 'Joined' : 'Not signed in yet'}</td>
                <td>{!i.joined && <Button size="sm" onClick={() => send('DELETE', i.email)} aria-label={`Withdraw invitation for ${i.email}`}>Withdraw</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
