import { test, expect, type Page } from '@playwright/test';
import { ApprovalChecksResponse, ApprovalError, CodesResponse, DocumentsResponse, ApprovalState, ContractsResponse, OnboardingResponse, DepartmentError, DepartmentsResponse, ENDPOINTS, SettingsError, SettingsResponse, ThemeResponse, FundingResponse, OffersResponse, PayoutError, PayoutsResponse, ProfileClaimsResponse, Recording, RecoupmentResponse, RoyaltiesResponse, SplitError, SplitNodeResponse, StatementError } from '@breakrecords/contract';

// The API contract over HTTP. Any server behind the UI, mock or live, must pass this file.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));

for (const e of ENDPOINTS) {
  test(`GET ${e.path} matches the contract`, async ({ request }) => {
    const res = await request.get(e.path);
    expect(res.status()).toBe(200);
    const parsed = e.schema.safeParse(await res.json());
    expect(parsed.success ? 'ok' : parsed.error.issues.slice(0, 3)).toBe('ok');
  });
}

test.describe('approval writes', () => {
  const state = async (request: import('@playwright/test').APIRequestContext) => ApprovalState.parse(await (await request.get('/api/approvals/state')).json());

  test('approve, then undo', async ({ request }) => {
    expect((await state(request)).decisions).toEqual({});
    const res = await request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve' } });
    expect(res.status()).toBe(200);
    const s = ApprovalState.parse(await res.json());
    expect(s.decisions.apr_producer).toMatchObject({ status: 'approved', by: 'you' });
    expect(s.decisions.apr_producer.auditId).toMatch(/^AUD-/);
    expect((await state(request)).decisions.apr_producer.status).toBe('approved');
    const undone = await request.delete('/api/approvals/apr_producer/decision');
    expect(ApprovalState.parse(await undone.json()).decisions.apr_producer).toBeUndefined();
  });

  test('checks: the October payout, the MLC filing and the grant can’t be approved yet, with named reasons', async ({ request }) => {
    const c = ApprovalChecksResponse.parse(await (await request.get('/api/approvals/checks')).json());
    const failed = (id: string) => c.items[id].results.filter((r) => r.status === 'fail' && r.severity === 'block').map((r) => r.id);
    expect(c.items.apr_payout_oct.canApprove).toBe(false);
    expect(failed('apr_payout_oct')).toEqual(['ROY-01', 'ROY-03', 'ROY-04', 'ROY-05', 'ROY-06', 'ROY-07']);
    expect(c.items.apr_payout_oct.results.find((r) => r.id === 'ROY-04')?.message).toContain('Glasshouse earns $10,000.00 before its Mar 5, 2027 release');
    expect(c.items.apr_mlc.canApprove).toBe(false);
    expect(failed('apr_mlc')).toEqual(['PUB-01', 'PUB-03']);
    expect(c.items.apr_mlc.results.find((r) => r.id === 'PUB-02')?.status).toBe('unknown'); // can't check yet, never blocks
    expect(c.items.apr_grant.canApprove).toBe(false);
    expect(failed('apr_grant')).toEqual(['FUN-03']);
    expect(c.items.apr_producer).toMatchObject({ canApprove: true, needsReason: false });
    // The server refuses too, whatever the screen shows.
    const res = await request.post('/api/approvals/apr_payout_oct/decision', { data: { action: 'approve' } });
    expect(res.status()).toBe(409);
    expect(ApprovalError.parse(await res.json())).toMatchObject({ error: 'blocked', ids: ['apr_payout_oct'] });
    expect((await state(request)).decisions).toEqual({});
  });

  test('a rejection without a reason is refused', async ({ request }) => {
    const res = await request.post('/api/approvals/apr_producer/decision', { data: { action: 'reject', reason: ' ' } });
    expect(res.status()).toBe(400);
    expect(ApprovalError.parse(await res.json()).error).toBe('reason_required');
    const ok = await request.post('/api/approvals/apr_producer/decision', { data: { action: 'reject', reason: 'Clause 4.2' } });
    expect(ApprovalState.parse(await ok.json()).decisions.apr_producer).toMatchObject({ status: 'rejected', reason: 'Clause 4.2' });
  });

  test('bulk approve never includes a signature, and approves nothing if it would', async ({ request }) => {
    const res = await request.post('/api/approvals/decisions', { data: { action: 'approve', ids: ['apr_payout_oct', 'apr_producer'] } });
    expect(res.status()).toBe(409);
    expect(ApprovalError.parse(await res.json())).toMatchObject({ error: 'not_bulk_approvable', ids: ['apr_producer'] });
    expect((await state(request)).decisions).toEqual({});
    // Cards with failed checks are never bulk approved either.
    const stuck = await request.post('/api/approvals/decisions', { data: { action: 'approve', ids: ['apr_payout_oct', 'apr_mlc'] } });
    expect(ApprovalError.parse(await stuck.json())).toMatchObject({ error: 'blocked', ids: ['apr_payout_oct', 'apr_mlc'] });
    const plan = (id: string) => ({ id, type: 'plan', title: id, agent: 'Label Head', due: 'Jan 22', impact: 'x', risk: 'low', href: '/releases/rel_glasshouse' });
    for (const id of ['plan_a', 'plan_b']) await request.post('/api/approvals', { data: { proposal: plan(id) } });
    const ok = await request.post('/api/approvals/decisions', { data: { action: 'approve', ids: ['plan_a', 'plan_b'] } });
    expect(Object.keys(ApprovalState.parse(await ok.json()).decisions).sort()).toEqual(['plan_a', 'plan_b']);
  });

  test('unknown ids and malformed bodies are refused with the contract error shape', async ({ request }) => {
    const missing = await request.post('/api/approvals/nope/decision', { data: { action: 'approve' } });
    expect(missing.status()).toBe(404);
    expect(ApprovalError.parse(await missing.json()).error).toBe('not_found');
    const bad = await request.post('/api/approvals/apr_mlc/decision', { data: { action: 'sign' } });
    expect(bad.status()).toBe(400);
    expect(ApprovalError.parse(await bad.json()).error).toBe('invalid');
  });

  test('a proposal can be approved; re-proposing clears the decision', async ({ request }) => {
    const proposal = { id: 'plan_test', type: 'plan', title: 'Move Glasshouse to Mar 19', agent: 'Label Head', due: 'Jan 22', impact: '10 tasks move 14 days', risk: 'dueSoon', href: '/releases/rel_glasshouse' };
    expect((await request.post('/api/approvals', { data: { proposal } })).status()).toBe(200);
    await request.post('/api/approvals/plan_test/decision', { data: { action: 'approve' } });
    expect((await state(request)).decisions.plan_test.status).toBe('approved');
    const again = ApprovalState.parse(await (await request.post('/api/approvals', { data: { proposal } })).json());
    expect(again.decisions.plan_test).toBeUndefined();
    expect(again.proposals.filter((p) => p.id === 'plan_test')).toHaveLength(1);
  });

  test('decisions are private to each session', async ({ playwright, baseURL }) => {
    const a = await playwright.request.newContext({ baseURL });
    const b = await playwright.request.newContext({ baseURL });
    await a.get('/api/approvals/state');
    expect((await a.post('/api/approvals/apr_producer/decision', { data: { action: 'approve' } })).status()).toBe(200);
    expect((await state(b)).decisions).toEqual({});
    await a.dispose(); await b.dispose();
  });
});

test.describe('catalog writes', () => {
  test('a recording’s genre and AI use can be changed, and the change sticks for the session', async ({ request }) => {
    const res = await request.patch('/api/catalog/recordings/low-light', { data: { genre: 'Electronic', ai: 'Partial, vocals' } });
    expect(res.status()).toBe(200);
    expect(Recording.parse(await res.json())).toMatchObject({ id: 'low-light', genre: 'Electronic', ai: 'Partial, vocals' });
    const cat = await (await request.get('/api/catalog')).json();
    expect(cat.recordings.find((r: { id: string }) => r.id === 'low-light')).toMatchObject({ genre: 'Electronic' });
  });

  test('bad changes are refused', async ({ request }) => {
    expect((await request.patch('/api/catalog/recordings/low-light', { data: {} })).status()).toBe(400);
    expect((await request.patch('/api/catalog/recordings/low-light', { data: { ai: 'Mostly' } })).status()).toBe(400);
    expect((await request.patch('/api/catalog/recordings/nope', { data: { genre: 'Pop' } })).status()).toBe(404);
  });
});

test.describe('rights writes', () => {
  test('preparing profile claims turns every "not started" into "prepared", for the session', async ({ request }) => {
    const before = ProfileClaimsResponse.parse(await (await request.get('/api/rights/claims')).json());
    expect(before.rows.flatMap((r) => r.cells).some((c) => c.status === 'notStarted')).toBe(true);
    const res = await request.post('/api/rights/claims/prepare', { data: {} });
    expect(res.status()).toBe(200);
    const after = ProfileClaimsResponse.parse(await res.json());
    expect(after.rows.flatMap((r) => r.cells).some((c) => c.status === 'notStarted')).toBe(false);
    expect(after.rows[0].cells[0].status).toBe(before.rows[0].cells[0].status); // confirmed stays confirmed
    const again = ProfileClaimsResponse.parse(await (await request.get('/api/rights/claims')).json());
    expect(again).toEqual(after);
  });
  test('a malformed body is refused', async ({ request }) => {
    expect((await request.post('/api/rights/claims/prepare', { data: { everything: true } })).status()).toBe(400);
  });
});

test.describe('split writes', () => {
  const v5 = { producerBp: 300, labelOfNetBp: 4000, artistOfNetBp: 5500, featureOfArtistBp: 1000 };
  test('draft, send and sign follow the version rules', async ({ request }) => {
    const refused = await request.post('/api/splits/gh-rec/send', { data: {} });
    expect(refused.status()).toBe(409);
    expect(SplitError.parse(await refused.json()).error).toBe('not_100');

    const saved = SplitNodeResponse.parse(await (await request.put('/api/splits/gh-rec/draft', { data: { terms: { ...v5, labelOfNetBp: 4500 } } })).json());
    expect(saved.v5).toMatchObject({ status: 'draft', terms: { labelOfNetBp: 4500 } });
    const sent = SplitNodeResponse.parse(await (await request.post('/api/splits/gh-rec/send', { data: {} })).json());
    expect(sent.v5?.status).toBe('sent');
    expect((await request.put('/api/splits/gh-rec/draft', { data: { terms: v5 } })).status()).toBe(409);

    const one = SplitNodeResponse.parse(await (await request.post('/api/splits/gh-rec/sign', { data: { role: 'producer' } })).json());
    expect(Object.keys(one.v5!.signed)).toEqual(['Marco Dela']);
    expect((await request.post('/api/splits/gh-rec/sign', { data: { role: 'producer' } })).status()).toBe(409);
    for (const role of ['label', 'artist']) await request.post('/api/splits/gh-rec/sign', { data: { role } });
    const done = SplitNodeResponse.parse(await (await request.post('/api/splits/gh-rec/sign', { data: { role: 'feature' } })).json());
    expect(done.v5).toBeNull();
    expect(done.v4).toMatchObject({ version: 5, terms: { labelOfNetBp: 4500 } });
    expect(done.history[0].v).toBe('v4');
  });

  test('bad requests and inheriting nodes', async ({ request }) => {
    expect((await request.put('/api/splits/gh-rec/draft', { data: { terms: { ...v5, producerBp: 12.5 } } })).status()).toBe(400);
    expect((await request.post('/api/splits/gh-rec/sign', { data: { role: 'manager' } })).status()).toBe(400);
    expect((await request.get('/api/splits/gh-song')).status()).toBe(404);
  });
});

test.describe('statement writes', () => {
  test('matching the mistyped ISRC moves its lines to matched, for the session', async ({ request }) => {
    const before = RoyaltiesResponse.parse(await (await request.get('/api/money/royalties')).json());
    const typo = before.unmatched.suggestions[0];
    expect(typo).toMatchObject({ isrc: 'USNL1250031', count: 24, recordingId: 'night-bus' });
    const res = await request.post('/api/money/royalties/match', { data: { isrc: typo.isrc, recordingId: typo.recordingId } });
    expect(res.status()).toBe(200);
    const after = RoyaltiesResponse.parse(await res.json());
    expect(after.stats.matched).toBe(before.stats.matched + typo.count);
    expect(after.unmatched).toMatchObject({ count: before.unmatched.count - typo.count, value: before.unmatched.value - typo.value, suggestions: [] });
    expect(after.stats.income).toBe(before.stats.income); // matching never changes the money
    expect(RoyaltiesResponse.parse(await (await request.get('/api/money/royalties')).json())).toEqual(after);
    const again = await request.post('/api/money/royalties/match', { data: { isrc: typo.isrc, recordingId: typo.recordingId } });
    expect(again.status()).toBe(409);
    expect(StatementError.parse(await again.json()).error).toBe('nothing_to_match');
  });
  test('malformed bodies are refused', async ({ request }) => {
    expect((await request.post('/api/money/royalties/match', { data: { isrc: '' , recordingId: 'night-bus' } })).status()).toBe(400);
    expect((await request.post('/api/money/royalties/match', { data: { isrc: 'USNL1250031' } })).status()).toBe(400);
  });
  test('an unknown statement is a 404', async ({ request }) => {
    expect((await request.get('/api/statements/ST-1999-01-XX')).status()).toBe(404);
  });
});

test.describe('payout writes', () => {
  test('asking a payee for a tax form is recorded once, for the session', async ({ request }) => {
    const res = await request.post('/api/money/payouts/requests', { data: { payeeId: 'jules-arden', kind: 'tax_form' } });
    expect(res.status()).toBe(200);
    expect(PayoutsResponse.parse(await res.json()).requests).toEqual([{ payeeId: 'jules-arden', kind: 'tax_form' }]);
    expect(PayoutsResponse.parse(await (await request.get('/api/money/payouts')).json()).requests).toHaveLength(1);
    const again = await request.post('/api/money/payouts/requests', { data: { payeeId: 'jules-arden', kind: 'tax_form' } });
    expect(again.status()).toBe(409);
    expect(PayoutError.parse(await again.json()).error).toBe('already_requested');
  });
  test('bad requests are refused', async ({ request }) => {
    expect((await request.post('/api/money/payouts/requests', { data: { payeeId: 'nobody', kind: 'tax_form' } })).status()).toBe(404);
    expect((await request.post('/api/money/payouts/requests', { data: { payeeId: 'jules-arden', kind: 'passport' } })).status()).toBe(400);
  });
  test('a recoupable cost is added to its release', async ({ request }) => {
    const res = await request.post('/api/money/recoupment/costs', { data: { releaseId: 'rel_nightbus', category: 'Radio promo', cost: 30000, shareBp: 5000 } });
    expect(res.status()).toBe(200);
    const nb = RecoupmentResponse.parse(await res.json()).items.find((r) => r.id === 'rel_nightbus')!;
    expect(nb.costs.at(-1)).toEqual({ category: 'Radio promo', cost: 30000, shareBp: 5000 });
    expect((await request.post('/api/money/recoupment/costs', { data: { releaseId: 'rel_nightbus', category: 'Promo', cost: 0, shareBp: 5000 } })).status()).toBe(400);
    expect((await request.post('/api/money/recoupment/costs', { data: { releaseId: 'rel_nightbus', category: 'Promo', cost: 12.5, shareBp: 5000 } })).status()).toBe(400);
    expect((await request.post('/api/money/recoupment/costs', { data: { releaseId: 'nope', category: 'Promo', cost: 100, shareBp: 5000 } })).status()).toBe(404);
  });
  test('an unknown payee is a 404', async ({ request }) => {
    expect((await request.get('/api/portal/nobody')).status()).toBe(404);
  });
});

test.describe('contract writes', () => {
  test('a contract sent for review is recorded for the session', async ({ request }) => {
    const res = await request.post('/api/contracts/reviews', { data: { fileName: 'Sync offer, Netflix.pdf' } });
    expect(res.status()).toBe(200);
    expect(ContractsResponse.parse(await res.json()).reviews[0]).toMatchObject({ fileName: 'Sync offer, Netflix.pdf', status: 'queued' });
    expect(ContractsResponse.parse(await (await request.get('/api/contracts')).json()).reviews).toHaveLength(1);
  });
  test('only PDF and Word files', async ({ request }) => {
    expect((await request.post('/api/contracts/reviews', { data: { fileName: 'deal.exe' } })).status()).toBe(400);
    expect((await request.post('/api/contracts/reviews', { data: {} })).status()).toBe(400);
  });
});

test.describe('funding writes', () => {
  test('dismissing a card hides it for the session, and undo brings it back', async ({ request }) => {
    const res = await request.post('/api/funding/fund_sale/dismiss');
    expect(res.status()).toBe(200);
    const f = FundingResponse.parse(await res.json());
    expect(f.items.map((i) => i.id)).toEqual(['fund_grant', 'fund_advance']);
    expect(f.counts).toMatchObject({ opportunities: 2, offers: 1 });
    expect(FundingResponse.parse(await (await request.delete('/api/funding/fund_sale/dismiss')).json()).items).toHaveLength(3);
    expect((await request.post('/api/funding/nope/dismiss')).status()).toBe(404);
  });
  test('declining the sale and asking a question are saved; grants can’t be declined', async ({ request }) => {
    expect(OffersResponse.parse(await (await request.post('/api/funding/fund_sale/decline')).json()).declined).toBe(true);
    expect(OffersResponse.parse(await (await request.get('/api/funding/offers')).json()).declined).toBe(true);
    expect(OffersResponse.parse(await (await request.delete('/api/funding/fund_sale/decline')).json()).declined).toBe(false);
    expect((await request.post('/api/funding/fund_grant/decline')).status()).toBe(409);
    const asked = OffersResponse.parse(await (await request.post('/api/funding/questions', { data: { question: 'Can the sale include a buy-back?' } })).json());
    expect(asked.questions[0].text).toBe('Can the sale include a buy-back?');
    expect((await request.post('/api/funding/questions', { data: { question: ' ' } })).status()).toBe(400);
  });
});

test.describe('department writes', () => {
  test('autonomy and hand-offs are saved for the session; act within limits is refused where it isn’t allowed', async ({ request }) => {
    const res = await request.patch('/api/departments/royalties', { data: { autonomy: 'suggest', personId: 'u_priya' } });
    expect(res.status()).toBe(200);
    expect(DepartmentsResponse.parse(await res.json()).departments.find((d) => d.id === 'royalties')).toMatchObject({ autonomy: 'suggest', personId: 'u_priya' });
    const refused = await request.patch('/api/departments/legal', { data: { autonomy: 'act_within_limits' } });
    expect(refused.status()).toBe(409);
    expect(DepartmentError.parse(await refused.json()).error).toBe('not_allowed');
    expect((await request.patch('/api/departments/marketing', { data: { autonomy: 'suggest' } })).status()).toBe(409);
    expect((await request.patch('/api/departments/royalties', { data: { personId: 'u_nobody' } })).status()).toBe(409);
    expect((await request.patch('/api/departments/royalties', { data: {} })).status()).toBe(400);
  });
});

test.describe('settings writes', () => {
  const theme = { background: '#0f1a1c', surface: '#13221f', brand: '#1d4a4f', primary: '#e2b33c', text: '#e8f0ef' }; // lint-allow-hex: tenant data from 5i
  test('publishing the theme is saved for the session; a failing pair is refused', async ({ request }) => {
    const res = await request.post('/api/settings/theme', { data: { theme: { ...theme, primary: '#F0C050' } } }); // lint-allow-hex: test data
    expect(res.status()).toBe(200);
    expect(ThemeResponse.parse(await res.json())).toMatchObject({ theme: { primary: '#f0c050' }, published: { by: 'You' } }); // lint-allow-hex: test data
    const bad = await request.post('/api/settings/theme', { data: { theme: { ...theme, text: '#1a1a1a' } } }); // lint-allow-hex: test data
    expect(bad.status()).toBe(409);
    expect(SettingsError.parse(await bad.json()).error).toBe('fails_contrast');
    expect((await request.post('/api/settings/theme', { data: { theme: { ...theme, text: 'white' } } })).status()).toBe(400);
  });
  test('connecting an integration (sample data)', async ({ request }) => {
    const res = await request.post('/api/settings/integrations/soundexchange/connect');
    expect(SettingsResponse.parse(await res.json()).integrations.find((i) => i.id === 'soundexchange')).toMatchObject({ state: 'ok', status: 'Connected' });
    expect((await request.post('/api/settings/integrations/nope/connect')).status()).toBe(404);
  });
});

test.describe('onboarding writes', () => {
  const answers = { profile: 'band', name: 'The Low Hours', country: 'Canada', distributor: null, catalogFile: null, pro: { status: 'not_sure' }, autonomy: 'suggest' };
  test('answers are saved for the session and survive a reload', async ({ request }) => {
    expect(OnboardingResponse.parse(await (await request.get('/api/onboarding')).json())).toEqual({ answers: null, completed: false });
    expect((await request.put('/api/onboarding', { data: { answers } })).status()).toBe(200);
    expect(OnboardingResponse.parse(await (await request.get('/api/onboarding')).json())).toMatchObject({ answers: { name: 'The Low Hours' }, completed: false });
    expect(OnboardingResponse.parse(await (await request.put('/api/onboarding', { data: { answers, complete: true } })).json()).completed).toBe(true);
    expect((await request.put('/api/onboarding', { data: { answers: { ...answers, profile: 'orchestra' } } })).status()).toBe(400);
  });
});

test.describe('invitation writes', () => {
  test('inviting and withdrawing are saved for the session', async ({ request }) => {
    const res = await request.post('/api/settings/invites', { data: { email: 'Sam@Example.com', role: 'payee', payeeId: 'ari-monroe' } });
    expect(res.status()).toBe(200);
    expect(SettingsResponse.parse(await res.json()).invites).toEqual([expect.objectContaining({ email: 'sam@example.com', role: 'payee', payee: 'Ari Monroe', joined: false })]);
    expect(SettingsResponse.parse(await (await request.delete('/api/settings/invites?email=sam@example.com')).json()).invites).toEqual([]);
    expect((await request.post('/api/settings/invites', { data: { email: 'sam@example.com', role: 'payee' } })).status()).toBe(400);
    expect((await request.post('/api/settings/invites', { data: { email: 'not an email', role: 'team' } })).status()).toBe(400);
  });
});

test.describe('prepared documents', () => {
  test('preparing a document stores a version with its gaps; the PDF and CSV download', async ({ request }) => {
    const res = await request.post('/api/rights/documents', { data: { kind: 'registration_packet', subject: 'work', id: 'night-bus' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const view = DocumentsResponse.parse(body);
    const slot = view.subjects.find((x) => x.subject === 'work' && x.id === 'night-bus')!.docs.find((d) => d.kind === 'registration_packet')!;
    expect(slot.latest).toMatchObject({ id: body.prepared, version: 1, hasCsv: true, summary: '1 to fix' });
    expect(slot.latest!.gaps[0].message).toMatch(/Rue Sato's IPI/);
    const pdf = await request.get(`/api/rights/documents/${body.prepared}/file`);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const csv = await (await request.get(`/api/rights/documents/${body.prepared}/file?format=csv`)).text();
    expect(csv.split('\r\n')[0]).toContain('"Performance share","MLC share"');
    const again = DocumentsResponse.parse(await (await request.post('/api/rights/documents', { data: { kind: 'registration_packet', subject: 'work', id: 'night-bus' } })).json());
    expect(again.subjects.find((x) => x.id === 'night-bus')!.docs.find((d) => d.kind === 'registration_packet')).toMatchObject({ versions: 2, latest: { version: 2 } });
  });
  test('documents only exist for what they apply to, and bad requests are refused', async ({ request }) => {
    expect((await request.post('/api/rights/documents', { data: { kind: 'label_copy', subject: 'work', id: 'night-bus' } })).status()).toBe(400);
    expect((await request.post('/api/rights/documents', { data: { kind: 'split_sheet', subject: 'work', id: 'nope' } })).status()).toBe(404);
    expect((await request.post('/api/rights/documents', { data: { kind: 'split_sheet' } })).status()).toBe(400);
    expect((await request.get('/api/rights/documents/00000000-0000-0000-0000-000000000000/file')).status()).toBe(404);
  });
  test('AI review is refused while the platform switch is off', async ({ request }) => {
    const view = DocumentsResponse.parse(await (await request.get('/api/rights/documents')).json());
    expect(view.ai).toMatchObject({ available: false, on: false });
    const prepared = (await (await request.post('/api/rights/documents', { data: { kind: 'split_sheet', subject: 'work', id: 'glasshouse' } })).json()).prepared;
    const res = await request.post(`/api/rights/documents/${prepared}/review`, { data: {} });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('ai_off');
  });
});

test.describe('ISRC and UPC', () => {
  test('codes are checked when typed, and assigned from the workspace’s prefixes', async ({ request }) => {
    expect((await request.patch('/api/catalog/recordings/low-light', { data: { isrc: 'not-an-isrc' } })).status()).toBe(400);
    expect((await request.patch('/api/catalog/recordings/low-light', { data: { isrc: 'USNL12600014' } })).status()).toBe(409); // Glasshouse has it
    // No prefix yet: nothing to assign from.
    expect((await request.post('/api/catalog/codes/assign', { data: { kind: 'isrc', id: 'low-light' } })).status()).toBe(409);
    expect((await request.put('/api/catalog/codes', { data: { isrcPrefix: 'US1', gs1Prefix: null } })).status()).toBe(400);
    const codes = CodesResponse.parse(await (await request.put('/api/catalog/codes', { data: { isrcPrefix: 'us-zz9', gs1Prefix: '0360002' } })).json());
    expect(codes).toMatchObject({ isrcPrefix: 'USZZ9', gs1Prefix: '0360002', nextUpc: '036000200010' });
    const a = await (await request.post('/api/catalog/codes/assign', { data: { kind: 'isrc', id: 'low-light' } })).json();
    expect(a.code).toBe(codes.nextIsrc);
    expect((await request.post('/api/catalog/codes/assign', { data: { kind: 'isrc', id: 'low-light' } })).status()).toBe(409); // it has one now
    // A UPC must have the right check digit; clear one, then assign the next.
    expect((await request.patch('/api/catalog/releases/rel_glasshouse', { data: { upc: '036000200011' } })).status()).toBe(400);
    expect((await request.patch('/api/catalog/releases/rel_glasshouse', { data: { upc: null } })).status()).toBe(200);
    expect((await (await request.post('/api/catalog/codes/assign', { data: { kind: 'upc', id: 'rel_glasshouse' } })).json()).code).toBe('036000200010');
    expect((await request.patch('/api/catalog/releases/rel_glasshouse', { data: { upc: '036000291452' } })).status()).toBe(200);
  });
});

test.describe('inviting people', () => {
  test('invite a co-owner, or an artist who isn’t a payee yet', async ({ request }) => {
    const owner = SettingsResponse.parse(await (await request.post('/api/settings/invites', { data: { email: 'partner@example.com', role: 'owner' } })).json());
    expect(owner.invites.find((i) => i.email === 'partner@example.com')).toMatchObject({ role: 'owner' });
    const fresh = SettingsResponse.parse(await (await request.post('/api/settings/invites', { data: { email: 'rue@example.com', role: 'payee', newPayee: { name: 'Rue Nova' } } })).json());
    expect(fresh.invites.find((i) => i.email === 'rue@example.com')).toMatchObject({ role: 'payee', payee: 'Rue Nova' });
    expect((await request.post('/api/settings/invites', { data: { email: 'x@example.com', role: 'payee', payeeId: 'ari-monroe', newPayee: { name: 'Both' } } })).status()).toBe(400);
  });
});
