import { describe, expect, it } from 'vitest';
import { allocateCents, guessMapping, parseDelimited, parseMicros, parsePeriod, readStatement } from '../src/imports';

describe('reading statement files', () => {
  it('reads CSV and tab-separated files, quotes and all', () => {
    expect(parseDelimited('a,b\n"x, y",2\r\n\n"say ""hi""",3\n')).toEqual([['a', 'b'], ['x, y', '2'], ['say "hi"', '3']]);
    expect(parseDelimited('a\tb\nx\t2')).toEqual([['a', 'b'], ['x', '2']]);
  });
  it('guesses the columns of common exports by name', () => {
    expect(guessMapping(['Reporting Date', 'Sale Month', 'Store', 'Artist', 'Title', 'ISRC', 'UPC', 'Quantity', 'Country of Sale', 'Earnings (USD)'])).toEqual({
      isrc: 'ISRC', amount: 'Earnings (USD)', period: 'Sale Month', units: 'Quantity', territory: 'Country of Sale', store: 'Store', artist: 'Artist', title: 'Title',
    });
    expect(guessMapping(['Sales Period', 'Store Name', 'Country Of Sale', 'Artist', 'Release Title', 'Song Title', 'ISRC', '# Units Sold', 'Total Earned'])).toMatchObject({
      title: 'Song Title', amount: 'Total Earned', period: 'Sales Period', units: '# Units Sold', store: 'Store Name',
    });
  });
  it('reads amounts exactly, never as floats', () => {
    expect(parseMicros('0.00412345')).toBe(4123);
    expect(parseMicros('$1,234.50')).toBe(1_234_500_000);
    expect(parseMicros('(3.10)')).toBe(-3_100_000);
    expect(parseMicros('1.234,56')).toBe(1_234_560_000);
    expect(parseMicros('1.5e-4')).toBe(150);
    expect(parseMicros('abc')).toBeNull();
    expect(parseMicros('')).toBeNull();
  });
  it('reads months in the usual shapes', () => {
    expect(['2026-10', '2026-10-15', '10/2026', '10/15/2026', 'Oct 2026', 'October 2026', '202610', '2026/10'].map(parsePeriod)).toEqual(Array(8).fill('2026-10-01'));
    expect(parsePeriod('13/2026')).toBeNull();
  });
  it('shares a month’s cents out so the lines add up to the total exactly', () => {
    // Three lines of 0.333333 dollars: 99.9999 cents in all, which rounds to $1.00.
    expect(allocateCents([333_333, 333_333, 333_334])).toEqual({ cents: [33, 33, 34], totalCents: 100 });
    const many = Array(1000).fill(4123); // $0.004123 each: $4.123 in all
    const out = allocateCents(many);
    expect(out.totalCents).toBe(412);
    expect(out.cents.reduce((a, b) => a + b, 0)).toBe(412);
    expect(allocateCents([1_500_000, -400_000])).toEqual({ cents: [150, -40], totalCents: 110 });
  });
});

describe('a whole file', () => {
  const file = [
    'Sale Month,Store,Artist,Title,ISRC,Quantity,Country of Sale,Earnings (USD)',
    '2026-10,Spotify,Kesi Vale,Glasshouse,US-NL1-26-00014,1000,US,3.912345',
    '2026-10,Apple Music,Kesi Vale,Glasshouse,USNL12600014,200,GB,1.50',
    '2026-10,Spotify,Someone,Unknown Song,QZABC2600001,10,DE,0.04',
    '2026-11,Spotify,Kesi Vale,Glasshouse,USNL12600014,900,United States,3.10',
    '2026-11,Spotify,Kesi Vale,,USNL12600014,1,US,0.01',
    'October 2026,Spotify,Kesi Vale,Glasshouse,USNL12600014,1,US,n/a',
  ].join('\n');
  const r = readStatement(file, guessMapping(parseDelimited(file)[0]), new Set(['USNL12600014']));
  it('makes one statement per month, matches catalog ISRCs, and lists what it left out', () => {
    expect(r.months.map((m) => [m.period, m.lines.length, m.totalCents, m.matched, m.unmatched, m.unmatchedCents])).toEqual([
      ['2026-10-01', 3, 545, 2, 1, 4], ['2026-11-01', 1, 310, 1, 0, 0],
    ]);
    expect(r.months[0].lines[0]).toMatchObject({ isrc: 'USNL12600014', store: 'Spotify', territory: 'US', units: 1000, matched: true });
    expect(r.months[1].lines[0].territory).toBeNull(); // "United States" isn't a country code
    expect(r.problems).toEqual([{ row: 6, problem: 'No title' }, { row: 7, problem: '“n/a” isn’t an amount' }]);
  });
  it('won’t read a file until the title, amount and month are mapped', () => {
    expect(readStatement(file, { title: 'Title' }, new Set()).missing).toEqual(['amount', 'period']);
  });
});
