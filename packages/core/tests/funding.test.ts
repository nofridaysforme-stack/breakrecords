import { describe, expect, it } from 'vitest';
import { fundingCard, type Opportunity } from '../src/funding';

const a = { annualIncome: 1320000, growthBp: 0, albumAnnualIncome: 480000, years: 5 };
const base = { title: null, upTo: false, repayTotal: null, shareBp: null, album: null, draftPct: null, approvalId: null, verifiedOn: '2026-11-03' };

describe('funding cards', () => {
  it('a grant costs nothing and counts down to its deadline', () => {
    const g: Opportunity = { ...base, id: 'fund_grant', kind: 'grant', title: 'State arts council project grant', cash: 500000, upTo: true, deadline: '2026-11-15', fitBp: 8600, draftPct: 80, approvalId: 'apr_grant' };
    expect(fundingCard(g, a, '2026-11-06')).toEqual({
      id: 'fund_grant', kind: 'grant', type: 'Grant · non-repayable', title: 'State arts council project grant', amount: 'Up to $5,000', cost: 'Nothing to repay', costTone: 'good',
      deadline: 'Nov 15 · 9 days', draft: '80% done', fit: '86%', verified: 'Nov 3, 2026', permanent: false, primary: { label: 'Open draft', href: '/approvals/apr_grant' },
    });
  });
  it('an advance reads its cost and term from the repayment math', () => {
    const c = fundingCard({ ...base, id: 'fund_advance', kind: 'advance', cash: 800000, repayTotal: 896000, shareBp: 6000, deadline: '2026-12-01', fitBp: 7100, verifiedOn: '2026-11-02' }, a, '2026-11-06');
    expect(c).toMatchObject({ title: '$8,000 for 60% of streaming until repaid', amount: '$8,000', cost: 'About $960, 14 months', costTone: 'plain', deadline: 'Offer open to Dec 1', permanent: false });
  });
  it('a sale is permanent, and its cost is the album income it takes', () => {
    const c = fundingCard({ ...base, id: 'fund_sale', kind: 'sale', cash: 1500000, shareBp: 5000, album: 'Velvet Hours', deadline: '2026-11-30', fitBp: 3800, verifiedOn: '2026-11-04' }, a, '2026-11-06');
    expect(c).toMatchObject({ title: '$15,000 for 50% of one album, forever', cost: 'About $12,000 over 5 yrs', costTone: 'critical', permanent: true, fit: '38%' });
  });
  it('more income repays an advance sooner', () => {
    const c = fundingCard({ ...base, id: 'x', kind: 'advance', cash: 800000, repayTotal: 896000, shareBp: 6000, deadline: '2026-12-01', fitBp: 7100 }, { ...a, annualIncome: 2640000 }, '2026-11-06');
    expect(c.cost).toBe('About $960, 7 months');
  });
});
