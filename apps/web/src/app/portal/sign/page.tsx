import type { Metadata } from 'next';
import { SignView } from '@/components/portal/SignView';
import { getPortalPayee } from '@/data/api';
import { glasshouseDeal } from '@/data/money';
import { deriveShares } from '@breakrecords/core/dealSplit';

export const metadata: Metadata = { title: 'Sign split v5' };

type Props = { searchParams: Promise<{ as?: string }> };

// The payee signs v5 as the label sent it: the draft as fixed to 100% (label 45%, artist 55%).
// ASSUMED: the mockups never show the corrected v5; this uses label 45% so it totals 100%.
export default async function SignPage({ searchParams }: Props) {
  const p = await getPortalPayee((await searchParams).as);
  const d = deriveShares({ ...glasshouseDeal.v5.terms, labelOfNetBp: 4500 });
  const parties = [
    { party: 'Marco Dela', short: 'Producer', bp: d.producer, rule: 'Producer, 3 points off the top', color: 1 as const },
    { party: 'Northline Records', short: 'Label', bp: d.label, rule: '45% of net profit', color: 2 as const },
    { party: 'Kesi Vale', short: 'Kesi', bp: d.artist, rule: '55% of net profit, less feature', color: 3 as const },
    { party: 'Ari Monroe', short: 'Ari', bp: d.feature, rule: 'Feature, 10% of artist share', color: 4 as const },
  ];
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}><SignView p={p} parties={parties} /></div>;
}
