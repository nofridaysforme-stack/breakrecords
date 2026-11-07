'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CircleAlert, Undo2 } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button, ButtonLink } from '@/components/ui/Button';
import { VerifiedStamp } from '@/components/ui/Blocks';
import { LinkTabs } from '@/components/ops/LinkTabs';
import type { getFunding } from '@/data/api';
import type { FundingItem } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Funding.module.css';

type Data = ReturnType<typeof getFunding>;
export type FundingTab = 'opportunities' | 'applications' | 'offers';

export function FundingHead({ data }: { data: Data }) {
  return (
    <>
      <div><PageTitle>Funding</PageTitle><p className={o.sub}>Funding Scout checks sources weekly. Free money first, then offers, with the true cost of each.</p></div>
      <LinkTabs label="Funding" tabs={[
        { label: 'Opportunities', href: '/funding', count: data.counts.opportunities, exact: true },
        { label: 'Applications', href: '/funding/applications', count: data.counts.applications },
        { label: 'Offers', href: '/funding/offers', count: data.counts.offers, exact: true },
      ]} />
    </>
  );
}

const TYPE_TONE = { grant: s.typeGood, advance: s.typeAccent, sale: s.typeCritical };
const COST_TONE = { good: o.good, plain: '', critical: o.critical };

/** 5d. Grants first, then offers. Permanent offers always carry the red box. */
export function FundingView({ data, tab }: { data: Data; tab: FundingTab }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const items = data.items.filter((f) => (tab === 'offers' ? f.kind !== 'grant' : true));
  const last = dismissed.at(-1);
  const lastItem = data.items.find((f) => f.id === last);

  if (tab === 'applications') {
    return (
      <div className={o.tableWrap} role="region" aria-label="Applications" tabIndex={0}>
        <table className={o.table}>
          <thead><tr><th scope="col">Application</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Due</th><th scope="col">Prepared by</th></tr></thead>
          <tbody>
            {data.applications.map((a) => (
              <tr key={a.id}>
                <th scope="row"><Link href={a.href} className={s.appLink}>{a.title}</Link></th>
                <td className={o.mono}>{a.amount}</td>
                <td className={o.text2}>{a.status}</td>
                <td className={o.dateMono}>{a.due}</td>
                <td className={o.text2}>{a.agent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {lastItem && (
        <p className={o.toast} role="status">
          Dismissed &quot;{lastItem.title}&quot;. Funding Scout won&apos;t suggest it again.
          <button type="button" className={o.linkInline} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--tap-min)' }} onClick={() => setDismissed((d) => d.slice(0, -1))}><Undo2 size={14} aria-hidden="true" />Undo</button>
        </p>
      )}
      <ul className={s.cards}>
        {items.filter((f) => !dismissed.includes(f.id)).map((f) => <li key={f.id} className={s.cardItem}><FundingCard f={f} onDismiss={() => setDismissed((d) => [...d, f.id])} /></li>)}
      </ul>
      {tab === 'offers' && <div><ButtonLink href="/funding/offers/compare" variant="primary">Compare both offers</ButtonLink></div>}
      <section aria-labelledby="src-h" className={s.sources}>
        <h2 id="src-h" className={o.eyebrow}>Sources</h2>
        <ul>{items.map((f) => <li key={f.id} id={`src-${f.id}`} className={o.small}>{f.title}: {f.kind === 'grant' ? 'the council’s published guidelines' : 'the offer document you received'}, checked {f.verified}.</li>)}</ul>
      </section>
    </>
  );
}

function FundingCard({ f, onDismiss }: { f: FundingItem; onDismiss: () => void }) {
  const hid = `fund-${f.id}`;
  return (
    <article className={`${s.card} ${f.kind === 'grant' ? s.cardBest : f.permanent ? s.cardPermanent : ''}`} aria-labelledby={hid}>
      <div className={s.cardTop}><span className={`${s.type} ${TYPE_TONE[f.kind]}`}>{f.type}</span><span className={s.fit}>Fit {f.fit}</span></div>
      <h2 id={hid} className={s.title}>{f.title}</h2>
      <p className={s.amount}>{f.amount}</p>
      <dl className={s.facts}>
        <dt>It costs</dt><dd className={`${s.cost} ${COST_TONE[f.costTone]}`}>{f.cost}</dd>
        <dt>Deadline</dt><dd>{f.deadline}</dd>
        <dt>Draft</dt><dd>{f.draft}</dd>
      </dl>
      {f.permanent && (
        <p className={s.permanent}><strong className={s.permWord}><CircleAlert size={13} strokeWidth={2.5} aria-hidden="true" />Permanent.</strong> You never get this income back.</p>
      )}
      <div className={s.verified}><VerifiedStamp date={f.verified} href={`#src-${f.id}`} /></div>
      <div className={s.cardActions}>
        <ButtonLink href={f.primary.href} variant="primary" className={s.flex}>{f.primary.label}</ButtonLink>
        <Button className={s.flex} onClick={onDismiss} aria-label={`Dismiss ${f.title}`}>Dismiss</Button>
      </div>
    </article>
  );
}
