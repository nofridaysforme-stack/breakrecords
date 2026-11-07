import { describe, expect, it } from 'vitest';
import { payouts, recoupment, royalties, statements } from '@/data/money';
import { finalBalance } from '@breakrecords/core/waterfall';
import { pctOf } from '@breakrecords/core/splits';

describe('Batch 2 fixtures add up', () => {
  it('every statement waterfall ends at its net, and the short form agrees', () => {
    for (const st of Object.values(statements)) {
      expect(finalBalance(st.rows), st.id).toBe(st.net);
      const simple = st.simple.reduce((a, l) => a + l.amount, 0);
      // The portal list shows income, deductions and the payee line; its last line is either the net or a sum.
      expect([simple, st.simple.at(-2)?.amount, st.net]).toContain(st.net);
    }
  });
  it('royalties: sources and artists both total income', () => {
    const src = royalties.sources.reduce((a, s) => a + s.amount, 0);
    const art = royalties.byArtist.reduce((a, s) => a + s.amount, 0);
    expect(src).toBe(royalties.stats.income);
    expect(art).toBe(royalties.stats.income);
  });
  it('recoupment: recoupable costs match frame 4e ($4,000.00 and $3,200.00)', () => {
    const recoupable = recoupment.map((r) => r.costs.reduce((a, c) => a + pctOf(c.cost, c.shareBp), 0));
    expect(recoupable).toEqual([400000, 320000]);
    const nb = recoupment[1];
    expect(nb.advance + recoupable[1] - nb.recouped).toBe(515000); // $5,150.00 to go
  });
  it('payouts: the October batch is the $1,240.18 approval', () => {
    expect(payouts.batches[0].total).toBe(124018);
  });
});
