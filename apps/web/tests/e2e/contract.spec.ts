import { test, expect, type Page } from '@playwright/test';
import { ApprovalError, ApprovalState, ContractsResponse, ENDPOINTS, PayoutError, PayoutsResponse, ProfileClaimsResponse, Recording, RecoupmentResponse, RoyaltiesResponse, SplitError, SplitNodeResponse, StatementError } from '@breakrecords/contract';

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
    const res = await request.post('/api/approvals/apr_mlc/decision', { data: { action: 'approve' } });
    expect(res.status()).toBe(200);
    const s = ApprovalState.parse(await res.json());
    expect(s.decisions.apr_mlc).toMatchObject({ status: 'approved', by: 'you' });
    expect(s.decisions.apr_mlc.auditId).toMatch(/^AUD-/);
    expect((await state(request)).decisions.apr_mlc.status).toBe('approved');
    const undone = await request.delete('/api/approvals/apr_mlc/decision');
    expect(ApprovalState.parse(await undone.json()).decisions.apr_mlc).toBeUndefined();
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
    const ok = await request.post('/api/approvals/decisions', { data: { action: 'approve', ids: ['apr_payout_oct', 'apr_mlc'] } });
    expect(Object.keys(ApprovalState.parse(await ok.json()).decisions).sort()).toEqual(['apr_mlc', 'apr_payout_oct']);
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
    await a.post('/api/approvals/apr_mlc/decision', { data: { action: 'approve' } });
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
