import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, long, parseIso, short } from '@/lib/dates';
import { releases } from '@/data/fixtures';

describe('dates', () => {
  it('shifts across month and year ends without time zone drift', () => {
    expect(addDays('2027-03-06', 14)).toBe('2027-03-20');
    expect(addDays('2026-12-25', 15)).toBe('2027-01-09');
    expect(daysBetween('2027-03-06', '2027-03-20')).toBe(14);
    expect(daysBetween('2027-03-20', '2027-03-06')).toBe(-14);
  });
  it('formats like the mockups, with the real weekday', () => {
    expect(short('2027-01-09')).toBe('Jan 9');
    // The release moved to Friday, March 5, 2027: the mockups' March 6 is a Saturday.
    expect(long('2027-03-05')).toBe('Fri, Mar 5, 2027');
    expect(long('2027-03-06')).toBe('Sat, Mar 6, 2027');
    expect(long('2027-03-05')).toBe('Fri, Mar 5, 2027');
  });
});


describe('Glasshouse release dates', () => {
  const r = releases.rel_glasshouse;
  it('the release is on a Friday', () => {
    expect(r.date).toBe('2027-03-05');
    expect(parseIso(r.date).getUTCDay()).toBe(5);
  });
  it('every "weeks out" phase lands on a Friday, whole weeks before release', () => {
    for (const p of r.phases.filter((x) => /weeks out|Release week/.test(x.name))) {
      expect(parseIso(p.iso).getUTCDay(), p.name).toBe(5);
      expect(daysBetween(p.iso, r.date) % 7, p.name).toBe(0);
    }
  });
});
