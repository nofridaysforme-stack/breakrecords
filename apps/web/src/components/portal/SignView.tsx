'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SplitBar, type SplitParty } from '@/components/ui/Splits';
import { useV5 } from '@/data/splitState';
import type { Payee } from '@/data/money';
import { withAs } from './payee';
import { deriveShares } from '@breakrecords/core/dealSplit';
import { formatPercent } from '@breakrecords/core/percent';
import s from './Portal.module.css';

export function SignView({ p, parties: fallback }: { p: Payee; parties: SplitParty[] }) {
  const v5 = useV5();
  // Show exactly what the label sent.
  const parties: SplitParty[] = v5.terms ? (() => {
    const t = v5.terms; const d = deriveShares(t);
    return [
      { party: 'Marco Dela', short: 'Producer', bp: d.producer, rule: 'Producer, points off the top', color: 1 },
      { party: 'Northline Records', short: 'Label', bp: d.label, rule: `${formatPercent(t.labelOfNetBp)} of net profit`, color: 2 },
      { party: 'Kesi Vale', short: 'Kesi', bp: d.artist, rule: `${formatPercent(t.artistOfNetBp)} of net profit, less feature`, color: 3 },
      { party: 'Ari Monroe', short: 'Ari', bp: d.feature, rule: `Feature, ${formatPercent(t.featureOfArtistBp)} of artist share`, color: 4 },
    ];
  })() : fallback;
  const signed = v5.signedBy(p.id);
  if (!v5.sent) {
    return (
      <>
        <h1 className={s.h1}>Nothing to sign yet</h1>
        <p className={s.note}>Northline hasn&apos;t sent the Glasshouse v5 split. You&apos;ll get an email when it&apos;s ready.</p>
        <Link href={withAs('/portal', p.id)} className={s.link}>Back to earnings</Link>
      </>
    );
  }
  return (
    <>
      <h1 className={s.h1}>{p.signPrompt.title}</h1>
      <p className={s.promptText}>{p.signPrompt.text} It takes effect Jan 1, 2027. Payouts under v5 wait until all 4 parties sign.</p>
      <SplitBar title="Glasshouse recording income, version 5" parties={parties} okMessage="Totals 100%" />
      {signed ? (
        <p className={s.ok} role="status"><Check size={14} aria-hidden="true" style={{ display: 'inline' }} /> You signed v5. Northline gets a copy.</p>
      ) : (
        <div className={s.stActions} style={{ maxWidth: 480 }}>
          <Button variant="primary" size="lg" onClick={() => v5.sign(p.id)}>Sign v5</Button>
          <Link href={withAs('/portal', p.id)} className={s.link} style={{ display: 'grid', placeItems: 'center' }}>Not now</Link>
        </div>
      )}
    </>
  );
}
