import Link from 'next/link';
import { ProgressBar } from '@/components/ui/Controls';
import { RiskFlag } from '@/components/ui/Status';
import type { listReleases } from '@/data/api';
import { long } from '@breakrecords/core/dates';
import { formatMoney } from '@breakrecords/core/money';
import s from './Runbook.module.css';

type Release = Awaited<ReturnType<typeof listReleases>>[number];

/** Releases on the way out, each on its own runbook. Shown at the top of Catalog › Releases. */
export function InProgress({ releases }: { releases: Release[] }) {
  return (
    <section id="in-progress" aria-labelledby="in-progress-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="in-progress-h" style={{ font: '600 var(--fs-h3) var(--font-ui)', margin: 0 }}>In progress</h2>
      {releases.length ? (
        <>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>{releases.length} on the way out. Each one runs on its own runbook.</p>
          <ul className={s.list}>
            {releases.map((r) => {
              const pct = r.budget ? Math.round((r.spent / r.budget) * 100) : 0;
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
        </>
      ) : <p style={{ color: 'var(--text-2)', margin: 0 }}>Nothing on the way out right now. A release with a date gets a runbook here.</p>}
      <h2 style={{ font: '600 var(--fs-h3) var(--font-ui)', margin: '12px 0 0' }}>All releases</h2>
    </section>
  );
}
