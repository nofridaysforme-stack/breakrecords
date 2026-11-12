'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, CircleAlert, Download } from 'lucide-react';
import type { TaxYearResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { RiskFlag } from '@/components/ui/Status';
import { useDecisions } from '@/data/decisions';
import s from './Money.module.css';

const pct = (bp: number) => `${bp / 100}%`;

/** Year-end tax forms: what each payee was paid in the year, which form they need, and filing it through an approval. */
export function TaxView({ data: initial }: { data: TaxYearResponse }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { decisions } = useDecisions();
  const y = data.year;
  // The card is decided in Approvals; this page follows that decision without a reload.
  const decided = data.filing.approvalId ? decisions[data.filing.approvalId]?.status : undefined;
  const status = data.filing.status === 'filed' ? 'filed' : data.filing.status === 'none' ? 'none'
    : decided === 'approved' ? 'approved' : decided === 'rejected' ? 'rejected' : data.filing.status === 'rejected' && decided === undefined ? 'awaiting' : data.filing.status;
  const reportable = data.forms1099.filter((f) => f.reportable);
  const forms = reportable.length + data.forms1042s.length;

  async function post(path: string) {
    setError(null); setBusy(true);
    try {
      const res = await fetch(`/api/money/tax/${y}/${path}`, { method: 'POST' });
      const body = await res.json();
      if (res.ok) setData(body); else setError(body.message ?? 'That didn’t go through.');
    } catch { setError('Couldn’t reach the server. Nothing changed.'); }
    setBusy(false);
  }

  return (
    <>
      <div>
        <PageTitle>Year-end tax forms</PageTitle>
        <p className={s.sub}>{data.payer} · payments sent in {y} · a 1099-MISC for US payees paid $10.00 or more, a 1042-S for each payee outside the US</p>
      </div>
      {data.years.length > 1 && (
        <nav aria-label="Tax year" className={s.tabs}>
          {data.years.map((x) => <Link key={x} href={`/money/tax?year=${x}`} className={s.tab} aria-current={x === y ? 'page' : undefined}>{x}</Link>)}
        </nav>
      )}

      <section className={s.card} aria-labelledby="filing">
        <h2 id="filing" className={s.cardTitle}>Filing for {y}</h2>
        {status === 'none' && (forms
          ? <p className={s.text}>{forms} form{forms === 1 ? '' : 's'} to file. Preparing sends them to Approvals; nothing is filed until you approve, and then you upload the file yourself.</p>
          : <p className={s.text}>No payee needs a {y} tax form yet.</p>)}
        {status === 'awaiting' && <p className={s.text}>The {y} filing is waiting in <Link href="/approvals" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Approvals</Link>. Nothing is filed until you approve it.</p>}
        {status === 'rejected' && <p className={s.text}>You rejected the {y} filing. Fix what was wrong, then prepare it again.</p>}
        {status === 'approved' && <p className={s.text}>Approved. Download the file, upload it to your filing service or the IRS, then mark {y} filed.</p>}
        {status === 'filed' && <p className={s.text} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} aria-hidden="true" />Filed on {data.filing.filedOn}. The approval can no longer be undone.</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(status === 'none' || status === 'rejected') && forms > 0 && <Button variant="primary" onClick={() => void post('prepare')} disabled={busy}>Prepare {y} filing</Button>}
          {status === 'awaiting' && <ButtonLink href="/approvals" variant="primary">Review in Approvals</ButtonLink>}
          {(status === 'approved' || status === 'filed') && <ButtonLink href={`/api/money/tax/${y}/csv`} download={`tax-forms-${y}.csv`} prefetch={false}><Download size={14} aria-hidden="true" />Download {y} file (CSV)</ButtonLink>}
          {status === 'approved' && <Button variant="primary" onClick={() => void post('filed')} disabled={busy}>Mark {y} filed</Button>}
        </div>
        {error && <p role="alert" className={s.text} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--critical)' }}><CircleAlert size={16} aria-hidden="true" />Not done. {error}</p>}
      </section>

      {data.missing.length > 0 && (
        <section className={s.card} aria-labelledby="missing">
          <h2 id="missing" className={s.cardTitle}>Paid with no tax form</h2>
          <p className={s.text}>These payees were paid in {y} without a form on file. Ask them for one from <Link href="/money/payouts" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Payouts</Link> before filing.</p>
          <ul>{data.missing.map((m) => <li key={m.payeeId} className={s.row}><strong>{m.name}</strong><span className={s.amount}><Money cents={m.paid} /></span></li>)}</ul>
        </section>
      )}

      <div className={s.tableWrap} role="region" aria-label={`1099-MISC, ${y}`} tabIndex={0}>
        <table className={s.table}>
          <caption className={s.cardTitle} style={{ textAlign: 'left', padding: '18px 22px 6px' }}>1099-MISC · US payees</caption>
          <thead><tr><th scope="col">Payee</th><th scope="col">Taxpayer number</th><th scope="col" className={s.r}>Royalties (box 2)</th><th scope="col" className={s.r}>Withheld (box 4)</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {data.forms1099.length === 0 && <tr><td colSpan={5} className={s.noteCell}>No US payee was paid in {y}.</td></tr>}
            {data.forms1099.map((f) => (
              <tr key={f.payeeId}>
                <th scope="row">{f.name}</th>
                <td className={s.form}>{f.tinLast4 ? `ending ${f.tinLast4}` : 'Not on file'}</td>
                <td className={`${s.r} ${s.amountStrong}`}><Money cents={f.royalties} /></td>
                <td className={s.r}><Money cents={f.withheld} /></td>
                <td><RiskFlag risk={!f.reportable ? 'low' : f.tinLast4 ? 'low' : 'dueSoon'} label={f.note} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.tableWrap} role="region" aria-label={`1042-S, ${y}`} tabIndex={0}>
        <table className={s.table}>
          <caption className={s.cardTitle} style={{ textAlign: 'left', padding: '18px 22px 6px' }}>1042-S · payees outside the US</caption>
          <thead><tr><th scope="col">Payee</th><th scope="col">Country</th><th scope="col">Rate</th><th scope="col" className={s.r}>Royalties</th><th scope="col" className={s.r}>Withheld</th></tr></thead>
          <tbody>
            {data.forms1042s.length === 0 && <tr><td colSpan={5} className={s.noteCell}>No payee outside the US was paid in {y}.</td></tr>}
            {data.forms1042s.map((f) => (
              <tr key={f.payeeId}>
                <th scope="row">{f.name}</th>
                <td className={s.form}>{f.country ?? 'Not on file'}</td>
                <td className={s.form}>{pct(f.rateBp)}</td>
                <td className={`${s.r} ${s.amountStrong}`}><Money cents={f.gross} /></td>
                <td className={s.r}><Money cents={f.withheld} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.small}>The full taxpayer number isn’t stored here, only its last 4 digits. Your payout provider holds the rest; the file leaves it for you to fill in.</p>
    </>
  );
}
