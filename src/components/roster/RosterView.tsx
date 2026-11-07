import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { ButtonLink } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import type { getRoster } from '@/data/api';
import o from '@/components/ops/Ops.module.css';
import s from './Roster.module.css';

/** Roster (undrawn): one card per artist, built from the catalog and contract parts. */
export function RosterView({ artists }: { artists: ReturnType<typeof getRoster> }) {
  return (
    <>
      <div className={o.head}>
        <div><PageTitle>Roster</PageTitle><p className={o.sub}>{artists.length} artists and collaborators. October income from your statements.</p></div>
        <ButtonLink href="/contracts/templates/artist?draft=1" variant="primary">Sign an artist</ButtonLink>
      </div>
      <ul className={s.grid}>
        {artists.map((a) => (
          <li key={a.id} className={s.card}>
            <div className={s.top}>
              <span className={`${o.art} ${s.photo}`} aria-hidden="true" />
              <div><h2 className={s.name}>{a.name}</h2><p className={o.small}>{a.type} · {a.genre}</p></div>
            </div>
            <dl className={o.kv} style={{ gridTemplateColumns: '120px minmax(0, 1fr)' }}>
              <dt>October income</dt><dd className={o.mono}><Money cents={a.income} /></dd>
              <dt>Releases</dt><dd className={o.mono}>{a.releases}</dd>
              <dt>Contract</dt><dd>{a.contract}</dd>
            </dl>
            <Link href={a.href} className={s.open}><span>{a.open}</span><ArrowRight size={14} aria-hidden="true" /></Link>
          </li>
        ))}
      </ul>
    </>
  );
}
