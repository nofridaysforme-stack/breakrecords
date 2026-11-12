import { describe, expect, it } from 'vitest';
import { gate, runChecks, RULES, type FilingFacts, type GrantFacts, type OfferFacts, type PayeeFact, type PayoutFacts, type ReleasePlanFacts, type SignatureFacts } from '../src/checks';
import { decide, bulkApprove } from '../src/approvals';

// The demo label as it is today (it fails several rules), and the same label with every fact
// fixed. Each rule must fail the first and pass the second.
const V4 = { node: 'gh-rec', version: 4, terms: { producerBp: 300, labelOfNetBp: 5000, artistOfNetBp: 5000, featureOfArtistBp: 1000 } };
const payee = (p: Partial<PayeeFact> & { name: string; amountCents: number }): PayeeFact => ({
  status: 'included', covered: true, pendingAgreements: [], taxForm: 'W-9', taxExpiresOn: null, withheldCents: 0,
  treaty: false, bankOnFile: true, lastFailed: false, split: null, statementNetCents: null, ...p,
});

const demoPayout: PayoutFacts = {
  kind: 'payout', periodEnd: '2026-10-31', paysOn: '2026-11-10', minimumCents: 2500,
  payees: [
    payee({ name: 'Marco Dela', amountCents: 28500, covered: false, pendingAgreements: ['producer agreement'], statementNetCents: 28500 }),
    payee({ name: 'Ari Monroe', amountCents: 26075, split: { ...V4, role: 'feature' }, statementNetCents: 46075 }),
    payee({ name: 'Theo Lind', amountCents: 21420, taxForm: 'W-8BEN', taxExpiresOn: '2028-12-31', covered: false }),
    payee({ name: 'Rue Sato', amountCents: 21420, taxExpiresOn: '2026-12-01' }), // a W-9 doesn't expire
    payee({ name: 'Jules Arden', amountCents: 1840, status: 'carried', taxForm: null, bankOnFile: false }),
  ],
  income: [
    { recording: 'Glasshouse', isrc: 'USNL12600014', releasedOn: '2027-03-05', amountCents: 1000000 },
    { recording: 'Night Bus', isrc: 'USNL12500031', releasedOn: '2025-06-13', amountCents: 208088 },
    { recording: 'Low Light', isrc: null, releasedOn: null, amountCents: 15000 },
  ],
  flags: [{ recording: 'Night Bus', note: 'unusual stream spike' }],
};
const cleanPayout: PayoutFacts = {
  ...demoPayout,
  payees: [
    // Covered by a signed split, so a different agreement still being signed doesn't matter.
    payee({ name: 'Marco Dela', amountCents: 28500, split: { ...V4, role: 'producer' }, pendingAgreements: ['producer agreement, Glasshouse'], statementNetCents: 28500 }),
    payee({ name: 'Ari Monroe', amountCents: 26075, split: { ...V4, role: 'feature' }, statementNetCents: 26075 }),
    payee({ name: 'Theo Lind', amountCents: 21420, taxForm: 'W-8BEN', taxExpiresOn: '2028-12-31', withheldCents: 6426 }),
    payee({ name: 'Jules Arden', amountCents: 1840, status: 'carried' }),
  ],
  income: [{ recording: 'Night Bus', isrc: 'USNL12500031', releasedOn: '2025-06-13', amountCents: 208088 }],
  flags: [],
};

const demoFiling: FilingFacts = {
  kind: 'filing', org: 'MLC',
  works: [
    { title: 'Glasshouse', isrcs: ['USNL12600014'], writers: [
      { name: 'Kesi Vale', shareBp: 7500, pro: 'ascap', ipi: '00712345678', signed: true },
      { name: 'Marco Dela', shareBp: 2500, pro: null, ipi: null, signed: false },
    ] },
    { title: 'Low Light', isrcs: [], writers: [{ name: 'Marco Dela', shareBp: 9000, pro: null, ipi: null, signed: true }] },
  ],
};
const cleanFiling: FilingFacts = {
  kind: 'filing', org: 'MLC',
  works: [{ title: 'Glasshouse', isrcs: ['USNL12600014'], writers: [
    { name: 'Kesi Vale', shareBp: 7500, pro: 'ascap', ipi: '00712345678', signed: true },
    { name: 'Marco Dela', shareBp: 2500, pro: 'bmi', ipi: '00512345678', signed: true },
  ] }],
};

const grant = (p: Partial<GrantFacts> = {}): GrantFacts => ({
  kind: 'grant', deadline: '2026-11-15', verifiedOn: '2026-11-10', fields: [{ label: 'Project summary', value: 'Glasshouse release', limit: 1500 }], ...p,
});

const byId = (rs: ReturnType<typeof runChecks>) => Object.fromEntries(rs.map((r) => [r.id, r]));

describe('approval checks', () => {
  it('every rule has an id, a title and at least one approval type', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) expect(r.id).toMatch(/^[A-Z]{3}-\d{2}$/);
  });

  it('the October payout fails today for named reasons, and passes once the facts are fixed', () => {
    const r = byId(runChecks('money', demoPayout, '2026-11-11'));
    expect(r['ROY-01'].status).toBe('fail');
    expect(r['ROY-01'].message).toContain('Marco Dela’s producer agreement isn’t signed yet');
    expect(r['ROY-01'].message).toContain('No signed agreement or split names Theo Lind');
    expect(r['ROY-02'].status).toBe('pass'); // Jules has no form but is carried, not paid; Rue's W-9 never expires
    expect(r['ROY-03'].message).toMatch(/Theo Lind is on a W-8 with \$0\.00 withheld/);
    expect(r['ROY-04'].message).toContain('Glasshouse earns $10,000.00 before its Mar 5, 2027 release');
    expect(r['ROY-05'].message).toContain('Low Light earns $150.00 with no ISRC');
    expect(r['ROY-06'].message).toBe('Ari Monroe is paid $260.75, but their statement says $460.75.');
    expect(r['ROY-07'].message).toContain('Night Bus has an open audit flag');
    expect(r['ROY-07'].fix?.href).toBe('/activity');
    expect(r['ROY-09'].message).toContain('Jules Arden ($18.40) carries forward');
    expect(gate(Object.values(r)).blocks.map((b) => b.id)).toEqual(['ROY-01', 'ROY-03', 'ROY-04', 'ROY-05', 'ROY-06', 'ROY-07']);

    const ok = runChecks('money', cleanPayout, '2026-11-11');
    expect(ok.filter((x) => x.status !== 'pass')).toEqual([]);
  });

  it('tax forms: missing or expired W-8 blocks; a W-9 never expires', () => {
    const f = { ...cleanPayout, payees: [payee({ name: 'Dallas', amountCents: 5000, taxForm: null }), payee({ name: 'Ave', amountCents: 5000, taxForm: 'W-8BEN', taxExpiresOn: '2026-11-01', treaty: true })] };
    expect(byId(runChecks('money', f, '2026-11-11'))['ROY-02'].message).toBe('Dallas has no tax form on file. Ave’s W-8BEN expires before payday.');
  });

  it('bank details: missing, or a failed payout not fixed', () => {
    const f = { ...cleanPayout, payees: [payee({ name: 'Theo Lind', amountCents: 5000, lastFailed: true }), payee({ name: 'Jo', amountCents: 5000, bankOnFile: false })] };
    expect(byId(runChecks('money', f, '2026-11-11'))['ROY-08'].message).toBe('Jo has no bank details. The last payout to Theo Lind failed and hasn’t been fixed.');
  });

  it('a payee under the minimum is a warning, not a block', () => {
    const f = { ...cleanPayout, payees: [payee({ name: 'Pia', amountCents: 900 })] };
    const g = gate(runChecks('money', f, '2026-11-11'));
    expect(g.warns.map((w) => w.id)).toEqual(['ROY-09']);
    expect(g.blocks).toEqual([]);
  });

  it('the MLC filing fails today; publishing rules that can’t be checked yet never block', () => {
    const r = byId(runChecks('filing', demoFiling, '2026-11-11'));
    expect(r['PUB-01'].message).toBe('Glasshouse’s split sheet has 1 of 2 signatures.');
    expect(r['PUB-02'].status).toBe('unknown');
    expect(r['PUB-03'].message).toBe('Marco Dela has no PRO or IPI recorded.');
    expect(r['PUB-04'].message).toBe('Low Light’s writer shares total 90%.');
    expect(r['PUB-05'].message).toBe('Low Light has no recording with an ISRC.');
    expect(r['PUB-06'].status).toBe('unknown');
    expect(gate(Object.values(r)).blocks.map((b) => b.id)).toEqual(['PUB-01', 'PUB-03', 'PUB-04', 'PUB-05']);
    expect(gate(runChecks('filing', cleanFiling, '2026-11-11')).blocks).toEqual([]);
  });

  it('the grant uses the real date: a deadline checked over 7 days ago blocks, a passed one too', () => {
    const stale = byId(runChecks('plan', grant({ verifiedOn: '2026-10-28' }), '2026-11-11'));
    expect(stale['FUN-03'].message).toBe('The deadline (Nov 15, 4 days from today) was last checked on Oct 28, 14 days ago. Re-check the program page first.');
    expect(stale['FUN-01'].status).toBe('unknown');
    expect(byId(runChecks('plan', grant(), '2026-11-11'))['FUN-03'].status).toBe('pass');
    expect(byId(runChecks('plan', grant(), '2026-11-16'))['FUN-03'].message).toBe('The deadline, Nov 15, has passed.');
    expect(byId(runChecks('plan', grant({ fields: [{ label: 'Budget', value: '', limit: 100 }] }), '2026-11-11'))['FUN-02'].message).toBe('Budget is empty.');
  });

  it('who publishes the songs decides whether this workspace may file as publisher (PUB-02)', () => {
    const withDeals = (mode: FilingFacts['publishingMode'], deal: 'administration' | 'publishing' | null, override?: FilingFacts['publishingMode']): FilingFacts => ({
      ...cleanFiling, publishingMode: mode,
      works: cleanFiling.works.map((w) => ({ ...w, writers: w.writers.map((x, i) => ({ ...x, deal, ...(i === 1 && override ? { mode: override } : {}) })) })),
    });
    const r = (f: FilingFacts) => byId(runChecks('filing', f, '2026-11-11'))['PUB-02'];
    expect(r(withDeals('self', null)).status).toBe('pass');
    expect(r(withDeals('we_administer', 'administration'))).toMatchObject({ status: 'pass', message: 'Every writer has a signed, current publishing or admin agreement with you.' });
    expect(r(withDeals('we_administer', null))).toMatchObject({ status: 'fail', message: 'No signed, current publishing or admin agreement with Kesi Vale and Marco Dela.', fix: { href: '/contracts' } });
    expect(r(withDeals('we_publish', 'administration')).message).toBe('No signed, current publishing agreement with Kesi Vale and Marco Dela.'); // admin isn't ownership
    expect(r(withDeals('we_administer', 'administration', 'writers_own')).message).toMatch(/^Marco Dela handles their own publishing/);
    expect(r(withDeals('writers_own', null)).status).toBe('fail');
    expect(r(withDeals(null, null)).status).toBe('unknown');
  });

  it('signatures: playbook differences need a decision, the counterparty must be known, terms stay in range', () => {
    const producer: SignatureFacts = {
      kind: 'signature', playbookDifferences: ['§4.2', '§5.2'],
      counterparties: [{ name: 'Marco Dela', legalName: 'Marco Delacroix', email: 'marco@example.com', known: true }],
      points: 3, pointsRange: [2, 4], royaltyBase: { template: 'first_dollar', draft: 'first_dollar' },
    };
    const r = byId(runChecks('signature', producer, '2026-11-12'));
    expect(r['LEG-01']).toMatchObject({ status: 'fail', severity: 'warn', message: '§4.2 and §5.2 differ from your playbook. Choose the playbook wording or keep the draft, and say why.' });
    expect([r['LEG-02'].status, r['LEG-03'].status, r['LEG-04'].status, r['LEG-05'].status, r['LEG-06'].status]).toEqual(['pass', 'pass', 'pass', 'unknown', 'pass']);
    expect(gate(Object.values(r))).toMatchObject({ blocks: [], warns: [expect.objectContaining({ id: 'LEG-01' })] });
    const off = byId(runChecks('signature', { ...producer, playbookDifferences: [], points: 5, royaltyBase: { template: 'first_dollar', draft: 'after_recoupment' },
      counterparties: [{ name: 'Marco Dela', legalName: null, email: null, known: false }] }, '2026-11-12'));
    expect(off['LEG-02'].message).toBe('The template pays from the first dollar, but the draft pays after recoupment.');
    expect(off['LEG-03']).toMatchObject({ status: 'fail', message: 'Marco Dela has no legal name. Marco Dela has no email. Marco Dela isn’t on your roster or invited.' });
    expect(off['LEG-04'].message).toBe('5 points is outside your playbook’s 2 to 4.');
  });

  it('release date plans: the pitch lead blocks under 7 days and warns under 21; budget and gates hold', () => {
    const plan = (lead: number | null, spent = 186000): ReleasePlanFacts => ({ kind: 'release_plan', release: 'Glasshouse', newDate: '2027-03-19', pitchLeadDays: lead, gatesMoved: true, budgetCents: 300000, spentCents: spent });
    expect(byId(runChecks('plan', plan(28), '2026-11-12'))['REL-01'].status).toBe('pass');
    expect(byId(runChecks('plan', plan(14), '2026-11-12'))['REL-01']).toMatchObject({ status: 'fail', severity: 'warn' });
    expect(byId(runChecks('plan', plan(5), '2026-11-12'))['REL-01']).toMatchObject({ status: 'fail', severity: 'block' });
    expect(byId(runChecks('plan', plan(28, 310000), '2026-11-12'))['REL-02'].message).toBe('Spending is $100.00 over the $3,000.00 budget. Raising it is its own plan.');
  });

  it('offers: projections must match real income; consent from artists can’t be checked yet', () => {
    const offer = (assumed: number, actual: number | null): OfferFacts => ({ kind: 'offer', offer: 'advance', assumedAnnualCents: assumed, actualAnnualCents: actual, months: 2, sharedWithArtists: true });
    const r = byId(runChecks('money', offer(1320000, 15836112), '2026-11-12'));
    expect(r['FUN-04'].message).toBe('The projection assumes $13,200.00 a year, but your statements show about $158,361.12 a year. Update the assumption and re-compare before accepting.');
    expect(r['FUN-05'].status).toBe('unknown');
    expect(byId(runChecks('money', offer(15000000, 15836112), '2026-11-12'))['FUN-04'].status).toBe('pass');
  });

  it('a card with no facts has no checks', () => {
    expect(runChecks('plan', null, '2026-11-11')).toEqual([]);
  });
});

describe('approving with checks', () => {
  const items = { a: { id: 'a', type: 'money' as const, risk: 'low' as const }, b: { id: 'b', type: 'money' as const, risk: 'low' as const } };
  const ctx = (checks: Record<string, ReturnType<typeof runChecks>>) => ({
    find: (id: string) => items[id as 'a'], now: 1, by: 'u', newAuditId: () => 'AUD-1', checks: (id: string) => checks[id] ?? [],
  });
  const empty = { decisions: {}, proposals: [] };

  it('a failed Block rule refuses the approval, with its reason', () => {
    const out = decide(empty, 'a', { action: 'approve' }, ctx({ a: runChecks('money', demoPayout, '2026-11-11') }));
    expect(out).toMatchObject({ ok: false, error: 'blocked' });
    expect(!out.ok && out.message).toMatch(/^Can’t approve yet\. ROY-01: Marco Dela’s producer agreement/);
  });

  it('a failed Warn rule needs a reason, which is kept with the decision', () => {
    const warn = runChecks('money', { ...cleanPayout, payees: [payee({ name: 'Pia', amountCents: 900 })] }, '2026-11-11');
    expect(decide(empty, 'a', { action: 'approve' }, ctx({ a: warn }))).toMatchObject({ ok: false, error: 'reason_required' });
    const ok = decide(empty, 'a', { action: 'approve', acceptWarnings: 'Pia asked to be paid now' }, ctx({ a: warn }));
    expect(ok.ok && ok.state.decisions.a).toMatchObject({ status: 'approved', reason: 'Pia asked to be paid now' });
  });

  it('bulk approve leaves out nothing: a failing card stops the whole batch', () => {
    const out = bulkApprove(empty, ['a', 'b'], ctx({ b: runChecks('money', demoPayout, '2026-11-11') }));
    expect(out).toMatchObject({ ok: false, error: 'blocked', ids: ['b'] });
    expect(bulkApprove(empty, ['a'], ctx({})).ok).toBe(true);
  });
});
