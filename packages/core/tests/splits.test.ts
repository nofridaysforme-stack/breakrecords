import { describe, expect, it } from 'vitest';
import { allocate, checkSplit, pctOf } from '../src/splits';
import { pctToBp } from '../src/percent';
import { runWaterfall, finalBalance, type WaterfallStep } from '../src/waterfall';
import { toCents } from '../src/money';
import sample from '@design/sample-data.json';

const v4 = sample.splitVersions[0].shares.map((s) => ({ party: s.party, bp: pctToBp(s.pctOfTotal) }));
const v5 = sample.splitVersions[1].shares.filter((s) => s.party !== 'unassigned').map((s) => ({ party: s.party, bp: pctToBp(s.pctOfTotal) }));

describe('checkSplit', () => {
  it('accepts v4, which totals exactly 100%', () => {
    expect(checkSplit(v4)).toEqual({ ok: true, totalBp: 10000 });
  });
  it('rejects draft v5 and reports the 4.85% gap', () => {
    expect(checkSplit(v5)).toEqual({ ok: false, totalBp: 9515, gapBp: 485, reason: 'under' });
  });
  it('rejects a split over 100%', () => {
    expect(checkSplit([{ party: 'a', bp: 6000 }, { party: 'b', bp: 5000 }])).toMatchObject({ ok: false, gapBp: 1000, reason: 'over' });
  });
});

describe('allocate', () => {
  it('never drops or invents a cent', () => {
    for (const amount of [1, 7, 99, 100001, 1000000, 123457]) {
      const parts = allocate(amount, v4, 'Northline Records');
      expect(Object.values(parts).reduce((a, b) => a + b, 0)).toBe(amount);
    }
  });
  it('gives the rounding remainder to the party named in the rule', () => {
    const parts = allocate(1, [{ party: 'A', bp: 5000 }, { party: 'B', bp: 5000 }], 'B');
    expect(parts).toEqual({ A: 0, B: 1 });
  });
  it('refuses a split that does not total 100%', () => {
    expect(() => allocate(1000, v5, 'Northline Records')).toThrow(/95\.15%/);
  });
});

describe('Glasshouse October waterfall', () => {
  // Recompute from the deal rules, not from the stored numbers.
  const gross = toCents(10000);
  const platformFee = pctOf(gross, 500);
  const afterFee = gross - platformFee;
  const producer = pctOf(afterFee, 300);
  const recoup = toCents(4000);
  const netProfit = afterFee - producer - recoup;
  const [label, artist] = Object.values(allocate(netProfit, [{ party: 'label', bp: 5000 }, { party: 'artist', bp: 5000 }], 'label'));
  const feature = pctOf(artist, 1000);

  it('matches every figure in the worked example', () => {
    expect(platformFee).toBe(50000);
    expect(producer).toBe(28500);
    expect(netProfit).toBe(521500);
    expect(label).toBe(260750);
    expect(artist).toBe(260750);
    expect(feature).toBe(26075);
    expect(artist - feature).toBe(toCents(sample.artistNet));
  });

  it('running balances agree with the sample statement rows', () => {
    const steps: WaterfallStep[] = sample.waterfallGlasshouseOct2026.map((r, i) =>
      'subtotal' in r && r.subtotal
        ? { kind: 'subtotal', label: r.label }
        : { kind: i === 0 ? 'start' : 'step', label: r.label, rule: r.rule ?? '', amount: toCents(r.amount ?? 0), source: r.source },
    );
    const rows = runWaterfall(steps);
    rows.forEach((row, i) => expect(row.balance).toBe(toCents(sample.waterfallGlasshouseOct2026[i].balance)));
    expect(finalBalance(rows)).toBe(234675);
  });
});

describe('payout batch', () => {
  it('payees add up to the batch total', () => {
    const sum = sample.payoutBatchOct.payees.reduce((a, p) => a + toCents(p.net), 0);
    expect(sum).toBe(toCents(sample.payoutBatchOct.total));
  });
});

import { deriveShares } from '../src/dealSplit';

describe('deal terms to shares (4a)', () => {
  it('v4: 3 points, 50/50, feature 10% gives the signed shares', () => {
    const d = deriveShares({ producerBp: 300, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 1000 });
    expect([d.producer, d.label, d.artist, d.feature]).toEqual([300, 4850, 4365, 485]);
    expect(d.gapOfNetBp).toBe(0);
  });
  it('draft v5: label 40%, artist 55% leaves 5% of net profit, which is 4.85% of the total', () => {
    const d = deriveShares({ producerBp: 300, labelOfNetBp: 4000, artistOfNetBp: 5500, featureOfArtistBp: 1000 });
    expect([d.producer, d.label, d.artist, d.feature]).toEqual([300, 3880, 4802, 533]);
    expect(d.gapOfNetBp).toBe(500);
    expect(d.gapOfTotalBp).toBe(485);
  });
});
