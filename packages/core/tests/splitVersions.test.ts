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
