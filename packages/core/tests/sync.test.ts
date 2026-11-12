import { describe, expect, it } from 'vitest';
import { licenseSections, oneStop, quoteState, splitFee } from '../src/sync';

describe('sync', () => {
  it('splits the fee between master and song, the song getting exactly the rest', () => {
    expect(splitFee(1_000_001, 5000)).toEqual({ master: 500_001, song: 500_000 });
    expect(splitFee(250_000, 6000)).toEqual({ master: 150_000, song: 100_000 });
  });
  it('a license exists only once its signature card is approved', () => {
    expect(quoteState({ status: 'accepted', decision: null, paid: false })).toBe('awaiting_signature');
    expect(quoteState({ status: 'accepted', decision: 'rejected', paid: false })).toBe('awaiting_signature');
    expect(quoteState({ status: 'accepted', decision: 'approved', paid: false })).toBe('licensed');
    expect(quoteState({ status: 'accepted', decision: 'approved', paid: true })).toBe('paid');
    expect(quoteState({ status: 'sent', decision: null, paid: false })).toBe('sent');
  });
  it('says what stops a one-stop clearance', () => {
    expect(oneStop({ hasSong: true, writersConfirmed: true, publishingControlled: true }).ok).toBe(true);
    expect(oneStop({ hasSong: true, writersConfirmed: false, publishingControlled: true }).note).toBe('The songwriter shares aren’t all confirmed yet.');
  });
  it('fills the template’s clauses from the quote', () => {
    const s = licenseSections({ licensor: 'Northline Records', client: 'Fable Pictures', recording: 'Glasshouse', artist: 'Kesi Vale', isrc: 'USNL12600014', song: 'Glasshouse',
      media: 'film', use: 'Closing credits, 45 seconds', territory: 'Worldwide', term: 'In perpetuity', fee: 1_200_000, masterBp: 5000, date: 'Nov 12, 2026',
      clauses: [{ title: 'Use', text: 'x' }, { title: 'Fee', text: 'x' }, { title: 'Territory and term', text: 'x' }, { title: 'Credit', text: 'Credit as listed.' }] });
    expect(s.map((x) => x.text)).toEqual([
      'Northline Records (licensor) grants Fable Pictures (licensee) the right below, dated Nov 12, 2026.',
      '“Glasshouse” by Kesi Vale, ISRC USNL12600014, embodying the song “Glasshouse”.',
      'Film: Closing credits, 45 seconds. Any other use needs a new license.',
      '$12,000.00, one fee for the master ($6,000.00, 50%) and the song ($6,000.00, 50%), paid to Northline Records and shared by the splits in place.',
      'Worldwide, in perpetuity.',
      'Credit as listed.',
    ]);
  });
});
