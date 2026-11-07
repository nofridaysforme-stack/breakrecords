import { describe, expect, test } from 'vitest';
import { advance, baselineIncome, sale } from '@/lib/offers';
import { contrast, formatRatio, mix } from '@/lib/contrast';
import { checkTheme, themeVars } from '@/lib/theme';
import { advanceOffer, harborTheme, offerAssumptions, saleOffer, unclaimed, departments, labelConfig } from '@/data/ops';

describe('offer comparison (5e)', () => {
  test('matches the frame at the sample assumptions', () => {
    expect(baselineIncome(offerAssumptions)).toBe(6_600_000);
    const a = advance(offerAssumptions, advanceOffer);
    expect(a).toMatchObject({ cost: 96_000, months: 14, income: 6_504_000 });
    expect(Math.round(a.yearlyCostBp / 100)).toBe(10);
    const s = sale(offerAssumptions, saleOffer);
    expect(s).toMatchObject({ cost: 1_200_000, yearlyCostBp: 1600, income: 5_400_000 });
  });
  test('growth makes the sale cost more and repays the advance sooner', () => {
    const g = { ...offerAssumptions, growthBp: 2000 };
    expect(sale(g, saleOffer).cost).toBeGreaterThan(1_200_000);
    expect(advance(g, advanceOffer).months).toBeLessThanOrEqual(14);
  });
});

describe('contrast (5i)', () => {
  test('black on white is 21:1 and rounds down', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5); // lint-allow-hex
    expect(formatRatio(4.499)).toBe('4.49:1');
  });
  test('mix', () => { expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080'); }); // lint-allow-hex
  test('Harbor Sound passes every pair', () => {
    const checks = checkTheme(harborTheme);
    expect(checks.length).toBeGreaterThan(5);
    expect(checks.every((c) => c.pass)).toBe(true);
  });
  test('a low-contrast text color fails', () => {
    const bad = checkTheme({ ...harborTheme, text: '#3a4a4c' }); // lint-allow-hex
    expect(bad.some((c) => !c.pass)).toBe(true);
  });
  test('derives the full token set', () => {
    expect(themeVars(harborTheme)['--bg']).toBe(harborTheme.background);
    expect(themeVars(harborTheme)['--on-accent']).toBe(harborTheme.background);
  });
});

describe('Batch 3 fixtures', () => {
  test('unclaimed items add up to the 4b and 5c total', () => {
    expect(unclaimed.items.reduce((a, i) => a + i.amount, 0)).toBe(unclaimed.total);
  });
  test('department caps fit under the label cap', () => {
    expect(departments.reduce((a, d) => a + (d.spendCap ?? 0), 0)).toBeLessThanOrEqual(labelConfig.spendCap);
    expect(departments).toHaveLength(14);
  });
});

import { draftPlan, looksLikeGoal, parseGoal } from '@/lib/plan';

describe('goal parsing (command bar)', () => {
  test('reads format, budget and month', () => {
    expect(parseGoal('Plan an EP for May on $6k')).toMatchObject({ kind: 'release', format: 'EP', budget: 600_000, month: 4 });
    expect(parseGoal("Find money I'm owed").kind).toBe('money');
    expect(parseGoal('Set up splits for my band').kind).toBe('splits');
  });
  test('an EP for May lands on the first Friday of May 2027', () => {
    const p = draftPlan('Plan an EP for May', '2026-11-06');
    expect(p.title).toBe('Release an EP on May 7');
    expect(p.budgetAssumed).toBe(true);
    expect(p.assumptions.join(' ')).toMatch(/No budget given/);
  });
  test('search words are not goals; requests are', () => {
    expect(looksLikeGoal('Glasshouse')).toBe(false);
    expect(looksLikeGoal('plan an EP for May')).toBe(true);
  });
});
