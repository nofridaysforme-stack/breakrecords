import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ActivityResponse, ApprovalChecksResponse, CodesResponse, SessionResponse, DocumentsResponse, ApprovalError, ApprovalState, CatalogResponse, HomeResponse, OnboardingResponse, SearchResponse, ContractsResponse, DepartmentsResponse, ENDPOINTS, SettingsResponse, ThemeResponse, FundingResponse, OffersResponse, RosterResponse, Release, ReleasesResponse, PayeeResponse, PayoutsResponse, RecoupmentResponse, ProfileClaimsResponse, Recording, RegistrationsResponse, RoyaltiesResponse, SplitNodeResponse, SplitTreeResponse, StatementResponse, StatementsResponse, UnclaimedResponse, TaxYearResponse, ReservesResponse, SplitVersionsResponse, ImportsResponse } from '@breakrecords/contract';
import { connect } from '@breakrecords/db/client';
import { signIn, USERS } from './helpers';
import { MAILBOX } from '../../playwright.live.config';

// Live mode (Postgres + sign-in + approvals module live). Stage 0 gate: screens run on the
// live API, and cross-tenant reads fail.

test('signed out: pages go to sign-in and the API refuses', async ({ page, request }) => {
  await page.goto('/approvals');
  await expect(page).toHaveURL(/\/sign-in$/);
  const res = await request.get('/api/approvals/state');
  expect(res.status()).toBe(401);
});

test('an email that was not invited cannot get a link', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('stranger@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t invited' })).toBeVisible();
});

test('Northline sees its own approvals and none of Harbor Sound’s', async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto('/approvals');
  await expect(page.getByRole('article', { name: 'Producer agreement, Marco Dela' }).first()).toBeVisible();
  await expect(page.getByText('$842.10 to 4 payees')).toHaveCount(0);
  const ids = (await (await page.request.get('/api/approvals')).json()).items.map((a: { id: string }) => a.id);
  expect(ids.sort()).toEqual(['apr_grant', 'apr_mlc', 'apr_payout_oct', 'apr_producer']);
});

test('a decision is saved for the label: a teammate sees it, and it survives sign-out', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  await page.request.delete('/api/approvals/apr_producer/decision');
  await page.goto('/approvals/apr_producer');
  // The two flagged terms are decided on the card, so those choices are the reason LEG-01 asks for.
  const terms = page.getByRole('button', { name: 'Use playbook wording' });
  await expect(terms).toHaveCount(2);
  for (const b of await terms.all()) await b.click();
  await page.getByRole('button', { name: 'Approve and send for signature' }).click();
  await expect.poll(async () => ApprovalState.parse(await (await page.request.get('/api/approvals/state')).json()).decisions.apr_producer?.status).toBe('approved');

  const other = await browser.newContext();
  const jana = await other.newPage();
  await signIn(jana, USERS.jana);
  const state = ApprovalState.parse(await (await jana.request.get('/api/approvals/state')).json());
  expect(state.decisions.apr_producer).toMatchObject({ status: 'approved' });
  expect(state.decisions.apr_producer.auditId).toMatch(/^AUD-[0-9A-F]{4}-\d{4}$/);
  // Undo from the teammate's session clears it for everyone.
  expect((await jana.request.delete('/api/approvals/apr_producer/decision')).status()).toBe(200);
  await other.close();
  expect(ApprovalState.parse(await (await page.request.get('/api/approvals/state')).json()).decisions.apr_producer).toBeUndefined();
});

test('checks: the clean demo passes, the grant waits on a deadline check, and breaking the data blocks the payout on the server', async ({ page }) => {
  await signIn(page, USERS.owner);
  const checks = async () => ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
  const c = await checks();
  const failed = (x: typeof c, id: string) => x.items[id].results.filter((r) => r.status === 'fail' && r.severity === 'block').map((r) => r.id);
  expect(c.today).toBe(new Date().toISOString().slice(0, 10)); // the real date, not the sample's
  expect(failed(c, 'apr_payout_oct')).toEqual([]);
  expect(failed(c, 'apr_mlc')).toEqual([]);
  expect(failed(c, 'apr_grant')).toEqual(['FUN-03']);
  expect(c.items.apr_producer.canApprove).toBe(true);

  // The broken copy of the label: reopen the audit flag, drop Rue's tax form, give Low Light October income.
  const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
  await db`UPDATE audit_flags SET resolved_at = NULL, resolution = NULL`;
  await db`UPDATE payees SET tax_form = NULL WHERE party_id = (SELECT id FROM parties WHERE slug = 'rue-sato' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'northline'))`;
  await db`UPDATE income_lines SET recording_id = (SELECT id FROM recordings WHERE slug = 'low-light' AND tenant_id = income_lines.tenant_id)
    WHERE id IN (SELECT l.id FROM income_lines l JOIN recordings r ON r.id = l.recording_id JOIN income_statements s ON s.id = l.statement_id
                 WHERE r.slug = 'paper-moons' AND s.period = '2026-10-01' LIMIT 5)`;
  const broken = await checks();
  expect(failed(broken, 'apr_payout_oct')).toEqual(['ROY-02', 'ROY-04', 'ROY-05', 'ROY-07']);
  const msg = (id: string) => broken.items.apr_payout_oct.results.find((r) => r.id === id)!.message;
  expect(msg('ROY-02')).toBe('Rue Sato has no tax form on file.');
  expect(msg('ROY-07')).toContain('Night Bus has an open audit flag');
  expect(msg('ROY-05')).toContain('Low Light earns');

  // Refused on the server, whatever the screen shows, and nothing is recorded.
  const res = await page.request.post('/api/approvals/apr_payout_oct/decision', { data: { action: 'approve' } });
  expect(res.status()).toBe(409);
  expect(ApprovalError.parse(await res.json())).toMatchObject({ error: 'blocked', ids: ['apr_payout_oct'] });
  await page.goto('/approvals');
  await expect(page.getByRole('region', { name: /Can't approve yet/ }).filter({ visible: true }).getByRole('article', { name: 'Payout batch for October' })).toBeVisible();

  // Resolving the flag clears ROY-07 on the next run; the rest still hold.
  await db`UPDATE audit_flags SET resolved_at = now(), resolution = 'Distributor confirmed the streams'`;
  expect((await checks()).items.apr_payout_oct.results.find((r) => r.id === 'ROY-07')!.status).toBe('pass');
  // Put the clean demo back.
  await db`UPDATE payees SET tax_form = 'W-9' WHERE party_id = (SELECT id FROM parties WHERE slug = 'rue-sato' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'northline'))`;
  await db`UPDATE income_lines SET recording_id = (SELECT id FROM recordings WHERE slug = 'paper-moons' AND tenant_id = income_lines.tenant_id)
    WHERE recording_id IN (SELECT id FROM recordings WHERE slug = 'low-light')`;
  expect(failed(await checks(), 'apr_payout_oct')).toEqual([]);

  // An approval is logged with every rule result and the inputs it read.
  await page.request.delete('/api/approvals/apr_producer/decision');
  expect((await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve', acceptWarnings: 'Playbook differences reviewed' } })).status()).toBe(200);
  const [ev] = await db<{ data: { checks: { id: string; status: string; inputs: string[] }[]; acceptedWarnings?: string } }[]>`SELECT data FROM audit_events WHERE kind = 'approval.approved' AND ref = 'apr_producer' ORDER BY id DESC LIMIT 1`;
  await db.end();
  expect(ev.data.checks.map((r) => [r.id, r.status])).toEqual([['LEG-01', 'fail'], ['LEG-02', 'pass'], ['LEG-03', 'pass'], ['LEG-04', 'pass'], ['LEG-05', 'unknown'], ['LEG-06', 'pass']]);
  expect(ev.data).toMatchObject({ acceptedWarnings: 'Playbook differences reviewed' });
  await page.request.delete('/api/approvals/apr_producer/decision');
});

test('cross-tenant: Harbor Sound can’t read or decide Northline’s approvals', async ({ page }) => {
  await signIn(page, USERS.harbor);
  const list = (await (await page.request.get('/api/approvals')).json()).items.map((a: { id: string }) => a.id);
  expect(list).toEqual(['apr_harbor_payout']);
  expect((await page.request.get('/api/approvals/apr_payout_oct')).status()).toBe(404);
  const res = await page.request.post('/api/approvals/apr_payout_oct/decision', { data: { action: 'approve' } });
  expect(res.status()).toBe(404);
  expect(ApprovalError.parse(await res.json()).error).toBe('not_found');
  await page.goto('/approvals/apr_payout_oct');
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Payout batch for October');
});

test('the server enforces the approval rules', async ({ page }) => {
  await signIn(page, USERS.owner);
  const reject = await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'reject', reason: '' } });
  expect(ApprovalError.parse(await reject.json()).error).toBe('reason_required');
  const bulk = await page.request.post('/api/approvals/decisions', { data: { action: 'approve', ids: ['apr_payout_oct', 'apr_producer'] } });
  expect(bulk.status()).toBe(409);
  expect(ApprovalState.parse(await (await page.request.get('/api/approvals/state')).json()).decisions.apr_payout_oct).toBeUndefined();
});

test('a proposal made in the app is stored and approvable', async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto('/funding/offers/compare');
  await page.getByRole('button', { name: 'Accept advance (goes to approval)' }).click();
  await expect(page.getByText(/waiting in/i).filter({ visible: true })).toBeVisible();
  await expect.poll(async () => ApprovalState.parse(await (await page.request.get('/api/approvals/state')).json()).proposals.map((p) => p.id)).toContain('offer_advance_accept');
  await page.goto('/approvals');
  await expect(page.getByText('Accept $8,000 royalty advance').first()).toBeVisible();
});

test('checks on proposals: a date plan reads the runbook; accepting the advance is blocked until its projection matches real income', async ({ page }) => {
  await signIn(page, USERS.owner);
  const plan = { id: 'plan_checks', type: 'plan', title: 'Move Glasshouse', agent: 'Label Head', due: 'Jan 22', impact: 'x', risk: 'dueSoon', href: '/releases/rel_glasshouse', releaseId: 'rel_glasshouse', newDate: '2027-04-16' };
  const offer = { id: 'offer_advance_accept', type: 'money', title: 'Accept $8,000 royalty advance', agent: 'Finance Agent', due: 'Dec 1', impact: 'x', risk: 'needsEyes', href: '/funding/offers/compare' };
  for (const proposal of [plan, offer]) expect((await page.request.post('/api/approvals', { data: { proposal } })).status()).toBe(200);
  const c = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
  const rows = (id: string) => c.items[id].results.map((r) => [r.id, r.status]);
  expect(rows('plan_checks')).toEqual([['REL-01', 'pass'], ['REL-02', 'pass'], ['REL-03', 'pass']]);
  expect(rows('offer_advance_accept')).toEqual([['FUN-04', 'fail'], ['FUN-05', 'unknown']]);
  const res = await page.request.post('/api/approvals/offer_advance_accept/decision', { data: { action: 'approve' } });
  expect(res.status()).toBe(409);
  expect(ApprovalError.parse(await res.json())).toMatchObject({ error: 'blocked', ids: ['offer_advance_accept'] });
  // A pitch that moves too close to the release blocks the plan: shrink the pitch phase's lead to 5 days.
  const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
  const [before] = await db<{ offset_days: number }[]>`SELECT p.offset_days FROM runbook_phases p JOIN releases r ON r.id = p.release_id WHERE r.slug = 'rel_glasshouse' AND EXISTS (SELECT 1 FROM runbook_tasks t WHERE t.phase_id = p.id AND t.title ILIKE '%pitch%')`;
  await db`UPDATE runbook_phases p SET offset_days = -5 FROM releases r WHERE r.id = p.release_id AND r.slug = 'rel_glasshouse' AND EXISTS (SELECT 1 FROM runbook_tasks t WHERE t.phase_id = p.id AND t.title ILIKE '%pitch%')`;
  const late = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
  await db`UPDATE runbook_phases p SET offset_days = ${before.offset_days} FROM releases r WHERE r.id = p.release_id AND r.slug = 'rel_glasshouse' AND EXISTS (SELECT 1 FROM runbook_tasks t WHERE t.phase_id = p.id AND t.title ILIKE '%pitch%')`;
  await db.end();
  expect(late.items.plan_checks.results.find((r) => r.id === 'REL-01')).toMatchObject({ status: 'fail', severity: 'block' });
  expect(late.items.plan_checks.canApprove).toBe(false);
});

test('payees only see the portal and cannot decide', async ({ page }) => {
  await signIn(page, USERS.payee, { into: 'Northline Records' });
  await page.goto('/approvals');
  await expect(page).toHaveURL(/\/portal/);
  const res = await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve' } });
  expect(res.status()).toBe(403);
});

test('signed in, every endpoint still matches the contract', async ({ page }) => {
  await signIn(page, USERS.owner);
  for (const e of ENDPOINTS) {
    const res = await page.request.get(e.path);
    expect(res.status(), e.path).toBe(200);
    const parsed = e.schema.safeParse(await res.json());
    expect(parsed.success ? 'ok' : `${e.path}: ${JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe('ok');
  }
});

test.describe('catalog (live)', () => {
  const catalog = async (page: import('@playwright/test').Page) => CatalogResponse.parse(await (await page.request.get('/api/catalog')).json());

  test('Northline’s catalog comes from its own tables, scored from the data', async ({ page }) => {
    await signIn(page, USERS.owner);
    const c = await catalog(page);
    expect(c.recordings.map((r) => r.id)).toEqual(['glasshouse', 'night-bus', 'static-hymn', 'velvet-hours', 'low-light', 'night-bus-demo', 'paper-moons']);
    expect(c.counts).toEqual({ songs: 6, recordings: 7, releases: 3, assets: 8 });
    // Glasshouse: no ISWC yet, and Marco hasn't signed the split sheet (5b: 1 of 2 signed).
    const gh = c.recordings.find((r) => r.id === 'glasshouse')!;
    expect(gh).toMatchObject({ score: 83, upc: '196922410037', duration: '3:42' });
    expect(gh.note).toBe('Missing the ISWC and confirmed writer splits. Publishing Agent will add it once the MLC filing is confirmed.');
    expect(c.recordings.find((r) => r.id === 'velvet-hours')!.score).toBe(100);
    expect(c.songs.find((s) => s.id === 'glasshouse')).toMatchObject({ writers: 'Kesi Vale 75%, Marco Dela 25%', mlc: 'needsYou' });
    await page.goto('/catalog/recordings');
    await expect(page.getByRole('complementary', { name: 'Glasshouse details' })).toContainText('83% complete.');
    await expect(page.getByText('Tidal Lines')).toHaveCount(0);
  });

  test('editing a recording saves to the database and rescores it', async ({ page }) => {
    await signIn(page, USERS.owner);
    const before = (await catalog(page)).recordings.find((r) => r.id === 'low-light')!;
    // Missing ISRC, genre, ISWC, signed writer splits, lyrics, contributor credits and a release: 5 of 12.
    expect(before).toMatchObject({ genre: null, score: 41 });
    await page.goto('/catalog/recordings?id=low-light');
    const panel = page.getByRole('complementary', { name: 'Low Light details' });
    await panel.getByRole('button', { name: 'Edit metadata' }).click();
    await page.getByRole('dialog', { name: 'Edit Low Light' }).getByLabel('Genre').fill('Electronic');
    await page.getByRole('dialog', { name: 'Edit Low Light' }).getByRole('button', { name: 'Save' }).click();
    await expect(panel).toContainText('50% complete.');
    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Low Light details' })).toContainText('Electronic');
  });

  test('cross-tenant: Harbor Sound sees only its catalog and can’t edit Northline’s', async ({ page }) => {
    await signIn(page, USERS.harbor);
    const c = await catalog(page);
    expect(c.recordings.map((r) => r.id)).toEqual(['tidal-lines']);
    const res = await page.request.patch('/api/catalog/recordings/glasshouse', { data: { genre: 'Pop' } });
    expect(res.status()).toBe(404);
  });

  test('payees can’t change the catalog', async ({ page }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    expect((await page.request.patch('/api/catalog/recordings/glasshouse', { data: { genre: 'Pop' } })).status()).toBe(403);
  });

  test('a saved edit returns a valid recording', async ({ page }) => {
    await signIn(page, USERS.owner);
    const res = await page.request.patch('/api/catalog/recordings/paper-moons', { data: { ai: 'None' } });
    expect(Recording.safeParse(await res.json()).success).toBe(true);
  });
});

test.describe('rights (live)', () => {
  test('the registrations matrix comes from Northline’s filings', async ({ page }) => {
    await signIn(page, USERS.owner);
    const r = RegistrationsResponse.parse(await (await page.request.get('/api/rights/registrations')).json());
    // Released recordings and recordings with their own filings; the unreleased demo stays out.
    expect(r.rows.map((x) => x.id)).toEqual(['glasshouse', 'night-bus', 'static-hymn', 'velvet-hours', 'low-light', 'paper-moons']);
    expect(r.rows[0].cells.map((c) => c.status)).toEqual(['confirmed', 'needsYou', 'confirmed', 'prepared', 'notStarted', 'notStarted']);
    expect(r.rows[0].cells[0].ref).toBe('BMI #8821');
    // Paper Moons is on the Velvet Hours album but has no filings yet.
    expect(r.rows[5].cells.every((c) => c.status === 'notStarted')).toBe(true);
    await page.goto('/rights/registrations');
    await expect(page.getByRole('heading', { name: /3 MLC filings need you/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'three hundred twelve dollars and forty cents unclaimed found' })).toBeVisible();
  });

  test('unclaimed money is read in cents and totals correctly', async ({ page }) => {
    await signIn(page, USERS.owner);
    const u = UnclaimedResponse.parse(await (await page.request.get('/api/rights/unclaimed')).json());
    expect(u.total).toBe(31240);
    expect(u.items.map((i) => [i.id, i.source, i.amount, i.since])).toEqual([['unc_sx', 'SoundExchange', 19860, 'Jul 2026'], ['unc_mlc', 'MLC', 11380, 'Aug 2026']]);
  });

  test('preparing profile claims is saved for the label', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    await page.goto('/rights/claims');
    await page.getByRole('button', { name: 'Prepare the rest' }).click();
    await expect(page.getByRole('heading', { name: 'Rights Agent is preparing them' })).toBeVisible();
    const other = await (await browser.newContext()).newPage();
    await signIn(other, USERS.jana);
    const c = ProfileClaimsResponse.parse(await (await other.request.get('/api/rights/claims')).json());
    expect(c.rows.map((r) => r.artist)).toEqual(['Kesi Vale', 'The Low Hours', 'Marco Dela']);
    expect(c.rows.flatMap((r) => r.cells).filter((x) => x.status === 'notStarted')).toHaveLength(0);
    expect(c.rows[0].cells.map((x) => x.status)).toEqual(['confirmed', 'confirmed', 'submitted', 'prepared']);
    expect(c.rows[2].cells[0]).toEqual({ status: 'needsYou', ref: 'verify email' });
  });

  test('cross-tenant: Harbor Sound sees none of Northline’s rights data', async ({ page }) => {
    await signIn(page, USERS.harbor);
    const r = RegistrationsResponse.parse(await (await page.request.get('/api/rights/registrations')).json());
    expect(r.rows.map((x) => x.id)).toEqual([]);
    const u = UnclaimedResponse.parse(await (await page.request.get('/api/rights/unclaimed')).json());
    expect(u).toEqual({ total: 0, items: [] });
  });

  test('payees can’t manage profile claims', async ({ page }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    expect((await page.request.post('/api/rights/claims/prepare', { data: {} })).status()).toBe(403);
  });
});

test.describe('splits (live)', () => {
  const node = async (page: import('@playwright/test').Page) => SplitNodeResponse.parse(await (await page.request.get('/api/splits/gh-rec')).json());

  test('the tree and Glasshouse versions come from the database', async ({ page }) => {
    await signIn(page, USERS.owner);
    const tree = SplitTreeResponse.parse(await (await page.request.get('/api/splits')).json());
    expect(tree[0].children?.map((c) => c.id)).toEqual(['kesi', 'low-hours', 'marco']);
    const d = await node(page);
    expect(d.breadcrumb).toEqual(['Kesi Vale', 'Glasshouse', 'Recording income']);
    expect(d.v4).toMatchObject({ version: 4, effective: 'Oct 1, 2026', signed: { 'Marco Dela': 'Sep 28', 'Northline Records': 'Sep 26' } });
    expect(d.v5).toMatchObject({ version: 5, status: 'draft', created: 'Nov 6', terms: { labelOfNetBp: 4000, artistOfNetBp: 5500 } });
    expect(d.history.map((h) => h.v)).toEqual(['v3', 'v2']);
    expect(d.market.text).toContain('Marco’s 3 is in range.');
  });

  test('fix, send, then the payee signs from the portal and the label sees it', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    await page.goto('/splits/gh-rec');
    const send = page.getByRole('button', { name: 'Send v5 for signatures' });
    await expect(send).toBeDisabled();
    await page.getByRole('button', { name: 'Edit draft shares' }).click();
    await page.getByLabel('Label, share of net profit').fill('45');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByRole('button', { name: 'v5 sent for signatures' })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('button', { name: 'v5 sent for signatures' })).toBeDisabled();

    // The owner signs only for the label.
    expect((await page.request.post('/api/splits/gh-rec/sign', { data: { role: 'producer' } })).status()).toBe(403);
    expect((await page.request.post('/api/splits/gh-rec/sign', { data: { role: 'label' } })).status()).toBe(200);

    const marco = await (await browser.newContext()).newPage();
    await signIn(marco, USERS.payee, { into: 'Northline Records' });
    await marco.goto('/portal/sign');
    await expect(marco.getByRole('heading', { name: 'Glasshouse split v5 needs your signature' })).toBeVisible();
    expect((await marco.request.post('/api/splits/gh-rec/sign', { data: { role: 'artist' } })).status()).toBe(403);
    await marco.getByRole('button', { name: 'Sign v5' }).click();
    await expect(marco.getByText('You signed v5.')).toBeVisible();
    // A payee can't change the split itself.
    expect((await marco.request.put('/api/splits/gh-rec/draft', { data: { terms: { producerBp: 400, labelOfNetBp: 4500, artistOfNetBp: 5500, featureOfArtistBp: 1000 } } })).status()).toBe(403);

    const d = await node(page);
    expect(Object.keys(d.v5!.signed).sort()).toEqual(['Marco Dela', 'Northline Records']);
    await page.reload();
    await expect(page.getByText('Sent for signatures · 2 of 4 signed')).toBeVisible();
  });

  test('cross-tenant: Harbor Sound sees no Northline splits', async ({ page }) => {
    await signIn(page, USERS.harbor);
    expect(SplitTreeResponse.parse(await (await page.request.get('/api/splits')).json())).toEqual([]);
    expect((await page.request.get('/api/splits/gh-rec')).status()).toBe(404);
    expect((await page.request.post('/api/splits/gh-rec/send', { data: {} })).status()).toBe(404);
  });
});

test.describe('statements (live)', () => {
  const royalties = async (page: import('@playwright/test').Page) => RoyaltiesResponse.parse(await (await page.request.get('/api/money/royalties')).json());

  test('Royalties are computed from the income lines', async ({ page }) => {
    await signIn(page, USERS.owner);
    const r = await royalties(page);
    expect(r.period).toBe('October 2026');
    expect(r.stats).toMatchObject({ income: 1428640, incomeNote: 'Up 18% on September', matched: 1204, lines: 1231, unclaimed: 31240, unclaimedNote: '2 sources to claim' });
    expect(r.sources.reduce((a, x) => a + x.amount, 0)).toBe(r.stats.income); // reconciles to the cent
    expect(r.sources.map((x) => x.name)).toEqual(['Distributor', 'SoundExchange', 'MLC', 'PRO', 'Sync', 'Bandcamp']);
    expect(r.byArtist.reduce((a, x) => a + x.amount, 0) + r.unmatched.value).toBe(r.stats.income);
    expect(r.byArtist[0]).toMatchObject({ name: 'Kesi Vale', amount: 1102400, meta: 'Velvet Hours and Paper Moons' });
    expect(r.unmatched).toMatchObject({ count: 27, value: 4112, note: 'Royalties Agent thinks 24 are a typo in "Night Bus" metadata.', unknown: { count: 3, value: 272 } });
    expect(r.zeroTracks).toEqual([{ name: 'Night Bus (demo)', streams: 412 }, { name: 'Static Hymn', streams: 688 }]);

    await page.goto('/money/royalties');
    await expect(page.getByText('1,204 of 1,231').first()).toBeVisible();
  });

  test('statements are served as issued, and checked', async ({ page }) => {
    await signIn(page, USERS.owner);
    const list = StatementsResponse.parse(await (await page.request.get('/api/statements')).json());
    expect(list.items.map((s) => s.id)).toEqual(['ST-2026-10-KV', 'ST-2026-10-MD', 'ST-2026-10-AM', 'ST-2026-09-MD']);
    const kv = StatementResponse.parse(await (await page.request.get('/api/statements/ST-2026-10-KV')).json());
    expect(kv).toMatchObject({ payee: 'Kesi Vale', release: 'Velvet Hours', period: 'October 2026', split: 'split v1', net: 234675, pays: 'Jan 15 on the quarterly artist run' });
    expect(kv.rows.at(-1)?.balance).toBe(kv.net);
    await page.goto('/money/statements');
    await expect(page.getByRole('row', { name: /Kesi Vale/ })).toContainText('$2,346.75');
    await page.goto('/money/statements/ST-2026-10-KV');
    await expect(page.getByText('$2,346.75').first()).toBeVisible();
  });

  test('cross-tenant: Harbor Sound sees only its own income and statements', async ({ page }) => {
    await signIn(page, USERS.harbor);
    const r = await royalties(page);
    expect(r.stats).toMatchObject({ income: 84210, lines: 1, matched: 1 });
    expect(r.byArtist.map((a) => a.name)).toEqual(['Mara Quill']);
    expect(StatementsResponse.parse(await (await page.request.get('/api/statements')).json()).items.map((s) => s.id)).toEqual(['ST-2026-10-MQ']);
    expect((await page.request.get('/api/statements/ST-2026-10-KV')).status()).toBe(404);
    expect((await page.request.post('/api/money/royalties/match', { data: { isrc: 'USNL1250031', recordingId: 'night-bus' } })).status()).toBe(404);
  });

  test('a payee sees only their own statements, and no label income', async ({ page }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    expect((await page.request.get('/api/money/royalties')).status()).toBe(403);
    expect(StatementsResponse.parse(await (await page.request.get('/api/statements')).json()).items.map((s) => s.id)).toEqual(['ST-2026-10-MD', 'ST-2026-09-MD']);
    expect((await page.request.get('/api/statements/ST-2026-10-KV')).status()).toBe(404);
    expect((await page.request.post('/api/money/royalties/match', { data: { isrc: 'USNL1250031', recordingId: 'night-bus' } })).status()).toBe(403);
    await page.goto('/portal/statements');
    await expect(page.getByRole('link', { name: /October 2026 · Velvet Hours/ })).toContainText('$285.00');
    await expect(page.getByRole('link', { name: /September 2026 · Velvet Hours/ })).toContainText('$312.60');
    await page.goto('/portal/statements/ST-2026-10-MD');
    await expect(page.getByText('$285.00').first()).toBeVisible();
  });

  test('matching the mistyped lines is saved for the label and audited', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    await page.goto('/money/royalties');
    await page.getByRole('button', { name: 'Resolve 27 lines' }).click();
    await expect(page.getByText('carry ISRC USNL1250031, one digit short of Night Bus (USNL12500031)')).toBeVisible();
    await page.getByRole('button', { name: 'Match 24 lines to Night Bus' }).click();
    await expect(page.getByRole('status').filter({ hasText: '24 lines matched to Night Bus.' })).toContainText('3 lines are still unknown');

    const jana = await (await browser.newContext()).newPage();
    await signIn(jana, USERS.jana);
    const r = await royalties(jana);
    expect(r.stats).toMatchObject({ matched: 1228, income: 1428640 });
    expect(r.unmatched).toMatchObject({ count: 3, value: 272, suggestions: [] });
    expect(r.byArtist.find((a) => a.name === 'The Low Hours')?.amount).toBe(322128 + 3840);
    expect((await jana.request.post('/api/money/royalties/match', { data: { isrc: 'USNL1250031', recordingId: 'night-bus' } })).status()).toBe(409);
    const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
    const audit = await db`SELECT ref, data FROM audit_events WHERE kind = 'income_lines.matched'`;
    await db.end();
    expect(audit).toEqual([{ ref: 'USNL1250031', data: { recording: 'night-bus', lines: 24, cents: 3840 } }]);
  });
});

test.describe('payouts (live)', () => {
  test('batches, tax forms and carry-forward are computed from the lines', async ({ page }) => {
    await signIn(page, USERS.owner);
    const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
    expect(p.batches.map((b) => [b.id, b.payees, b.total, b.status, b.note])).toEqual([
      ['pb-2026-10', 6, 124018, 'awaiting', '2 carried forward'], ['pb-2026-q3', 2, 690415, 'draft', 'Opens Jan 15'],
      ['pb-2026-09', 5, 101844, 'sent', 'Sent Oct 10'], ['pb-2026-08', 5, 93402, 'failed', 'Theo Lind, bank details'], ['pb-2026-07', 4, 82270, 'sent', 'Sent Aug 10'],
    ]);
    expect(p.carryForward).toEqual([{ name: 'Jules Arden', role: 'Session bass', amount: 1840 }, { name: 'Pia Novak', role: 'Artwork, 0.5 pt', amount: 912 }]);
    expect(p.taxForms.filter((t) => t.status !== 'ok').map((t) => [t.name, t.label, t.fix])).toEqual([['Theo Lind', 'Expires Dec 31', 'Request new'], ['Jules Arden', 'Missing', 'Request form']]);
    const r = RecoupmentResponse.parse(await (await page.request.get('/api/money/recoupment')).json());
    expect(r.items.map((i) => [i.id, i.recouped, i.recoupedIn ?? i.projected])).toEqual([['rel_velvet', 400000, 'Oct 2026'], ['rel_glasshouse', 0, 'Jun 2027'], ['rel_nightbus', 305000, 'Aug 2027']]);
  });

  test('requests and costs are saved for the label and audited', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    await page.goto('/money/payouts');
    await page.getByRole('button', { name: 'Request form for Jules Arden' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Request sent' })).toBeVisible();
    await page.getByRole('button', { name: 'Fix Theo Lind’s bank details' }).click();
    await expect(page.getByText('Asked Theo for new bank details')).toBeVisible();

    await page.goto('/money/recoupment');
    await page.getByRole('button', { name: 'Add a cost' }).click();
    const form = page.getByRole('dialog', { name: 'Add a cost' });
    await form.getByLabel('Release').selectOption('rel_nightbus');
    await form.getByLabel('Category').fill('Radio promo');
    await form.getByLabel('Full cost in dollars').fill('300');
    await form.getByLabel('Recoupable share').selectOption('50');
    await form.getByRole('button', { name: 'Add cost' }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole('region', { name: 'Night Bus EP costs by category' })).toContainText('Radio promo');

    const jana = await (await browser.newContext()).newPage();
    await signIn(jana, USERS.jana);
    await jana.goto('/money/payouts');
    await expect(jana.getByText('Asked Theo for new bank details')).toBeVisible();
    await expect(jana.getByRole('status').filter({ hasText: 'Request sent' })).toHaveCount(1);
    const items = RecoupmentResponse.parse(await (await jana.request.get('/api/money/recoupment')).json()).items;
    expect(items.find((i) => i.id === 'rel_nightbus')?.costs.at(-1)).toEqual({ category: 'Radio promo', cost: 30000, shareBp: 5000 });
    const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
    const audit = await db`SELECT kind, ref FROM audit_events WHERE kind IN ('payee_request.created', 'recoupable_cost.added') ORDER BY id`;
    await db.end();
    expect(audit).toEqual([{ kind: 'payee_request.created', ref: 'jules-arden' }, { kind: 'payee_request.created', ref: 'theo-lind' }, { kind: 'recoupable_cost.added', ref: 'rel_nightbus' }]);
  });

  test('the portal is built from the payee’s own rows', async ({ page }) => {
    await signIn(page, USERS.owner);
    const kesi = PayeeResponse.parse(await (await page.request.get('/api/portal/kesi-vale')).json());
    expect(kesi).toMatchObject({ earned: 234675, paid: 0, next: { amount: 234675, date: 'Jan 15', from: 'From Velvet Hours, October. 50% of net profit, less feature.' } });
    expect(kesi.signPrompt.text).toBe('Your share goes up from 43.65% to 48.02% of recording income.');
  });

  test('a payee sees only their own portal and none of the label’s payouts', async ({ page }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    const me = PayeeResponse.parse(await (await page.request.get('/api/portal/marco-dela')).json());
    expect(me).toMatchObject({ name: 'Marco Dela', earned: 114630, paid: 86130, next: { amount: 28500, date: 'Nov 10', from: 'From Velvet Hours, October. 3 points.' }, bank: { last4: '4821' } });
    expect(me.statementIds).toEqual(['ST-2026-10-MD', 'ST-2026-09-MD']);
    expect((await page.request.get('/api/portal/kesi-vale')).status()).toBe(404);
    for (const path of ['/api/money/payouts', '/api/money/recoupment']) expect((await page.request.get(path)).status()).toBe(403);
    expect((await page.request.post('/api/money/payouts/requests', { data: { payeeId: 'jules-arden', kind: 'tax_form' } })).status()).toBe(403);
    await page.goto('/portal?as=kesi-vale'); // ignored: a payee always sees themselves
    await expect(page.getByRole('heading', { name: /Hi Marco\. Your next payment is \$285\.00 on Nov 10\./ })).toBeVisible();
    await page.goto('/portal/profile');
    await expect(page.getByText('Payments go to checking ending 4821.')).toBeVisible();
  });

  test('cross-tenant: Harbor Sound sees only its own payouts and payees', async ({ page }) => {
    await signIn(page, USERS.harbor);
    const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
    expect(p.batches.map((b) => [b.id, b.total])).toEqual([['hs-2026-10', 84210]]);
    expect(p.taxForms.map((t) => t.name)).toEqual(['Mara Quill']);
    expect(RecoupmentResponse.parse(await (await page.request.get('/api/money/recoupment')).json()).items).toEqual([]);
    expect((await page.request.get('/api/portal/marco-dela')).status()).toBe(404);
    expect((await page.request.post('/api/money/payouts/requests', { data: { payeeId: 'jules-arden', kind: 'tax_form' } })).status()).toBe(404);
    expect((await page.request.post('/api/money/recoupment/costs', { data: { releaseId: 'rel_nightbus', category: 'x', cost: 100, shareBp: 100 } })).status()).toBe(404);
  });
});

test.describe('releases (live)', () => {
  const glasshouse = async (page: import('@playwright/test').Page) => Release.parse(await (await page.request.get('/api/releases/rel_glasshouse')).json());

  test('the runbook comes from the database, with status and blockers worked out', async ({ page }) => {
    await signIn(page, USERS.owner);
    expect(ReleasesResponse.parse(await (await page.request.get('/api/releases')).json()).items.map((r) => r.id)).toEqual(['rel_glasshouse']);
    const r = await glasshouse(page);
    expect(r).toMatchObject({ title: 'Glasshouse', kind: 'Single', artist: 'Kesi Vale', date: '2027-03-05', status: 'onTrack', budget: 300000, spent: 186000 });
    expect(r.phases.map((p) => [p.name, p.iso, p.status])).toEqual([
      ['Now', '2026-11-06', 'now'], ['8 weeks out', '2027-01-08', 'future'], ['6 weeks out', '2027-01-22', 'future'], ['4 weeks out', '2027-02-05', 'future'],
      ['Release week', '2027-03-05', 'future'], ['After release', '2027-06-03', 'future'],
    ]);
    expect(r.phases[1].tasks[0]).toEqual({ title: 'Split sheets signed (2 of 3)', owner: 'Legal', state: 'locked', gate: { owner: 'Legal', waitingOn: 'Marco Dela' } });
    expect(r.assets.map((a) => [a.name, a.ready])).toEqual([['Cover art', true], ['Master WAV', false], ['Instrumental', false], ['Lyrics', true], ['Press photo', true], ['Credits', true]]);
    expect(r.registrations.map((g) => [g.name, g.status])).toEqual([['PRO', 'confirmed'], ['MLC', 'needsYou'], ['SoundExchange owner', 'confirmed'], ['SoundExchange artist', 'prepared'], ['Copyright Office', 'notStarted']]);
    expect(r.blockers).toHaveLength(3);
    await page.goto('/releases/rel_glasshouse');
    await expect(page.getByRole('heading', { name: 'Glasshouse', level: 1 })).toBeVisible();
    await expect(page.getByText('Fri, Mar 5, 2027')).toBeVisible();
  });

  test('an approved date plan moves the release for the whole label, and undo moves it back', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    const proposal = { id: 'plan_date_rel_glasshouse', type: 'plan', title: 'Move Glasshouse to Mar 19', agent: 'Label Head', due: 'Jan 22', impact: '10 tasks move 14 days',
      risk: 'dueSoon', href: '/releases/rel_glasshouse', releaseId: 'rel_glasshouse', newDate: '2027-03-19' };
    expect((await page.request.post('/api/approvals', { data: { proposal } })).status()).toBe(200);
    expect((await glasshouse(page)).date).toBe('2027-03-05'); // a plan changes nothing until it's approved
    expect((await page.request.post(`/api/approvals/${proposal.id}/decision`, { data: { action: 'approve' } })).status()).toBe(200);
    const moved = await glasshouse(page);
    expect(moved.date).toBe('2027-03-19');
    expect(moved.phases.map((p) => p.iso).slice(0, 3)).toEqual(['2026-11-06', '2027-01-22', '2027-02-05']); // "Now" stays put

    const jana = await (await browser.newContext()).newPage();
    await signIn(jana, USERS.jana);
    await jana.goto('/releases/rel_glasshouse');
    await expect(jana.getByText('Fri, Mar 19, 2027')).toBeVisible();
    await expect(jana.getByText('Jan 22').first()).toBeVisible();

    await page.request.delete(`/api/approvals/${proposal.id}/decision`);
    expect((await glasshouse(page)).date).toBe('2027-03-05');
  });

  test('payees and other labels see no runbooks', async ({ page, browser }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    expect((await page.request.get('/api/releases')).status()).toBe(403);
    expect((await page.request.get('/api/releases/rel_glasshouse')).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    expect(ReleasesResponse.parse(await (await harbor.request.get('/api/releases')).json()).items).toEqual([]);
    expect((await harbor.request.get('/api/releases/rel_glasshouse')).status()).toBe(404);
  });
});

test.describe('contracts (live)', () => {
  const contracts = async (page: import('@playwright/test').Page) => ContractsResponse.parse(await (await page.request.get('/api/contracts')).json());

  test('agreements, signatures and key dates come from the database', async ({ page }) => {
    await signIn(page, USERS.owner);
    await page.request.delete('/api/approvals/apr_producer/decision'); // start from an open approval
    const c = await contracts(page);
    expect(c.summary).toBe('10 active · 1 waiting on signatures · next key date Jan 9');
    expect(c.contracts.map((x) => [x.id, x.template, x.sig, x.date])).toEqual([
      ['ct_producer', 'Northline producer v3 · 2 edits', 'Waiting on you', 'Nov 9'], ['ct_artist_kesi', 'Northline artist v2', 'Signed', 'Mar 6, 2029'],
      ['ct_band', 'Northline artist v2', 'Signed', 'Jan 9'], ['ct_feature', 'Northline feature v1', 'Signed', null],
      ['ct_split_gh', 'Split sheet v1', '1 of 2 signed', null], ['ct_mix_nb', 'Northline producer v3 · 1 edit', 'Signed', null], ['ct_distribution', 'Third party · reviewed', 'Signed', 'Aug 1'],
      ['ct_admin_lh', 'Northline administration v1', 'Signed', 'Jan 9'], ['ct_admin_kv', 'Northline administration v1', 'Signed', 'Mar 6, 2029'], ['ct_split_nb', 'Split sheet v1', 'Signed', null],
    ]);
    expect(c.contracts.find((x) => x.id === 'ct_split_gh')).toMatchObject({ parties: 'Kesi, Marco', terms: '75 / 25' });
    expect(c.contracts.find((x) => x.id === 'ct_band')?.parties).toBe('The Low Hours (3)');
    expect(c.templates.map((t) => t.id)).toEqual(['artist', 'producer', 'feature', 'split', 'publishing', 'co-publishing', 'admin', 'sync']);
  });

  test('approving the producer agreement signs for the label; it then waits on Marco', async ({ page }) => {
    await signIn(page, USERS.owner);
    await page.request.delete('/api/approvals/apr_producer/decision');
    expect((await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve', acceptWarnings: 'Playbook differences reviewed' } })).status()).toBe(200);
    const c = await contracts(page);
    expect(c.contracts[0]).toMatchObject({ id: 'ct_producer', sig: '0 of 1 signed', sigState: 'partial', date: null });
    expect(c.summary).toBe('10 active · 0 waiting on signatures · next key date Jan 9');
    await page.request.delete('/api/approvals/apr_producer/decision');
    expect((await contracts(page)).contracts[0].sig).toBe('Waiting on you');
  });

  test('a contract sent for review is saved for the label and audited', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    await page.goto('/contracts');
    await page.getByRole('button', { name: 'Upload a contract for review' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'Sync offer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Legal Agent is reviewing Sync offer.pdf' })).toBeVisible();
    const jana = await (await browser.newContext()).newPage();
    await signIn(jana, USERS.jana);
    await jana.goto('/contracts');
    await expect(jana.getByRole('status').filter({ hasText: 'Legal Agent is reviewing Sync offer.pdf' })).toBeVisible();
    const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
    const audit = await db`SELECT data FROM audit_events WHERE kind = 'contract_review.requested'`;
    await db.end();
    expect(audit).toEqual([{ data: { fileName: 'Sync offer.pdf' } }]);
  });

  test('payees and other labels see no contracts', async ({ page, browser }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    for (const path of ['/api/contracts', '/api/contracts/templates/artist']) expect((await page.request.get(path)).status()).toBe(403);
    expect((await page.request.post('/api/contracts/reviews', { data: { fileName: 'x.pdf' } })).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    const c = await contracts(harbor);
    expect([c.contracts, c.templates, c.reviews]).toEqual([[], [], []]);
    expect((await harbor.request.get('/api/contracts/templates/artist')).status()).toBe(404);
  });
});

test.describe('roster (live)', () => {
  const roster = async (page: import('@playwright/test').Page) => RosterResponse.parse(await (await page.request.get('/api/roster')).json());

  test('each card is worked out from the catalog, contracts, statements, payouts and releases', async ({ page }) => {
    await signIn(page, USERS.owner);
    await page.request.delete('/api/approvals/apr_producer/decision');
    const r = await roster(page);
    expect(r.map((a) => [a.name, a.type, a.genre, a.releases, a.contract])).toEqual([
      ['Kesi Vale', 'Solo artist', 'R&B', 2, 'Artist agreement · Signed'],
      ['The Low Hours', 'Band · 3 members', 'Indie rock', 1, 'Band agreement · Signed'],
      ['Marco Dela', 'Producer and writer', 'R&B', 0, 'Producer agreement · Waiting on you'],
    ]);
    // The countdown moves with the calendar, so only its shape is checked.
    expect(r[0].open).toMatch(/^Glasshouse release in \d+ (weeks|days?)$|^Glasshouse releases today$/);
    expect(r.map((a, i) => [i === 0 ? 'Glasshouse' : a.open, a.href])).toEqual([
      ['Glasshouse', '/releases/rel_glasshouse'], ['Theo Lind’s tax form expires Dec 31', '/money/payouts'],
      ['Producer agreement needs your eyes', '/approvals/apr_producer'],
    ]);
    expect([r[0].income, r[2].income]).toEqual([1102400, 0]); // Low Light isn't released, so it earns nothing
    await page.goto('/roster');
    await expect(page.getByRole('heading', { name: 'Kesi Vale', level: 2 })).toBeVisible();
  });

  test('once the producer agreement is approved, Marco’s card moves on', async ({ page }) => {
    await signIn(page, USERS.owner);
    await page.request.delete('/api/approvals/apr_producer/decision');
    await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve', acceptWarnings: 'Playbook differences reviewed' } });
    expect((await roster(page))[2]).toMatchObject({ contract: 'Producer agreement · 0 of 1 signed', open: 'Nothing open' });
    await page.request.delete('/api/approvals/apr_producer/decision');
  });

  test('payees and other labels see no roster', async ({ page, browser }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    expect((await page.request.get('/api/roster')).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    expect((await roster(harbor)).map((a) => a.name)).toEqual(['Mara Quill']); // only its own artist
  });
});

test.describe('funding (live)', () => {
  test('cards and the comparison are worked out from the offers’ terms', async ({ page }) => {
    await signIn(page, USERS.owner);
    const f = FundingResponse.parse(await (await page.request.get('/api/funding')).json());
    expect(f.items.map((i) => [i.id, i.title, i.cost, i.permanent])).toEqual([
      ['fund_grant', 'State arts council project grant', 'Nothing to repay', false],
      ['fund_advance', '$8,000 for 60% of streaming until repaid', 'About $960, 14 months', false],
      ['fund_sale', '$15,000 for 50% of one album, forever', 'About $12,000 over 5 yrs', true],
    ]);
    expect(f.applications).toEqual([expect.objectContaining({ id: 'apr_grant', status: 'Draft 80% done', due: 'Nov 15' })]);
    const o = OffersResponse.parse(await (await page.request.get('/api/funding/offers?income=26400')).json());
    expect(o.advance).toMatchObject({ months: 7, cost: 96000 });
    expect(o.sale.offer.album).toBe('Velvet Hours');
    await page.goto('/funding/offers/compare');
    await expect(page.getByText('About 14 months')).toBeVisible();
  });

  test('dismissing, declining and questions are saved for the label and audited', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    await page.goto('/funding');
    await page.getByRole('button', { name: 'Dismiss $15,000 for 50% of one album, forever' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'suggest it again' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '$15,000 for 50% of one album, forever' })).toHaveCount(0); // still gone after a reload
    await page.getByRole('button', { name: 'Dismiss State arts council project grant' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('heading', { name: 'State arts council project grant' })).toBeVisible();
    await page.request.delete('/api/funding/fund_sale/dismiss'); // bring the sale back to compare
    await page.goto('/funding/offers/compare');
    await page.getByRole('button', { name: 'Decline the sale' }).first().click();
    await expect(page.getByText('Sale declined. Finance Agent will draft a short reply for you to send.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Request more info' }).click();
    await page.getByLabel('Your question').fill('Can the sale include a buy-back after 5 years?');
    await page.getByRole('button', { name: 'Save question' }).click();
    await expect(page.getByText('Saved. Finance Agent drafts the email').first()).toBeVisible();

    const jana = await (await browser.newContext()).newPage();
    await signIn(jana, USERS.jana);
    const o = OffersResponse.parse(await (await jana.request.get('/api/funding/offers')).json());
    expect(o.declined).toBe(true);
    expect(o.questions.map((q) => q.text)).toEqual(['Can the sale include a buy-back after 5 years?']);
    await jana.goto('/funding/offers/compare');
    await expect(jana.getByRole('button', { name: 'Decline the sale' }).first()).toBeDisabled();
    const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
    const audit = await db`SELECT kind, ref FROM audit_events WHERE kind LIKE 'funding.%' ORDER BY id`;
    await db.end();
    expect(audit.map((r) => [r.kind, r.ref])).toEqual([['funding.dismissed', 'fund_sale'], ['funding.dismissed', 'fund_grant'], ['funding.restored', 'fund_grant'], ['funding.restored', 'fund_sale'], ['funding.declined', 'fund_sale'], ['funding.question', 'offers']]);
  });

  test('payees and other labels see no funding', async ({ page, browser }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    for (const path of ['/api/funding', '/api/funding/offers']) expect((await page.request.get(path)).status()).toBe(403);
    expect((await page.request.post('/api/funding/fund_grant/dismiss')).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    expect(FundingResponse.parse(await (await harbor.request.get('/api/funding')).json()).items).toEqual([]);
    expect((await harbor.request.get('/api/funding/offers')).status()).toBe(404);
    expect((await harbor.request.post('/api/funding/fund_sale/dismiss')).status()).toBe(404);
  });
});

test.describe('activity (live)', () => {
  const depts = async (page: import('@playwright/test').Page) => DepartmentsResponse.parse(await (await page.request.get('/api/departments')).json());

  test('departments, the team and agent history come from the database', async ({ page }) => {
    await signIn(page, USERS.owner);
    const d = await depts(page);
    expect(d.departments).toHaveLength(14);
    expect(d.departments.find((x) => x.id === 'royalties')).toMatchObject({ agent: 'Royalties Agent', autonomy: 'draft_and_wait', spendCap: 5000, stateLabel: 'working', personId: null });
    expect(d.departments.find((x) => x.id === 'marketing')).toMatchObject({ agent: 'Not active', autonomy: null, phase: 2 });
    expect(d.team.map((t) => [t.name, t.role])).toEqual(expect.arrayContaining([['Jana', 'Owner'], ['Priya Shah', 'Rights lead']]));
    const a = ActivityResponse.parse(await (await page.request.get('/api/activity')).json());
    expect(a.find((e) => e.id === 'RUN-88119')).toMatchObject({ kind: 'Flag', when: 'Nov 6, 8:40', who: 'Audit Agent' });
  });

  test('a change is saved for the label, refused where the work must wait, and shows in the activity log', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    const priya = (await depts(page)).team.find((t) => t.name === 'Priya Shah')!;
    expect((await page.request.patch('/api/departments/legal', { data: { autonomy: 'act_within_limits' } })).status()).toBe(409);
    expect((await page.request.patch('/api/departments/rights', { data: { personId: priya.id } })).status()).toBe(200);
    await page.goto('/departments');
    await page.getByRole('button', { name: /^Royalties/ }).click();
    await page.getByRole('radio', { name: 'Suggest' }).check();
    await expect(page.getByRole('status').filter({ hasText: 'Royalties is now set to Suggest.' })).toBeVisible();

    const jana = await (await browser.newContext()).newPage();
    await signIn(jana, USERS.jana);
    const d = await depts(jana);
    expect(d.departments.find((x) => x.id === 'royalties')?.autonomy).toBe('suggest');
    expect(d.departments.find((x) => x.id === 'rights')?.personId).toBe(priya.id);
    const log = ActivityResponse.parse(await (await jana.request.get('/api/activity')).json());
    expect(log.slice(0, 2).map((e) => [e.kind, e.text, e.dept])).toEqual([['Edit', 'Set Royalties to Suggest', 'Royalties'], ['Edit', 'Handed Rights to Priya Shah', 'Rights']]);
    await jana.goto('/activity');
    await expect(jana.getByText('Set Royalties to Suggest')).toBeVisible();
  });

  test('payees and other labels see no departments or activity', async ({ page, browser }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    for (const path of ['/api/departments', '/api/activity']) expect((await page.request.get(path)).status()).toBe(403);
    expect((await page.request.patch('/api/departments/royalties', { data: { autonomy: 'suggest' } })).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    expect((await depts(harbor)).departments).toEqual([]);
    const log = ActivityResponse.parse(await (await harbor.request.get('/api/activity')).json());
    expect(log.every((e) => !e.text.includes('Royalties') && !e.id.startsWith('RUN-'))).toBe(true);
    expect((await harbor.request.patch('/api/departments/royalties', { data: { autonomy: 'suggest' } })).status()).toBe(404);
  });
});

test.describe('settings (live)', () => {
  const theme = { background: '#0f1a1c', surface: '#13221f', brand: '#1d4a4f', primary: '#e2b33c', text: '#e8f0ef' }; // lint-allow-hex: tenant data from 5i

  test('settings, routing and integrations come from the database; the minimum payout from payouts', async ({ page }) => {
    await signIn(page, USERS.owner);
    const st = SettingsResponse.parse(await (await page.request.get('/api/settings')).json());
    expect(st.config).toEqual({ name: 'Northline Records', country: 'US', profile: 'Small label', statementPeriod: 'Monthly, artists quarterly', minimumPayout: 2500, spendCap: 30000,
      defaultAutonomy: expect.any(String), publishingMode: expect.any(String) });
    expect(st.routing.map((r) => [r.type, r.cap])).toEqual([['money', 'Over $0'], ['signature', 'Always'], ['filing', 'Always'], ['public', 'Always'], ['plan', 'Over $250']]);
    expect(st.integrations.find((i) => i.id === 'accounting')).toMatchObject({ state: 'err', status: 'Token expired' });
    const res = await page.request.post('/api/settings/integrations/soundexchange/connect');
    expect(res.status()).toBe(409);
    expect((await res.json()).message).toBe('Connecting SoundExchange needs its account set up first. It arrives with Stage 1.');
  });

  test('a label reads its licensee’s theme but can’t publish it; the licensee’s owner can, checked for contrast', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    const t = ThemeResponse.parse(await (await page.request.get('/api/settings/theme')).json());
    expect(t).toMatchObject({ theme, canPublish: false, published: null, tenant: { name: 'Harbor Sound', subTenants: [{ name: 'Harbor Sound', artists: 1 }, { name: 'Northline Records', artists: 3 }] } });
    expect((await page.request.post('/api/settings/theme', { data: { theme } })).status()).toBe(403);

    const lic = await (await browser.newContext()).newPage();
    await signIn(lic, USERS.licensee);
    expect((await lic.request.post('/api/settings/theme', { data: { theme: { ...theme, text: '#1a1a1a' } } })).status()).toBe(409); // lint-allow-hex: test data
    await lic.goto('/settings/white-label');
    await lic.getByLabel('Primary action', { exact: true }).fill('#f0c050'); // lint-allow-hex: test data
    await lic.getByRole('button', { name: 'Publish theme' }).click();
    await expect(lic.getByRole('status').filter({ hasText: 'Published for Harbor Sound' })).toBeVisible();
    const after = ThemeResponse.parse(await (await page.request.get('/api/settings/theme')).json());
    expect(after.theme.primary).toBe('#f0c050'); // lint-allow-hex: test data
    expect(after.published?.by).toBe('e2e-licensee');
    // Once published, everyone in the licensee's labels gets it, payees included.
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#f0c050'); // lint-allow-hex: test data
    const marco = await (await browser.newContext()).newPage();
    await signIn(marco, USERS.payee, { into: 'Northline Records' });
    await marco.goto('/portal');
    expect(await marco.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#f0c050'); // lint-allow-hex: test data
    await expect(marco.getByText('Paid by Northline Records')).toBeVisible();
  });

  test('payees and other labels', async ({ page, browser }) => {
    await signIn(page, USERS.payee, { into: 'Northline Records' });
    for (const path of ['/api/settings', '/api/settings/theme']) expect((await page.request.get(path)).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    const st = SettingsResponse.parse(await (await harbor.request.get('/api/settings')).json());
    expect(st.config.name).toBe('Harbor Sound');
    expect(st.integrations).toEqual([]);
  });
});

test('Home’s money row is read from the same tables as the money screens', async ({ page }) => {
  await signIn(page, USERS.owner);
  const h = HomeResponse.parse(await (await page.request.get('/api/home')).json());
  // Oct income (all six sources), the October batch, what October recouped, and unclaimed money.
  expect(h.numbers).toMatchObject({ income: 1428640, owed: 124018, recouped: 460000, unclaimed: 31240 });
  // Forecast: the Sep and Oct average for three months, less the Nov 10 and Jan 15 payouts.
  expect(h.numbers.cash90).toBe(Math.round(((1210712 + 1428640) / 2) * 3) - 124018 - 690415);
  expect(h.numberNotes).toEqual({ period: 'Oct', income: 'Oct, 6 sources', owed: '6 payees', owedApprovalId: 'apr_payout_oct',
    recouped: 'Velvet Hours fully recouped', cash90: 'Recent average, less payouts due', unclaimed: '2 sources to claim' });
  await page.goto('/');
  await expect(page.getByText('Oct, 6 sources').first()).toBeVisible();
});

test('⌘K searches the signed-in label’s own data', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  const hits = async (p: import('@playwright/test').Page, q: string) => SearchResponse.parse(await (await p.request.get(`/api/search?q=${encodeURIComponent(q)}`)).json()).items;
  expect((await hits(page, 'glasshouse')).map((i) => i.id)).toEqual(expect.arrayContaining(['r-glasshouse', 'rel-rel_glasshouse']));
  expect((await hits(page, 'velvet')).map((i) => i.id)).toEqual(expect.arrayContaining(['st-ST-2026-10-KV']));
  expect((await hits(page, 'mara')).map((i) => i.label)).not.toContain('Mara Quill');
  const harbor = await (await browser.newContext()).newPage();
  await signIn(harbor, USERS.harbor);
  expect((await hits(harbor, 'tidal')).map((i) => i.label)).toContain('Tidal Lines');
  expect((await hits(harbor, 'glasshouse')).filter((i) => i.group !== 'Go to')).toEqual([]);
  await harbor.goto('/');
  const bar = harbor.getByRole('combobox', { name: 'Search or tell me a goal' });
  await expect(async () => { await harbor.keyboard.press('Control+k'); await expect(bar).toBeVisible({ timeout: 1000 }); }).toPass(); // the shortcut works once the page is interactive
  await bar.fill('tidal');
  await expect(harbor.getByRole('option', { name: /Tidal Lines/ }).first()).toBeVisible();
});

test('onboarding answers are saved as you go, and finishing sets the label up within each department’s limits', async ({ page }) => {
  await signIn(page, USERS.owner);
  const answers = { profile: 'small_label', name: 'Northline Records', country: 'Canada', distributor: 'TuneCore', catalogFile: null, pro: { status: 'affiliated', org: 'SOCAN' }, autonomy: 'act_within_limits' };
  expect((await page.request.put('/api/onboarding', { data: { answers } })).status()).toBe(200);
  expect(OnboardingResponse.parse(await (await page.request.get('/api/onboarding')).json())).toMatchObject({ answers: { distributor: 'TuneCore' }, completed: false });
  await page.goto('/onboarding/name');
  await expect(page.getByLabel('Name')).toHaveValue('Northline Records'); // read back from the server
  expect(OnboardingResponse.parse(await (await page.request.put('/api/onboarding', { data: { answers, complete: true } })).json()).completed).toBe(true);
  const st = SettingsResponse.parse(await (await page.request.get('/api/settings')).json());
  expect(st.config).toMatchObject({ profile: 'Small label', country: 'CA' });
  const d = DepartmentsResponse.parse(await (await page.request.get('/api/departments')).json()).departments;
  expect(d.find((x) => x.id === 'metadata')?.autonomy).toBe('act_within_limits');
  expect(d.find((x) => x.id === 'legal')?.autonomy).toBe('draft_and_wait'); // signatures always wait for you
  expect(d.find((x) => x.id === 'marketing')?.autonomy).toBeNull(); // Phase 2 untouched
});

test('a licensee owner switches into its labels and acts there as an owner', async ({ page }) => {
  await signIn(page, USERS.licensee);
  await page.goto('/');
  const sw = page.getByRole('button', { name: /switch workspace/ });
  await expect(async () => { await sw.click(); await expect(page.getByRole('list', { name: 'Switch workspace' })).toBeVisible({ timeout: 1000 }); }).toPass();
  await page.getByRole('list', { name: 'Switch workspace' }).getByRole('button', { name: 'Northline Records' }).click();
  await expect(page.getByRole('button', { name: /^Label\s*Northline Records/ })).toBeVisible(); // the page reloads in the new label
  expect((await (await page.request.get('/api/approvals')).json()).items.length).toBeGreaterThan(0);
  expect((await page.request.post('/api/session/tenant', { data: { tenantId: '00000000-0000-0000-0000-000000000000' } })).status()).toBe(403);
});

test('an owner invites a payee, who signs in to their own portal; a team member can’t invite', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  await page.goto('/settings/team');
  await page.getByRole('textbox', { name: 'Email' }).fill('ari@monroe.example');
  await page.getByRole('combobox', { name: /^Who are they/ }).selectOption('payee');
  await page.getByRole('radio', { name: /Someone already in/ }).check();
  await page.getByRole('combobox', { name: /^Payee/ }).selectOption('ari-monroe');
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invitation emailed to ari@monroe.example' })).toBeVisible();
  await expect(page.getByRole('row', { name: /ari@monroe\.example/ })).toContainText('Not signed in yet');
  const mail = JSON.parse(readFileSync(path.join(MAILBOX, 'ari@monroe.example.invite.json'), 'utf8')) as { subject: string; text: string };
  expect(mail.subject).toBe('Northline Records invited you to Indie SRVCS');
  expect(mail.text).toMatch(/set up your own workspace first/);

  // Ari gets their own workspace first, with every tool, and Northline is a connection.
  const ari = await (await browser.newContext()).newPage();
  await signIn(ari, 'ari@monroe.example');
  await expect(ari).toHaveURL(/\/onboarding/);
  const me = SessionResponse.parse(await (await ari.request.get('/api/session/tenant')).json());
  expect(me.workspaces).toEqual([expect.objectContaining({ name: 'My workspace', role: 'owner' })]);
  expect(me.connections).toEqual([expect.objectContaining({ name: 'Northline Records' })]);
  const answers = { profile: 'solo', name: 'Ari Monroe', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_yet' }, autonomy: 'draft_and_wait' };
  expect((await ari.request.put('/api/onboarding', { data: { answers, complete: true } })).status()).toBe(200);
  await ari.goto('/');
  const sidebar = ari.getByRole('complementary', { name: 'Sidebar' });
  for (const tool of ['Releases', 'Catalog', 'Money', 'Splits', 'Contracts', 'Rights', 'Roster']) await expect(sidebar.getByRole('link', { name: tool })).toBeVisible();
  expect((await ari.request.get('/api/catalog')).status()).toBe(200);
  expect(CatalogResponse.parse(await (await ari.request.get('/api/catalog')).json()).recordings).toEqual([]); // their own, not Northline's
  await sidebar.getByRole('link', { name: 'Labels I work with' }).click();
  await ari.getByRole('button', { name: 'Open what Northline Records pays you' }).click();
  await expect(ari).toHaveURL(/\/portal/);
  await expect(ari.getByRole('heading', { name: /^Hi Ari\./ })).toBeVisible();
  await ari.getByRole('button', { name: 'Back to Ari Monroe' }).click();
  await expect(ari).toHaveURL(/\/$/);
  await expect(sidebar.getByText('Ari Monroe', { exact: true })).toBeVisible();

  const st = SettingsResponse.parse(await (await page.request.get('/api/settings')).json());
  expect(st.invites.find((i) => i.email === 'ari@monroe.example')).toMatchObject({ role: 'payee', payee: 'Ari Monroe', joined: true });
  expect((await page.request.delete('/api/settings/invites?email=ari@monroe.example')).status()).toBe(409); // already joined

  const priya = await (await browser.newContext()).newPage();
  await signIn(priya, 'priya@northline.example');
  expect(SettingsResponse.parse(await (await priya.request.get('/api/settings')).json()).canInvite).toBe(false);
  expect((await priya.request.post('/api/settings/invites', { data: { email: 'x@y.example', role: 'team' } })).status()).toBe(403);
});

test('documents: the label’s team prepares and downloads; other labels and payees can’t; only owners switch AI', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  await page.goto('/rights/documents');
  await page.getByRole('button', { name: 'Prepare: Split sheet for Glasshouse' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Split sheet for Glasshouse prepared, version' })).toBeVisible();
  const view = DocumentsResponse.parse(await (await page.request.get('/api/rights/documents')).json());
  const doc = view.subjects.find((x) => x.subject === 'work' && x.id === 'glasshouse')!.docs.find((d) => d.kind === 'split_sheet')!.latest!;
  expect(doc.gaps.map((g) => g.field)).toEqual(expect.arrayContaining(['PRO', 'IPI', 'Signatures']));
  expect(view.artists).toEqual(expect.arrayContaining(['Kesi Vale', 'The Low Hours']));
  const pdf = await page.request.get(`/api/rights/documents/${doc.id}/file`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const harbor = await (await browser.newContext()).newPage();
  await signIn(harbor, USERS.harbor);
  expect((await harbor.request.get(`/api/rights/documents/${doc.id}/file`)).status()).toBe(404);
  const theirs = DocumentsResponse.parse(await (await harbor.request.get('/api/rights/documents')).json());
  expect(theirs.subjects.some((x) => x.id === 'glasshouse')).toBe(false);

  const payee = await (await browser.newContext()).newPage();
  await signIn(payee, USERS.payee, { into: 'Northline Records' });
  expect((await payee.request.get('/api/rights/documents')).status()).toBe(403);
  expect((await payee.request.get(`/api/rights/documents/${doc.id}/file`)).status()).toBe(403);

  const priya = await (await browser.newContext()).newPage();
  await signIn(priya, 'priya@northline.example');
  expect((await priya.request.post('/api/rights/documents', { data: { kind: 'label_copy', subject: 'release', id: 'rel_nightbus' } })).status()).toBe(200);
  expect((await priya.request.post('/api/rights/documents/ai', { data: { on: true } })).status()).toBe(403);
});

test('sign-up: staff make a code; a new artist signs up, is taken through onboarding, and gets their own personal label', async ({ page, browser }) => {
  await signIn(page, USERS.jana); // Indie SRVCS staff in the sample world
  const made = await page.request.post('/api/admin/invite-codes', { data: { note: 'E2E solo artist', maxUses: 1, expiresInDays: 7 } });
  expect(made.status()).toBe(200);
  const { code } = (await made.json()) as { code: string };
  expect(code).toMatch(/^INDIE-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const artist = await (await browser.newContext()).newPage();
  const email = `e2e-solo-${Date.now()}@artist.example`;
  await artist.goto(`/sign-up?code=${code}`);
  await expect(artist.getByLabel('Invite code')).toHaveValue(code);
  await artist.getByLabel('Email').fill(email);
  await artist.getByRole('button', { name: 'Create my account' }).click();
  await expect(artist.getByRole('status')).toContainText('Check your email for a sign-in link');
  const { url } = JSON.parse(readFileSync(path.join(MAILBOX, `${email}.json`), 'utf8')) as { url: string };
  await artist.goto(url);
  await artist.getByRole('button', { name: 'Sign in' }).click();
  await expect(artist).toHaveURL(/\/onboarding/); // a new workspace is set up first
  await artist.goto('/approvals');
  await expect(artist).toHaveURL(/\/onboarding/);

  const answers = { profile: 'solo', name: 'Rue Nova', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_yet' }, autonomy: 'draft_and_wait' };
  expect((await artist.request.put('/api/onboarding', { data: { answers, complete: true } })).status()).toBe(200);
  await artist.goto('/');
  await expect(artist).toHaveURL(/\/$/);
  const sidebar = artist.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.getByText('Personal label', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('Rue Nova', { exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Roster' })).toBeVisible(); // every kind gets every tool
  await expect(sidebar.getByRole('link', { name: 'Invite codes' })).toHaveCount(0);
  expect((await (await artist.request.get('/api/approvals')).json()).items).toHaveLength(0); // nothing of anyone else's
  expect((await artist.request.get('/api/admin/invite-codes')).status()).toBe(403);

  // The code had one use.
  const late = await (await browser.newContext()).newPage();
  await late.goto(`/sign-up?code=${code}`);
  await late.getByLabel('Email').fill('late@artist.example');
  await late.getByRole('button', { name: 'Create my account' }).click();
  await expect(late.getByRole('main').getByRole('alert')).toContainText('used up');
  await page.goto('/admin/invite-codes');
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('link', { name: 'Invite codes' })).toBeVisible(); // staff only
  await expect(page.getByRole('row', { name: /E2E solo artist/ })).toContainText(email);
});

/** Signs up with a code in a fresh browser and opens the sign-in link (lands in setup). */
async function signUp(browser: import('@playwright/test').Browser, code: string, email: string) {
  const p = await (await browser.newContext()).newPage();
  await p.goto(`/sign-up?code=${code}`);
  await p.getByLabel('Email').fill(email);
  await p.getByRole('button', { name: 'Create my account' }).click();
  await expect(p.getByRole('status')).toContainText('Check your email for a sign-in link');
  const { url } = JSON.parse(readFileSync(path.join(MAILBOX, `${email}.json`), 'utf8')) as { url: string };
  await p.goto(url);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p).toHaveURL(/\/onboarding/);
  return p;
}

test('a band signs up and adds a bandmate as co-owner; label services add a client with their own workspace', async ({ page, browser }) => {
  await signIn(page, USERS.jana);
  const code = ((await (await page.request.post('/api/admin/invite-codes', { data: { note: 'E2E band and services', maxUses: 2, expiresInDays: 7 } })).json()) as { code: string }).code;
  const stamp = Date.now();

  // A band: setup starts blank (never the sample label), and a bandmate becomes a co-owner.
  const band = await signUp(browser, code, `e2e-band-${stamp}@band.example`);
  const fresh = OnboardingResponse.parse(await (await band.request.get('/api/onboarding')).json());
  expect(fresh).toMatchObject({ answers: null, live: true, defaults: { name: '', distributor: null, catalogFile: null } });
  const mate = `e2e-mate-${stamp}@band.example`;
  const bandAnswers = { profile: 'band', name: 'The Tide Lines', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_sure' }, autonomy: 'draft_and_wait', members: [mate] };
  expect((await band.request.put('/api/onboarding', { data: { answers: bandAnswers, complete: true } })).status()).toBe(200);
  const mateP = await (await browser.newContext()).newPage();
  await signIn(mateP, mate);
  const mateBar = mateP.getByRole('complementary', { name: 'Sidebar' });
  await expect(mateBar.getByText('Personal label', { exact: true })).toBeVisible();
  await expect(mateBar.getByText('The Tide Lines', { exact: true })).toBeVisible();
  expect(SettingsResponse.parse(await (await mateP.request.get('/api/settings')).json()).canInvite).toBe(true); // a co-owner

  // Label services: become a parent, add a client, work inside it as owner.
  const svc = await signUp(browser, code, `e2e-svc-${stamp}@services.example`);
  const svcAnswers = { profile: 'services', name: 'Harbor Light Services', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_sure' }, autonomy: 'draft_and_wait' };
  expect((await svc.request.put('/api/onboarding', { data: { answers: svcAnswers, complete: true } })).status()).toBe(200);
  await svc.goto('/clients');
  await svc.getByLabel('Client name').fill('Rue Nova');
  await svc.getByRole('button', { name: 'Add client' }).click();
  await expect(svc.getByRole('status')).toContainText('Rue Nova added');
  await svc.getByRole('button', { name: 'Open Rue Nova’s workspace' }).click();
  await expect(svc.getByRole('complementary', { name: 'Sidebar' }).getByText('Rue Nova', { exact: true })).toBeVisible();
  expect(SettingsResponse.parse(await (await svc.request.get('/api/settings')).json()).canInvite).toBe(true); // services act as owners in the client
  expect((await (await svc.request.get('/api/approvals')).json()).items).toHaveLength(0);

  // A band can have clients too (every tool for every kind), and sees only its own, never the services company's.
  expect(await (await band.request.get('/api/clients')).json()).toMatchObject({ clients: [], canAdd: true }); // any workspace can have clients
  const added = await band.request.post('/api/clients', { data: { name: 'Side Project', kind: 'artist' } });
  expect((await added.json()).clients.map((x: { name: string }) => x.name)).toEqual(['Side Project']);
  await band.goto('/');
  await expect(band.getByRole('complementary', { name: 'Sidebar' }).getByRole('link', { name: 'Clients' })).toBeVisible();
});

test('codes: an owner sets prefixes and assigns the next ISRC and UPC; an artist who isn’t a payee yet can be invited', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  const codes = CodesResponse.parse(await (await page.request.put('/api/catalog/codes', { data: { isrcPrefix: 'US-ZZ9', gs1Prefix: '0360002' } })).json());
  expect(codes.nextUpc).toBe('036000200010');
  await page.goto('/catalog/recordings?id=low-light');
  await page.getByRole('button', { name: /^Edit/ }).first().click();
  await page.getByRole('button', { name: /^Assign the next ISRC/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Low Light now has ISRC US-ZZ9-' })).toBeVisible();
  const rec = CatalogResponse.parse(await (await page.request.get('/api/catalog')).json()).recordings.find((r) => r.id === 'low-light')!;
  expect(rec.isrc).toBe(codes.nextIsrc);

  expect((await page.request.patch('/api/catalog/releases/rel_glasshouse', { data: { upc: null } })).status()).toBe(200);
  await page.goto('/catalog/releases');
  await page.getByRole('button', { name: 'Assign the next UPC to Glasshouse' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Glasshouse now has UPC 036000200010' })).toBeVisible();

  // A team member can't change the prefixes.
  const priya = await (await browser.newContext()).newPage();
  await signIn(priya, 'priya@northline.example');
  expect((await priya.request.put('/api/catalog/codes', { data: { isrcPrefix: 'US-AAA', gs1Prefix: null } })).status()).toBe(403);

  // Invite an artist who isn't a payee yet; they sign in to their own portal.
  const res = await page.request.post('/api/settings/invites', { data: { email: 'rue@nova.example', role: 'payee', newPayee: { name: 'Rue Nova' } } });
  expect(res.status()).toBe(200);
  expect(SettingsResponse.parse(await res.json()).invites.find((i) => i.email === 'rue@nova.example')).toMatchObject({ role: 'payee', payee: 'Rue Nova' });
  const rue = await (await browser.newContext()).newPage();
  await signIn(rue, 'rue@nova.example', { into: 'Northline Records' });
  await rue.goto('/');
  await expect(rue).toHaveURL(/\/portal/);
});

test('someone signed in before workspaces existed gets theirs on their next visit; everyone can sign out', async ({ page, browser, baseURL }) => {
  // A payee with a session from before: no workspace of their own yet, and no fresh sign-in.
  const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
  const [north] = await db<{ id: string }[]>`SELECT id FROM tenants WHERE slug = 'northline'`;
  await db`INSERT INTO allowlist (email, tenant_id, role) VALUES ('old.session@x.example', ${north.id}, 'payee') ON CONFLICT DO NOTHING`;
  const [u] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES ('old.session@x.example') RETURNING id`;
  await db`INSERT INTO memberships (user_id, tenant_id, role) VALUES (${u.id}, ${north.id}, 'payee')`;
  await db`INSERT INTO sessions (session_token, user_id, expires) VALUES ('old-session-token', ${u.id}, now() + interval '1 hour')`;
  await db.end();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'authjs.session-token', value: 'old-session-token', url: baseURL! }]);
  const old = await ctx.newPage();
  await old.goto('/');
  await expect(old).toHaveURL(/\/onboarding/);
  const me = SessionResponse.parse(await (await old.request.get('/api/session/tenant')).json());
  expect(me.workspaces).toHaveLength(1);
  expect(me.connections.map((c) => c.name)).toEqual(['Northline Records']);

  // Sign out from the portal and from the sidebar.
  await signIn(page, USERS.payee, { into: 'Northline Records' });
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, USERS.owner);
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test('setup is an edit, not a reset: departments set by hand keep their level, Settings shows the chosen default, and any workspace can add clients', async ({ page }) => {
  await signIn(page, USERS.owner);
  const depts = async () => DepartmentsResponse.parse(await (await page.request.get('/api/departments')).json()).departments.filter((d) => d.phase === 1);
  const before = await depts();
  const was = SettingsResponse.parse(await (await page.request.get('/api/settings')).json()).config.defaultAutonomy;
  // Set by hand: anything not on the saved default (a department that can't act alone sits at Draft and wait).
  const custom = before.filter((d) => d.autonomy !== was && !(was === 'act_within_limits' && !d.canAct && d.autonomy === 'draft_and_wait')).map((d) => [d.name, d.autonomy]);
  expect(custom.length).toBeGreaterThan(0); // the sample label has some set by hand
  const ob = OnboardingResponse.parse(await (await page.request.get('/api/onboarding')).json());
  expect(ob.customDepartments).toEqual(custom.map(([n]) => n));

  const answers = { profile: 'small_label', name: 'Northline Records', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_sure' }, autonomy: 'observe', publishing: { mode: 'writers_own' } };
  expect((await page.request.put('/api/onboarding', { data: { answers, complete: true } })).status()).toBe(200);
  const after = await depts();
  for (const [name, level] of custom) expect(after.find((d) => d.name === name)?.autonomy).toBe(level); // kept
  expect(after.filter((d) => !custom.some(([n]) => n === d.name)).map((d) => d.autonomy)).toEqual(after.filter((d) => !custom.some(([n]) => n === d.name)).map(() => 'observe'));
  const st = SettingsResponse.parse(await (await page.request.get('/api/settings')).json());
  expect(st.config).toMatchObject({ defaultAutonomy: 'observe', publishingMode: 'writers_own' });
  await page.goto('/settings/profile');
  await expect(page.getByRole('main')).toContainText('Observe');
  await expect(page.getByRole('main')).toContainText('Writers handle their own');
  // Writers handle their own publishing, so the MLC filing can't be filed as publisher (PUB-02).
  const c = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
  expect(c.items.apr_mlc.results.find((r) => r.id === 'PUB-02')).toMatchObject({ status: 'fail' });

  // Northline is a client of its licensee, so it can't have clients (a band workspace can: see the sign-up test).
  const nl = await (await page.request.get('/api/clients')).json();
  expect(nl).toMatchObject({ canAdd: false });
  expect((await page.request.post('/api/clients', { data: { name: 'Nested', kind: 'artist' } })).status()).toBe(403);
  await page.goto('/clients');
  await expect(page.getByText(/is a client of/)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByRole('link', { name: 'Clients' })).toBeVisible();
});

test('publishing: the MLC filing may be filed because the label administers its writers; without the agreement it can’t', async ({ page }) => {
  await signIn(page, USERS.owner);
  const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
  // An earlier test may have changed the workspace's mode; this one is about "we administer".
  await db`UPDATE label_settings SET publishing_mode = 'we_administer' WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'northline')`;
  const pub02 = async () => ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json()).items.apr_mlc.results.find((r) => r.id === 'PUB-02')!;
  expect(await pub02()).toMatchObject({ status: 'pass', message: 'Every writer has a signed, current publishing or admin agreement with you.' });
  // Un-sign Rue's side of the band's admin agreement: the label may no longer file for The Low Hours' writers.
  await db`UPDATE agreement_parties SET signed_at = NULL WHERE agreement_id = (SELECT id FROM agreements WHERE slug = 'ct_admin_lh')
    AND party_id = (SELECT id FROM parties WHERE slug = 'rue-sato' AND tenant_id = agreement_parties.tenant_id)`;
  expect(await pub02()).toMatchObject({ status: 'fail', message: 'No signed, current publishing or admin agreement with Dana Okafor, Rue Sato and Theo Lind.' });
  // Theo says he handles his own publishing: the label stops filing for him, whatever the agreements say.
  await db`UPDATE agreement_parties SET signed_at = '2025-01-09' WHERE agreement_id = (SELECT id FROM agreements WHERE slug = 'ct_admin_lh')`;
  await db`UPDATE parties SET publishing_mode = 'writers_own' WHERE slug = 'theo-lind'`;
  expect((await pub02()).message).toMatch(/^Theo Lind handles their own publishing/);
  await db`UPDATE parties SET publishing_mode = NULL WHERE slug = 'theo-lind'`;
  expect((await pub02()).status).toBe('pass');
  await db.end();
});

test.describe('tax compliance (live)', () => {
  test('a payee certifies their own form, the team can’t, and the label chooses what a missing form means', async ({ page, browser }) => {
    const me = await (await browser.newContext()).newPage();
    await signIn(me, USERS.payee, { into: 'Northline Records' });
    const res = await me.request.post('/api/portal/tax-form', { data: { form: 'W-9', legalName: 'Marco Dela', tinLast4: '1000', signature: 'Marco Dela' } });
    expect(res.status()).toBe(200);
    expect(PayeeResponse.parse(await res.json()).tax).toMatchObject({ form: 'W-9', label: 'W-9 on file', withholding: 'No withholding', canSubmit: true });
    // A payee can't change the label's policy; the label's people can't sign a payee's form.
    expect((await me.request.put('/api/money/payouts/policy', { data: { missingFormPolicy: 'withhold' } })).status()).toBe(403);
    await signIn(page, USERS.owner);
    expect((await page.request.post('/api/portal/tax-form', { data: { form: 'W-9', legalName: 'X', tinLast4: '1111', signature: 'X' } })).status()).toBe(403);

    const set = async (missingFormPolicy: 'hold' | 'withhold') => PayoutsResponse.parse(await (await page.request.put('/api/money/payouts/policy', { data: { missingFormPolicy } })).json());
    const jules = (p: Awaited<ReturnType<typeof set>>) => p.taxForms.find((t) => t.name === 'Jules Arden')?.withholding;
    expect(jules(await set('withhold'))).toBe('No tax form: 24% backup withholding');
    expect(jules(await set('hold'))).toBe('No tax form: payout held');
    const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
    expect(p.taxForms.find((t) => t.name === 'Theo Lind')?.withholding).toBe('0% under the GB treaty, Article 12');
  });

  test('inviting a payee with no form asks them for one (ROS-02)', async ({ page }) => {
    await signIn(page, USERS.owner);
    expect((await page.request.post('/api/settings/invites', { data: { email: 'new.writer@x.example', role: 'payee', newPayee: { name: 'Nova Writer' } } })).status()).toBe(200);
    const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
    expect(p.requests).toContainEqual({ payeeId: 'nova-writer', kind: 'tax_form' });
  });

  test('the year’s forms are filed only through an approval, and filing ends undo', async ({ page }) => {
    await signIn(page, USERS.owner);
    const year = async () => TaxYearResponse.parse(await (await page.request.get('/api/money/tax/2026')).json());
    const t = await year();
    expect(t.forms1099.map((f) => [f.name, f.royalties, f.tinLast4])).toEqual([['Ari Monroe', 77012, '2373'], ['Dana Okafor', 43524, '1611'], ['Marco Dela', 86130, '1000'], ['Rue Sato', 43525, '5119']]);
    expect(t.forms1042s).toEqual([{ payeeId: 'theo-lind', name: 'Theo Lind', country: 'GB', rateBp: 0, gross: 14191, withheld: 0 }]);
    expect((await page.request.get('/api/money/tax/2026/csv')).status()).toBe(409);
    expect((await page.request.post('/api/money/tax/2026/filed')).status()).toBe(404);

    expect((await page.request.post('/api/money/tax/2026/prepare')).status()).toBe(200);
    expect((await year()).filing.status).toBe('awaiting');
    const c = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
    expect(c.items.tax_2026.results.map((r) => [r.id, r.status])).toEqual([['TAX-01', 'pass'], ['TAX-02', 'pass']]);
    expect((await page.request.post('/api/money/tax/2026/filed')).status()).toBe(409); // not approved yet
    expect((await page.request.post('/api/approvals/tax_2026/decision', { data: { action: 'approve' } })).status()).toBe(200);

    const csv = await (await page.request.get('/api/money/tax/2026/csv')).text();
    expect(csv.trim().split('\n')).toHaveLength(6); // header, four 1099-MISC, one 1042-S
    expect((await page.request.post('/api/money/tax/2026/filed')).status()).toBe(200);
    expect((await year()).filing.status).toBe('filed');
    const undo = await page.request.delete('/api/approvals/tax_2026/decision');
    expect(ApprovalError.parse(await undo.json()).error).toBe('already_executed');
  });
});

test.describe('reserves (live)', () => {
  test('a flag holds income from unpaid batches; the payee sees their held share; release needs approval; forfeit is final', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    const reserves = async () => ReservesResponse.parse(await (await page.request.get('/api/money/reserves')).json());
    expect((await reserves()).items.map((r) => [r.recording, r.status])).toEqual([['Night Bus', 'released']]); // the seeded flag, resolved before the platform

    expect((await page.request.post('/api/money/reserves', { data: { recordingId: 'night-bus', note: 'unusual stream spike on Nov 9' } })).status()).toBe(200);
    expect((await page.request.post('/api/money/reserves', { data: { recordingId: 'night-bus', note: 'again' } })).status()).toBe(409);
    const p = PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json());
    expect(p.batches.filter((b) => b.held).map((b) => [b.id, b.held])).toEqual([['pb-2026-10', 69443], ['pb-2026-q3', 455740]]);
    const c = ApprovalChecksResponse.parse(await (await page.request.get('/api/approvals/checks')).json());
    expect(c.items.apr_payout_oct.results.find((r) => r.id === 'ROY-07')).toMatchObject({ status: 'pass', message: 'Night Bus has an open audit flag. $694.43 of this batch is held in reserve until it’s resolved.' });

    // Paper Moons earns on Velvet Hours, so Marco's October statement holds its share, and Marco sees it.
    expect((await page.request.post('/api/money/reserves', { data: { recordingId: 'paper-moons', note: 'spike' } })).status()).toBe(200);
    const marco = await (await browser.newContext()).newPage();
    await signIn(marco, USERS.payee, { into: 'Northline Records' });
    const st = StatementResponse.parse(await (await marco.request.get('/api/statements/ST-2026-10-MD')).json());
    expect(st.held).toEqual({ amount: 1158, note: '$11.58 held in reserve while Paper Moons is checked for artificial streams.' });
    expect((await marco.request.get('/api/money/reserves')).status()).toBe(403);
    expect((await marco.request.post('/api/money/reserves', { data: { recordingId: 'paper-moons', note: 'x' } })).status()).toBe(403);

    // Real listeners: a release card; the money stays held until it's approved.
    const pm = (await reserves()).items.find((r) => r.recording === 'Paper Moons')!;
    expect((await page.request.post(`/api/money/reserves/${pm.id}/resolve`, { data: { outcome: 'release', note: 'Radio feature' } })).status()).toBe(200);
    const releasing = (await reserves()).items.find((r) => r.id === pm.id)!;
    expect(releasing).toMatchObject({ status: 'releasing', approvalId: expect.stringMatching(/^reserve_/) });
    expect(StatementResponse.parse(await (await marco.request.get('/api/statements/ST-2026-10-MD')).json()).held?.amount).toBe(1158);
    expect((await page.request.post(`/api/approvals/${releasing.approvalId}/decision`, { data: { action: 'approve' } })).status()).toBe(200);
    expect((await reserves()).items.find((r) => r.id === pm.id)).toMatchObject({ status: 'released', heldNow: 0 });
    expect(StatementResponse.parse(await (await marco.request.get('/api/statements/ST-2026-10-MD')).json()).held).toBeUndefined();

    // Artificial streams: forfeited for good.
    const nb = (await reserves()).items.find((r) => r.recording === 'Night Bus' && r.status === 'held')!;
    expect((await page.request.post(`/api/money/reserves/${nb.id}/resolve`, { data: { outcome: 'forfeit', note: 'Bot farm confirmed' } })).status()).toBe(200);
    expect((await page.request.post(`/api/money/reserves/${nb.id}/resolve`, { data: { outcome: 'release', note: 'oops' } })).status()).toBe(409);
    expect((await reserves()).items.find((r) => r.id === nb.id)).toMatchObject({ status: 'forfeited', heldNow: 0 });
    expect(PayoutsResponse.parse(await (await page.request.get('/api/money/payouts')).json()).batches.some((b) => b.held)).toBe(false);
  });
});

test.describe('your own music and splits (live)', () => {
  test('a release split with co-producers; each person signs their own line; writers confirm their own shares; a new version; release changes', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    const add = await page.request.post('/api/catalog/releases', { data: {
      title: 'Harbor Lights', kind: 'single', artist: { name: 'Joe Rivers' }, releaseDate: '2027-02-05', tracks: [{ title: 'Harbor Lights', isrc: 'QZ-XXX-26-00077' }],
    } });
    expect(add.status()).toBe(200);
    const cat = CatalogResponse.parse(await add.json());
    expect(cat.releases.find((r) => r.title === 'Harbor Lights')).toMatchObject({ artist: 'Joe Rivers', kind: 'Single', tracks: 1, date: 'Feb 5, 2027' });
    expect(cat.recordings.find((r) => r.title === 'Harbor Lights')?.isrc).toBe('QZXXX2600077');
    expect((await page.request.post('/api/catalog/releases', { data: { title: 'Copy', kind: 'single', artist: { name: 'X' }, tracks: [{ title: 'x', isrc: 'QZXXX2600077' }] } })).status()).toBe(409);

    // Two producers share the points.
    const terms = { producerBp: 300, artistOfNetBp: 6000, labelOfNetBp: 4000, featureOfArtistBp: 0 };
    const made = await page.request.post('/api/splits', { data: { releaseId: 'harbor-lights', terms, lines: [
      { role: 'producer', party: { name: 'Sam Okoro' }, shareBp: 5000 }, { role: 'producer', party: { name: 'Kai Moss' }, shareBp: 5000 },
    ] } });
    expect(made.status()).toBe(200);
    const { node } = (await made.json()) as { node: string };
    const versions = async (p = page) => SplitVersionsResponse.parse(await (await p.request.get(`/api/splits/${node}/versions`)).json());
    expect((await versions()).open?.lines.map((l) => [l.role, l.name, l.shareBp, l.amount])).toEqual([
      ['artist', 'Joe Rivers', 10000, 5820], ['label', 'Northline Records', 10000, 3880], ['producer', 'Kai Moss', 5000, 150], ['producer', 'Sam Okoro', 5000, 150],
    ]);
    // Shares in a role that don't total 100% can't be saved.
    expect((await page.request.put(`/api/splits/${node}/draft`, { data: { terms, lines: [{ role: 'producer', party: { partyId: 'sam-okoro' }, shareBp: 6000 }] } })).status()).toBe(400);

    expect((await page.request.post(`/api/splits/${node}/send`, { data: {} })).status()).toBe(200);
    expect((await page.request.post(`/api/splits/${node}/sign`, { data: { role: 'label' } })).status()).toBe(200);
    expect((await page.request.post(`/api/splits/${node}/sign`, { data: { role: 'producer', partyId: 'sam-okoro' } })).status()).toBe(403);
    for (const [email, who] of [['sam@okoro.example', 'sam-okoro'], ['kai@moss.example', 'kai-moss'], ['joe@rivers.example', 'joe-rivers']] as const) {
      expect((await page.request.post('/api/settings/invites', { data: { email, role: 'payee', payeeId: who } })).status()).toBe(200);
    }
    const sam = await (await browser.newContext()).newPage();
    await signIn(sam, 'sam@okoro.example', { into: 'Northline Records' });
    expect((await sam.request.post(`/api/splits/${node}/sign`, { data: { role: 'producer', partyId: 'kai-moss' } })).status()).toBe(403); // not Sam's line
    expect((await sam.request.post(`/api/splits/${node}/sign`, { data: { role: 'producer' } })).status()).toBe(200); // Sam's own
    expect((await sam.request.post('/api/catalog/releases', { data: { title: 'Mine', kind: 'single', artist: { name: 'Sam' }, tracks: [{ title: 'x' }] } })).status()).toBe(403);
    for (const email of ['kai@moss.example', 'joe@rivers.example']) {
      const who = await (await browser.newContext()).newPage();
      await signIn(who, email, { into: 'Northline Records' });
      expect((await who.request.post(`/api/splits/${node}/sign`, { data: { role: email.startsWith('kai') ? 'producer' : 'artist' } })).status()).toBe(200);
    }
    let v = await versions();
    expect([v.current?.version, v.open]).toEqual([1, null]);
    expect(SplitNodeResponse.parse(await (await page.request.get(`/api/splits/${node}`)).json()).parties.producer).toBe('Kai Moss and Sam Okoro');

    // Songwriters: Joe 60%, Sam 40%. Sam confirms only his own, in his portal.
    expect((await page.request.put('/api/catalog/recordings/harbor-lights/writers', { data: { writers: [{ party: { partyId: 'joe-rivers' }, shareBp: 6000 }, { party: { partyId: 'sam-okoro' }, shareBp: 4000 }] } })).status()).toBe(200);
    const portal = PayeeResponse.parse(await (await sam.request.get('/api/portal/sam-okoro')).json());
    const song = portal.splits.find((x) => x.title === 'Harbor Lights (song)')!;
    expect(song).toMatchObject({ terms: '40%', status: 'waiting', songId: expect.any(String) });
    expect((await sam.request.post(`/api/catalog/recordings/${song.songId}/writers/confirm`)).status()).toBe(200);
    expect((await versions()).songs[0].writers.map((w) => [w.name, w.confirmed])).toEqual([['Joe Rivers', false], ['Sam Okoro', true]]);

    // A new version of the signed split: a draft copy; version 1 keeps paying.
    expect((await page.request.post(`/api/splits/${node}/versions`, { data: {} })).status()).toBe(200);
    v = await versions();
    expect([v.current?.version, v.open?.version, v.open?.status, v.open?.lines.length]).toEqual([1, 2, 'draft', 4]);
    expect((await page.request.post(`/api/splits/${node}/versions`, { data: {} })).status()).toBe(409);

    // Changing the release: a new title and a second track. It can't be removed: its split was signed.
    const edited = await page.request.put('/api/catalog/releases/harbor-lights', { data: { title: 'Harbor Lights (Deluxe)', kind: 'ep', tracks: [{ id: 'harbor-lights', title: 'Harbor Lights' }, { title: 'Low Tide' }] } });
    expect(edited.status()).toBe(200);
    expect(CatalogResponse.parse(await edited.json()).releases.find((r) => r.id === 'harbor-lights')).toMatchObject({ title: 'Harbor Lights (Deluxe)', kind: 'EP', tracks: 2 });
    expect((await page.request.delete('/api/catalog/releases/harbor-lights')).status()).toBe(409);
    await page.request.post('/api/catalog/releases', { data: { title: 'Scratch', kind: 'single', artist: { partyId: 'joe-rivers' }, tracks: [{ title: 'Scratch' }] } });
    expect((await page.request.delete('/api/catalog/releases/scratch')).status()).toBe(200);
    expect(CatalogResponse.parse(await (await page.request.get('/api/catalog')).json()).recordings.some((r) => r.title === 'Scratch')).toBe(false);

    // Another label sees none of it.
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    expect((await harbor.request.get(`/api/splits/${node}/versions`)).status()).toBe(404);
    expect((await harbor.request.delete('/api/catalog/releases/harbor-lights')).status()).toBe(404);
  });
});

test.describe('statement imports (live)', () => {
  test('a file becomes one statement per month that reconciles to the cent; catalog ISRCs match; once only; team only', async ({ page, browser }) => {
    await signIn(page, USERS.owner);
    const file = [
      'Sales Period\tStore Name\tCountry Of Sale\tArtist\tSong Title\tISRC\t# Units Sold\tTotal Earned',
      '2025-01\tSpotify\tUS\tKesi Vale\tGlasshouse\tUSNL12600014\t1000\t0.333333',
      '2025-01\tSpotify\tUS\tKesi Vale\tGlasshouse\tUSNL12600014\t1000\t0.333333',
      '2025-01\tTidal\tNO\tNobody\tStray\tQZZZZ2500009\t5\t0.333334',
      '2025-02\tSpotify\tUS\tKesi Vale\tGlasshouse\tUSNL12600014\t10\t1.005',
    ].join('\n');
    const res = await page.request.post('/api/money/imports/preview', { data: { provider: 'tunecore', fileName: 'tunecore.tsv', text: file } });
    const preview = await res.json();
    expect(preview.mapping).toMatchObject({ title: 'Song Title', amount: 'Total Earned', period: 'Sales Period', isrc: 'ISRC', units: '# Units Sold' });
    expect(preview.months.map((m: { period: string; total: number; matched: number }) => [m.period, m.total, m.matched])).toEqual([['2025-01-01', 100, 2], ['2025-02-01', 101, 1]]);

    const done = await page.request.post('/api/money/imports', { data: { provider: 'tunecore', fileName: 'tunecore.tsv', text: file, mapping: preview.mapping } });
    expect(done.status()).toBe(200);
    const { refs } = (await done.json()) as { refs: string[] };
    expect(refs).toHaveLength(2);
    const db = connect(process.env.TEST_DATABASE_URL!, { max: 1 });
    const rows = await db<{ ref: string; total: string; lines: string; matched: string; source: string; provider: string }[]>`
      SELECT s.ref, s.total_cents AS total, sum(l.amount_cents) AS lines, count(l.recording_id) AS matched, s.source::text AS source, s.provider
      FROM income_statements s JOIN income_lines l ON l.statement_id = s.id WHERE s.ref = ANY(${refs}) GROUP BY s.id ORDER BY s.period`;
    await db.end();
    expect(rows.map((r) => [Number(r.total), Number(r.lines), Number(r.matched), r.source, r.provider])).toEqual([[100, 100, 2, 'distributor', 'TuneCore'], [101, 101, 1, 'distributor', 'TuneCore']]);
    expect((await page.request.post('/api/money/imports', { data: { provider: 'tunecore', fileName: 'again.tsv', text: file, mapping: preview.mapping } })).status()).toBe(409);
    const list = ImportsResponse.parse(await (await page.request.get('/api/money/imports')).json());
    expect(list.items.slice(0, 2).map((i) => [i.period, i.lines, i.matched, i.total])).toEqual([['February 2025', 1, 1, 101], ['January 2025', 3, 2, 100]]);

    // A payee can't import or see imports; another label sees none of them.
    const payee = await (await browser.newContext()).newPage();
    await signIn(payee, USERS.payee, { into: 'Northline Records' });
    expect((await payee.request.post('/api/money/imports', { data: { provider: 'tunecore', fileName: 'p.tsv', text: file.replace('0.333334', '0.4'), mapping: preview.mapping } })).status()).toBe(403);
    expect((await payee.request.get('/api/money/imports')).status()).toBe(403);
    const harbor = await (await browser.newContext()).newPage();
    await signIn(harbor, USERS.harbor);
    expect(ImportsResponse.parse(await (await harbor.request.get('/api/money/imports')).json()).items).toEqual([]);
  });
});
