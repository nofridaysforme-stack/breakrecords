import { describe, expect, it } from 'vitest';
import { formatMoney, moneyToWords, toCents } from '../src/money';
import { formatPercent, pctToBp, percentToWords } from '../src/percent';

describe('toCents', () => {
  it('converts sample-data dollars to integer cents', () => {
    expect(toCents(2346.75)).toBe(234675);
    expect(toCents(214.2)).toBe(21420);
    expect(toCents(-2607.5)).toBe(-260750);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('formatMoney', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatMoney(124018)).toBe('$1,240.18');
    expect(formatMoney(1000000)).toBe('$10,000.00');
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('uses U+2212 for negatives, never a hyphen', () => {
    expect(formatMoney(-50000)).toBe('−$500.00');
    expect(formatMoney(-50000)).not.toContain('-');
  });
  it('shows the currency code only when not USD', () => {
    expect(formatMoney(120000, { currency: 'CAD' })).toBe('CAD $1,200.00');
    expect(formatMoney(120000)).toBe('$1,200.00');
  });
  it('can drop .00 on whole headline amounts', () => {
    expect(formatMoney(300000, { wholeIfRound: true })).toBe('$3,000');
    expect(formatMoney(186050, { wholeIfRound: true })).toBe('$1,860.50');
  });
  it('rejects non-integer cents', () => {
    expect(() => formatMoney(12.5)).toThrow();
  });
});

describe('moneyToWords', () => {
  it('reads the brief example in full words', () => {
    expect(moneyToWords(234675)).toBe('two thousand three hundred forty-six dollars and seventy-five cents');
  });
  it('says minus for negatives and handles singulars', () => {
    expect(moneyToWords(-50000)).toBe('minus five hundred dollars');
    expect(moneyToWords(101)).toBe('one dollar and one cent');
    expect(moneyToWords(0)).toBe('zero dollars');
    expect(moneyToWords(1000000)).toBe('ten thousand dollars');
  });
});

describe('percent', () => {
  it('formats and reads shares', () => {
    expect(pctToBp(43.65)).toBe(4365);
    expect(formatPercent(4365)).toBe('43.65%');
    expect(formatPercent(300)).toBe('3%');
    expect(formatPercent(300, { fixed: true })).toBe('3.00%');
    expect(formatPercent(3880)).toBe('38.8%');
    expect(percentToWords(4365)).toBe('forty-three point six five percent');
    expect(percentToWords(10000)).toBe('one hundred percent');
    expect(percentToWords(485)).toBe('four point eight five percent');
  });
});
