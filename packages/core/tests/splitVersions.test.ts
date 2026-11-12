import { describe, expect, it } from 'vitest';
import { editDraft, send, sign, signedCount, validTerms, type VersionState } from '../src/splitVersions';

// Draft v5 from 4a: Kesi raised to 55%, label lowered to 40%, so 5% of net profit is unassigned.
const v5: VersionState = { status: 'draft', terms: { producerBp: 300, labelOfNetBp: 4000, artistOfNetBp: 5500, featureOfArtistBp: 1000 }, signed: {} };

describe('split versions', () => {
  it('a draft that isn’t 100% can’t be sent', () => {
    expect(send(v5)).toMatchObject({ ok: false, error: 'not_100' });
  });
  it('fixing the label to 45% makes it sendable, and sending freezes it', () => {
    const fixed = editDraft(v5, { ...v5.terms, labelOfNetBp: 4500 });
    if (!fixed.ok) throw new Error();
    const sent = send(fixed.state);
    expect(sent).toMatchObject({ ok: true, state: { status: 'sent' } });
    if (!sent.ok) throw new Error();
    expect(editDraft(sent.state, v5.terms)).toMatchObject({ ok: false, error: 'not_draft' });
    expect(send(sent.state)).toMatchObject({ ok: false, error: 'not_draft' });
  });
  it('bad terms are refused', () => {
    expect(validTerms({ ...v5.terms, producerBp: 300.5 })).toMatch(/whole number/);
    expect(validTerms({ ...v5.terms, labelOfNetBp: 6000 })).toMatch(/exceed 100%/);
    expect(validTerms({ ...v5.terms, producerBp: 1500 })).toMatch(/Producer points/);
    expect(editDraft(v5, { ...v5.terms, featureOfArtistBp: -1 })).toMatchObject({ ok: false, error: 'invalid_terms' });
  });
  it('signing: only while sent, once per party, and the last signature puts it in effect', () => {
    const fixed = editDraft(v5, { ...v5.terms, labelOfNetBp: 4500 });
    if (!fixed.ok) throw new Error();
    expect(sign(fixed.state, 'producer', '2026-11-08')).toMatchObject({ ok: false, error: 'not_sent' });
    const s0 = send(fixed.state); if (!s0.ok) throw new Error();
    let st = s0.state;
    for (const [i, role] of (['producer', 'label', 'artist'] as const).entries()) {
      const r = sign(st, role, '2026-11-08'); if (!r.ok) throw new Error(r.message);
      expect(r.tookEffect).toBe(false); st = r.state; expect(signedCount(st)).toBe(i + 1);
    }
    expect(sign(st, 'producer', '2026-11-09')).toMatchObject({ ok: false, error: 'already_signed' });
    const last = sign(st, 'feature', '2026-11-09');
    expect(last).toMatchObject({ ok: true, tookEffect: true, state: { status: 'in_effect' } });
  });
});

import { producerMarketNote } from '../src/splitVersions';
describe('producer market note', () => {
  it('matches the 4a copy for 3 points and flags out-of-range values', () => {
    expect(producerMarketNote(300, 'Marco Dela')).toBe('Producer points are usually 2 to 4 on an indie single. Marco’s 3 is in range. Points are taken before the net profit split, so they reduce both shares.');
    expect(producerMarketNote(600, 'Marco Dela')).toContain('Marco’s 6 is above that range.');
    expect(producerMarketNote(150, 'Marco Dela')).toContain('Marco’s 1.5 is below that range.');
  });
});

describe('a split without every role', () => {
  it('takes effect when the parties it has have signed', () => {
    const v = { status: 'sent' as const, terms: { producerBp: 0, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 0 }, signed: {}, roles: ['label', 'artist'] as ('label' | 'artist')[] };
    const one = sign(v, 'label', '2026-11-12');
    expect(one).toMatchObject({ ok: true, tookEffect: false });
    const two = one.ok ? sign(one.state, 'artist', '2026-11-12') : one;
    expect(two).toMatchObject({ ok: true, tookEffect: true, state: { status: 'in_effect' } });
    expect(sign(v, 'producer', '2026-11-12')).toMatchObject({ ok: false, error: 'not_a_party' });
  });
});

import { checkLines, lineAmounts } from '../src/splitVersions';
describe('several people in a role', () => {
  const terms = { producerBp: 300, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 0 };
  it('splits each role by the people’s shares; the first person in a role gets the remainder', () => {
    const lines = [
      { role: 'label' as const, party: 'n', shareBp: 10000 },
      { role: 'artist' as const, party: 'a', shareBp: 3334 }, { role: 'artist' as const, party: 'b', shareBp: 3333 }, { role: 'artist' as const, party: 'c', shareBp: 3333 },
      { role: 'producer' as const, party: 'p', shareBp: 5000 }, { role: 'producer' as const, party: 'q', shareBp: 5000 },
    ];
    expect(checkLines(lines)).toBeNull();
    const amounts = lineAmounts(terms, lines);
    expect(amounts).toEqual([4850, 1618, 1616, 1616, 150, 150]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10000);
  });
  it('refuses shares that don’t total 100%, two labels, or no artist', () => {
    expect(checkLines([{ role: 'label', party: 'n', shareBp: 10000 }, { role: 'artist', party: 'a', shareBp: 6000 }, { role: 'artist', party: 'b', shareBp: 3000 }])).toBe('The artists’ shares must total 100%.');
    expect(checkLines([{ role: 'label', party: 'n', shareBp: 10000 }, { role: 'label', party: 'm', shareBp: 10000 }, { role: 'artist', party: 'a', shareBp: 10000 }])).toBe('A split has exactly one label.');
    expect(checkLines([{ role: 'label', party: 'n', shareBp: 10000 }])).toBe('A split needs at least one artist.');
  });
});
