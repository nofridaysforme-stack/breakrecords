import { describe, expect, it } from 'vitest';
import { dayMonth, monthYear, recoupment, shareBasis, shareTerms, signPrompt, taxState } from '../src/payouts';

const v4 = { producerBp: 300, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 1000 };
const v5 = { producerBp: 300, labelOfNetBp: 4000, artistOfNetBp: 5500, featureOfArtistBp: 1000 };
const first = { producer: 'Marco', label: 'Northline', artist: 'Kesi', feature: 'Ari' };

describe('portal wording', () => {
  it('says what each role is owed', () => {
    expect(shareTerms('producer', v4)).toBe('3 points');
    expect(shareTerms('artist', v4)).toBe('43.65%');
    expect(shareTerms('feature', v4)).toBe('4.85%');
    expect(shareBasis('producer', v4)).toBe('3 points.');
    expect(shareBasis('artist', v4)).toBe('50% of net profit, less feature.');
    expect(shareBasis('label', v4)).toBe('50% of net profit.');
  });
  it('tells a payee what a new version changes for them', () => {
    expect(signPrompt('producer', v4, v5, first)).toBe('Your 3 points don’t change. Kesi’s share does.');
    expect(signPrompt('artist', v4, v5, first)).toBe('Your share goes up from 43.65% to 48.02% of recording income.');
    expect(signPrompt('label', v4, v5, first)).toBe('Your share goes down from 48.5% to 38.8% of recording income.');
    expect(signPrompt('producer', v4, { ...v4, producerBp: 400 }, first)).toBe('Your points go up from 3 to 4 points.');
    expect(signPrompt('producer', v4, v4, first)).toBe('Your 3 points don’t change.');
  });
});

describe('tax forms', () => {
  it('on file, expiring within 60 days, expired or missing', () => {
    expect(taxState('W-9', null, '2026-11-08')).toEqual({ status: 'ok', label: 'On file' });
    expect(taxState('W-9', '2026-12-01', '2026-11-08')).toEqual({ status: 'expiring', label: 'Expires Dec 1' });
    expect(taxState('W-8BEN', '2028-01-01', '2026-11-08').status).toBe('ok');
    expect(taxState('W-9', '2026-11-01', '2026-11-08')).toEqual({ status: 'missing', label: 'Expired Nov 1' });
    expect(taxState(null, null, '2026-11-08')).toEqual({ status: 'missing', label: 'Missing' });
  });
  it('formats dates in UTC', () => { expect(dayMonth('2026-12-01')).toBe('Dec 1'); expect(monthYear('2026-10-01')).toBe('Oct 2026'); });
});

describe('recoupment', () => {
  const costs = [{ cost: 220000, shareBp: 10000 }, { cost: 80000, shareBp: 10000 }, { cost: 40000, shareBp: 10000 }, { cost: 120000, shareBp: 5000 }];
  it('totals the advance and each recoupable share, and finds the month it was recouped', () => {
    const r = recoupment(0, costs, [{ period: '2026-09-01', amount: 100000 }, { period: '2026-10-01', amount: 300000 }]);
    expect(r).toMatchObject({ recoupable: 400000, total: 400000, recouped: 400000, remaining: 0 });
    expect(r.recoupedIn?.toISOString().slice(0, 7)).toBe('2026-10');
  });
  it('still recouping: what is left, and no month yet', () => {
    const r = recoupment(500000, [{ cost: 100000, shareBp: 5000 }], [{ period: '2026-10-01', amount: 305000 }]);
    expect(r).toMatchObject({ total: 550000, recouped: 305000, remaining: 245000, recoupedIn: null });
  });
});
