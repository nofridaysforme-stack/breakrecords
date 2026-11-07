'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Circle, CircleAlert, Minus } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { RiskFlag } from '@/components/ui/Status';
import { useDecisions } from '@/data/decisions';
import type { payouts as P } from '@/data/money';
import { formatMoney } from '@breakrecords/core/money';
import s from './Money.module.css';

const STATUS = {
  awaiting: { Icon: Circle, cls: s.sAwaiting, label: 'Awaiting approval' },
  draft: { Icon: Minus, cls: s.sDraft, label: 'Draft' },
  sent: { Icon: Check, cls: s.sSent, label: 'Sent' },
  failed: { Icon: CircleAlert, cls: s.sFailed, label: 'Failed for 1' },
};

export function PayoutsView({ data }: { data: typeof P }) {
  const { decisions } = useDecisions();
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const request = (name: string) => setRequested((r) => new Set(r).add(name));

  return (
    <>
      <div><PageTitle>Payouts</PageTitle><p className={s.sub}>Monthly for collaborators, quarterly for artists · {formatMoney(data.minimum)} minimum</p></div>
      <div className={s.tableWrap} role="region" aria-label="Payout batches" tabIndex={0}>
        <table className={s.table}>
          <caption className="visually-hidden">Payout batches</caption>
          <thead><tr><th scope="col">Batch</th><th scope="col">Payees</th><th scope="col" className={s.r}>Total</th><th scope="col">Status</th><th scope="col">Note</th><th scope="col"><span className="visually-hidden">Action</span></th></tr></thead>
          <tbody>
            {data.batches.map((b) => {
              const decided = b.approvalId ? decisions[b.approvalId] : undefined;
              const st = decided?.status === 'approved' ? { Icon: Check, cls: s.sSent, label: 'Approved' } : decided?.status === 'rejected' ? { Icon: CircleAlert, cls: s.sFailed, label: 'Rejected' } : STATUS[b.status];
              const note = decided?.status === 'approved' ? 'Sends Nov 10' : decided?.status === 'rejected' ? `"${decided.reason}"` : b.status === 'failed' && requested.has('Theo Lind') ? 'Asked Theo for new bank details' : b.note;
              return (
                <tr key={b.id}>
                  <th scope="row">{b.name}</th>
                  <td style={{ color: 'var(--text-2)' }}>{b.payees}</td>
                  <td className={`${s.r} ${s.amountStrong}`} style={{ fontSize: 'var(--fs-body)' }}><Money cents={b.total} /></td>
                  <td><span className={`${s.status} ${st.cls}`}><st.Icon size={13} strokeWidth={2.5} aria-hidden="true" />{st.label}</span></td>
                  <td className={s.noteCell}>{note}</td>
                  <td className={s.r}>
                    {b.status === 'awaiting' && !decided && b.approvalId && <ButtonLink href={`/approvals/${b.approvalId}`} variant="primary" size="sm">Review</ButtonLink>}
                    {b.status === 'failed' && !requested.has('Theo Lind') && <Button size="sm" onClick={() => request('Theo Lind')}>Fix</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={s.grid2wide}>
        <section className={s.card} aria-labelledby="tax" style={{ gap: 6 }}>
          <h2 id="tax" className={s.cardTitle} style={{ marginBottom: 8 }}>Tax forms</h2>
          <ul>
            {data.taxForms.map((t) => (
              <li key={t.name} className={s.taxRow}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span className={s.form}>{t.form}</span>
                <RiskFlag risk={t.status === 'ok' ? 'low' : t.status === 'expiring' ? 'dueSoon' : 'blocked'} label={t.label} />
                <span className={s.r}>
                  {t.fix && (requested.has(t.name)
                    ? <span className={s.small} role="status">Request sent</span>
                    : <button type="button" className={s.linkBtn} onClick={() => request(t.name)}>{t.fix}<span className="visually-hidden"> for {t.name}</span></button>)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className={s.card} aria-labelledby="carry">
          <h2 id="carry" className={s.cardTitle}>Carried forward</h2>
          <p className={s.text}>These balances are under the {formatMoney(data.minimum)} minimum. They roll into the next batch automatically.</p>
          <ul>
            {data.carryForward.map((c) => (
              <li key={c.name} className={s.row}><span><strong>{c.name}</strong> <span className={s.rowMeta}>· {c.role}</span></span><span className={s.amount}><Money cents={c.amount} /></span></li>
            ))}
          </ul>
          <p className={s.small}>See the October batch in <Link href="/approvals/apr_payout_oct" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Approvals</Link>.</p>
        </section>
      </div>
    </>
  );
}
