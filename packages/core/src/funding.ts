// Funding cards (5d), worked out from an opportunity's real terms with the same offer math the
// comparison (5e) uses, so a card and the comparison can never disagree.
import { daysBetween } from './dates';
import { formatMoney, type Cents } from './money';
import { advance, sale, type OfferAssumptions } from './offers';
import { formatPercent } from './percent';
import { dayMonth, dayMonthYear } from './payouts';

export type Opportunity = {
  id: string; kind: 'grant' | 'advance' | 'sale'; title: string | null;
  cash: Cents; upTo: boolean; repayTotal: Cents | null; shareBp: number | null; album: string | null;
  deadline: string; fitBp: number; draftPct: number | null; verifiedOn: string; approvalId: string | null;
};

export type FundingCard = {
  id: string; kind: Opportunity['kind']; type: string; title: string; amount: string; cost: string; costTone: 'good' | 'plain' | 'critical';
  deadline: string; draft: string; fit: string; verified: string; permanent: boolean; primary: { label: string; href: string };
};

const usd = (c: Cents) => formatMoney(c, { wholeIfRound: true });
const TYPE = { grant: 'Grant · non-repayable', advance: 'Royalty advance', sale: 'Partial catalog sale' } as const;

export function fundingCard(o: Opportunity, a: OfferAssumptions, todayIso: string): FundingCard {
  const base = { id: o.id, kind: o.kind, type: TYPE[o.kind], fit: formatPercent(o.fitBp), verified: dayMonthYear(o.verifiedOn) };
  if (o.kind === 'grant') {
    const days = daysBetween(todayIso, o.deadline);
    return {
      ...base, title: o.title ?? 'Grant', amount: `${o.upTo ? 'Up to ' : ''}${usd(o.cash)}`, cost: 'Nothing to repay', costTone: 'good',
      deadline: `${dayMonth(o.deadline)} · ${days === 1 ? '1 day' : `${days} days`}`, draft: o.draftPct === null ? 'Not started' : `${o.draftPct}% done`,
      permanent: false, primary: o.approvalId ? { label: 'Open draft', href: `/approvals/${o.approvalId}` } : { label: 'Start a draft', href: '/funding' },
    };
  }
  const compare = { label: 'Compare', href: '/funding/offers/compare' };
  if (o.kind === 'advance') {
    const r = advance(a, { kind: 'advance', cash: o.cash, repayTotal: o.repayTotal!, shareBp: o.shareBp! });
    return {
      ...base, title: `${usd(o.cash)} for ${formatPercent(o.shareBp!)} of streaming until repaid`, amount: usd(o.cash),
      cost: `About ${usd(r.cost)}, ${r.months} months`, costTone: 'plain', deadline: `Offer open to ${dayMonth(o.deadline)}`, draft: 'Compare', permanent: false, primary: compare,
    };
  }
  const r = sale(a, { kind: 'sale', cash: o.cash, shareBp: o.shareBp!, album: o.album ?? '' });
  return {
    ...base, title: `${usd(o.cash)} for ${formatPercent(o.shareBp!)} of one album, forever`, amount: usd(o.cash),
    cost: `About ${usd(r.cost)} over ${a.years} yrs`, costTone: 'critical', deadline: `Offer open to ${dayMonth(o.deadline)}`, draft: 'Compare', permanent: true, primary: compare,
  };
}
