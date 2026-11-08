import Link from 'next/link';
import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import { ProgressBar } from '@/components/ui/Controls';
import { RiskFlag } from '@/components/ui/Status';
import { listReleases } from '@/data/api';
import { long } from '@breakrecords/core/dates';
import { formatMoney } from '@breakrecords/core/money';
import s from '@/components/runbook/Runbook.module.css';

export const metadata: Metadata = { title: 'Releases' };

// Undrawn: built from the runbook header parts (2g) at inbox density.
export default async function ReleasesPage() {
  const releases = await listReleases();
  return (
    <Page>
      <div>
        <PageTitle>Releases</PageTitle>
        <p style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-2)', marginTop: 6 }}>{releases.length} in progress. Each one runs on its own runbook.</p>
      </div>
      <ul className={s.list}>
        {releases.map((r) => {
          const pct = Math.round((r.spent / r.budget) * 100);
          return (
            <li key={r.id}>
              <Link href={`/releases/${r.id}`} className={s.release}>
                <span className={s.releaseCover} aria-hidden="true" />
                <span><span className={s.releaseTitle} style={{ display: 'block' }}>{r.title}</span><span className={s.releaseMeta}>{r.kind} · {r.artist} · {long(r.date)}</span></span>
                <span><RiskFlag risk={r.status === 'onTrack' ? 'low' : r.status === 'atRisk' ? 'dueSoon' : 'blocked'} label={r.status === 'onTrack' ? 'On track' : r.status === 'atRisk' ? 'At risk' : 'Blocked'} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ProgressBar value={pct} label={`${pct}% of budget spent`} />
                  <span className={s.budgetText}>{formatMoney(r.spent, { wholeIfRound: true })} of {formatMoney(r.budget, { wholeIfRound: true })}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
