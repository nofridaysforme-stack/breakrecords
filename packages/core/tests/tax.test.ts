import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/checks';
import { taxTreatment, withholding, yearEnd, yearEndCsv, formExpiresOn } from '../src/tax';

const w9 = { form: 'W-9', expiresOn: null, treaty: null };
const w8 = { form: 'W-8BEN', expiresOn: '2026-12-31', treaty: null };
const gb = { ...w8, treaty: { country: 'GB', article: '12', rateBp: 0 } };

describe('withholding', () => {
  it('follows the form', () => {
    expect(taxTreatment(w9, '2026-11-10', 'hold')).toMatchObject({ kind: 'none', rateBp: 0 });
    expect(taxTreatment({ ...w9, backupWithholding: true }, '2026-11-10', 'hold')).toMatchObject({ kind: 'backup', rateBp: 2400, label: '24% backup withholding (IRS notice)' });
    expect(taxTreatment(w8, '2026-11-10', 'hold')).toMatchObject({ kind: 'nra', rateBp: 3000 });
    expect(taxTreatment(gb, '2026-11-10', 'hold')).toMatchObject({ kind: 'treaty', rateBp: 0, label: '0% under the GB treaty, Article 12' });
  });
  it('a missing or expired form holds the payout, or withholds 24% if the workspace says so', () => {
    expect(taxTreatment({ form: null, expiresOn: null, treaty: null }, '2026-11-10', 'hold')).toEqual({ kind: 'hold', rateBp: null, label: 'No tax form: payout held' });
    expect(taxTreatment(w8, '2027-01-10', 'withhold')).toMatchObject({ kind: 'backup', rateBp: 2400, label: 'W-8BEN expired: 24% backup withholding' });
    // A W-9 never expires, whatever date is stored against it.
    expect(taxTreatment({ ...w9, expiresOn: '2020-01-01' }, '2026-11-10', 'hold').kind).toBe('none');
  });
  it('rounds to the cent and withholds nothing from a held payment', () => {
    expect(withholding(28500, taxTreatment(w8, '2026-11-10', 'hold'))).toBe(8550);
    expect(withholding(1001, { kind: 'backup', rateBp: 2400, label: '' })).toBe(240);
    expect(withholding(28500, { kind: 'hold', rateBp: null, label: '' })).toBe(0);
  });
  it('a W-8 lasts to the end of the third year after signing; a W-9 has no expiry', () => {
    expect(formExpiresOn('W-8BEN', '2026-11-12')).toBe('2029-12-31');
    expect(formExpiresOn('W-9', '2026-11-12')).toBeNull();
  });
});

describe('year-end forms', () => {
  const line = (payeeId: string, name: string, form: string | null, gross: number, withheld = 0, extra: object = {}) =>
    ({ payeeId, name, form, country: form === 'W-9' ? 'US' : null, treatyRateBp: null, tinLast4: form === 'W-9' ? '4321' : null, grossCents: gross, withheldCents: withheld, ...extra });
  const y = yearEnd([
    line('marco', 'Marco Dela', 'W-9', 30000), line('marco', 'Marco Dela', 'W-9', 28500),
    line('pia', 'Pia Novak', 'W-9', 999),
    line('theo', 'Theo Lind', 'W-8BEN', 40000, 0, { country: 'GB', treatyRateBp: 0 }),
    line('jules', 'Jules Arden', null, 5000),
  ]);
  it('adds up each payee and picks their form', () => {
    expect(y.forms1099).toEqual([
      { payeeId: 'marco', name: 'Marco Dela', tinLast4: '4321', royalties: 58500, withheld: 0, reportable: true, note: 'Ready' },
      { payeeId: 'pia', name: 'Pia Novak', tinLast4: '4321', royalties: 999, withheld: 0, reportable: false, note: 'Under $10.00: no form needed' },
    ]);
    expect(y.forms1042s).toEqual([{ payeeId: 'theo', name: 'Theo Lind', country: 'GB', rateBp: 0, gross: 40000, withheld: 0 }]);
    expect(y.missing).toEqual([{ payeeId: 'jules', name: 'Jules Arden', paid: 5000 }]);
  });
  it('writes one CSV row per form to file, never a full taxpayer number', () => {
    const csv = yearEndCsv(2026, 'Northline Records', y).trim().split('\n');
    expect(csv).toEqual([
      'Form,Tax year,Payer,Recipient,Taxpayer number,Country,Box,Royalties,Federal tax withheld,Rate',
      '1099-MISC,2026,Northline Records,Marco Dela,***-**-4321 (fill in full),US,2 Royalties,585.00,0.00,0%',
      '1042-S,2026,Northline Records,Theo Lind,Not required,GB,Income code 12 Royalties,400.00,0.00,0%',
    ]);
  });
});

describe('ROY-02 and ROY-03 follow the workspace’s policy', () => {
  const payee = (name: string, taxForm: string | null, amountCents: number, withheldCents: number, extra: object = {}) => ({
    name, amountCents, status: 'included' as const, covered: true, pendingAgreements: [], taxForm, taxExpiresOn: null, withheldCents,
    treaty: false, bankOnFile: true, lastFailed: false, split: null, statementNetCents: null, ...extra,
  });
  const facts = (payees: ReturnType<typeof payee>[], missingFormPolicy?: 'hold' | 'withhold') =>
    ({ kind: 'payout' as const, periodEnd: '2026-10-31', paysOn: '2026-11-10', minimumCents: 2500, missingFormPolicy, payees, income: [], flags: [] });
  const r = (f: ReturnType<typeof facts>) => Object.fromEntries(runChecks('money', f, '2026-11-11').map((x) => [x.id, x]));

  it('a missing form blocks when held, passes with 24% withheld', () => {
    expect(r(facts([payee('Dallas', null, 10000, 0)]))['ROY-02']).toMatchObject({ status: 'fail', message: 'Dallas has no tax form on file.' });
    expect(r(facts([payee('Dallas', null, 10000, 2400)], 'withhold'))['ROY-02']).toMatchObject({ status: 'pass', message: 'Dallas has no tax form on file. 24% backup withholding is applied.' });
    expect(r(facts([payee('Dallas', null, 10000, 0)], 'withhold'))['ROY-02']).toMatchObject({ status: 'fail', message: 'Dallas has no tax form on file. Withhold 24% from Dallas, or hold them.' });
  });
  it('a treaty rate and an IRS notice are both checked', () => {
    expect(r(facts([payee('Theo', 'W-8BEN', 10000, 1000, { treaty: true, treatyRateBp: 1000 })]))['ROY-03'].status).toBe('pass');
    expect(r(facts([payee('Theo', 'W-8BEN', 10000, 3000)]))['ROY-03'].status).toBe('pass');
    expect(r(facts([payee('Rue', 'W-9', 10000, 0, { backupWithholding: true })]))['ROY-03']).toMatchObject({ status: 'fail', message: 'The IRS asked for backup withholding from Rue. Withhold 24%.' });
  });
});
