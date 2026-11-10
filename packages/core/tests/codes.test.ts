import { describe, expect, it } from 'vitest';
import { formatIsrc, gs1Capacity, gtinCheckDigit, isGs1Prefix, isIsrc, isIsrcPrefix, isUpc, isrcFor, normalizeIsrc, normalizeIsrcPrefix, normalizeUpc, upcFor } from '../src/codes';

describe('ISRC', () => {
  it('reads codes with or without hyphens, and writes them with', () => {
    expect(normalizeIsrc('us-nl1-26-00014')).toBe('USNL12600014');
    expect(isIsrc('USNL12600014')).toBe(true);
    expect(isIsrc('USNL1260001')).toBe(false);
    expect(isIsrc('US-NL1-26-00014')).toBe(false); // normalize first
    expect(formatIsrc('USNL12600014')).toBe('US-NL1-26-00014');
  });
  it('numbers recordings from an owner’s prefix, by year', () => {
    expect(isIsrcPrefix(normalizeIsrcPrefix('US-NL1'))).toBe(true);
    expect(isIsrcPrefix('US-NL1')).toBe(false);
    expect(isrcFor('USNL1', 2026, 15)).toBe('USNL12600015');
    expect(isrcFor('QZABC', 2031, 99999)).toBe('QZABC3199999');
    expect(() => isrcFor('USNL1', 2026, 100000)).toThrow(/00001 to 99999/);
  });
});

describe('UPC', () => {
  it('checks the check digit (UPC-A and EAN-13)', () => {
    expect(gtinCheckDigit('03600029145')).toBe(2); // the textbook UPC 036000291452
    expect(isUpc('036000291452')).toBe(true);
    expect(isUpc('036000291453')).toBe(false);
    expect(isUpc('4006381333931')).toBe(true); // an EAN-13
    expect(isUpc(normalizeUpc('0 36000 29145 2'))).toBe(true);
  });
  it('numbers releases from a GS1 company prefix, with the check digit', () => {
    expect(isGs1Prefix('0360002')).toBe(true);
    expect(isGs1Prefix('12345')).toBe(false);
    expect(upcFor('036000', 29145)).toBe('036000291452');
    expect(isUpc(upcFor('0360002', 1))).toBe(true);
    expect(upcFor('0360002', 1)).toBe('036000200010'); // the same number the database assigns
    expect(gs1Capacity('0360002')).toBe(9999);
    expect(() => upcFor('0360002', 10000)).toThrow(/no numbers left/);
  });
});
