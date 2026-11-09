import { test, expect } from '@playwright/test';
import { ActivityResponse, DocumentsResponse, ApprovalError, ApprovalState, CatalogResponse, HomeResponse, OnboardingResponse, SearchResponse, ContractsResponse, DepartmentsResponse, ENDPOINTS, SettingsResponse, ThemeResponse, FundingResponse, OffersResponse, RosterResponse, Release, ReleasesResponse, PayeeResponse, PayoutsResponse, RecoupmentResponse, ProfileClaimsResponse, Recording, RegistrationsResponse, RoyaltiesResponse, SplitNodeResponse, SplitTreeResponse, StatementResponse, StatementsResponse, UnclaimedResponse } from '@breakrecords/contract';
import { connect } from '@breakrecords/db/client';
import { signIn, USERS } from './helpers';

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
  await page.goto('/approvals/apr_mlc');
  // A filing can't be approved until each fact is confirmed.
  for (const box of await page.getByRole('main').getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Approve and file' }).click();
  await expect.poll(async () => ApprovalState.parse(await (await page.request.get('/api/approvals/state')).json()).decisions.apr_mlc?.status).toBe('approved');

  const other = await browser.newContext();
  const jana = await other.newPage();
  await signIn(jana, USERS.jana);
  const state = ApprovalState.parse(await (await jana.request.get('/api/approvals/state')).json());
  expect(state.decisions.apr_mlc).toMatchObject({ status: 'approved' });
  expect(state.decisions.apr_mlc.auditId).toMatch(/^AUD-[0-9A-F]{4}-\d{4}$/);
  // Undo from the teammate's session clears it for everyone.
  expect((await jana.request.delete('/api/approvals/apr_mlc/decision')).status()).toBe(200);
  await other.close();
  expect(ApprovalState.parse(await (await page.request.get('/api/approvals/state')).json()).decisions.apr_mlc).toBeUndefined();
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

test('payees only see the portal and cannot decide', async ({ page }) => {
  await signIn(page, USERS.payee);
  await page.goto('/approvals');
  await expect(page).toHaveURL(/\/portal/);
  const res = await page.request.post('/api/approvals/apr_mlc/decision', { data: { action: 'approve' } });
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
    await signIn(page, USERS.payee);
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
    await signIn(page, USERS.payee);
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
    await signIn(marco, USERS.payee);
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
    expect(r.byArtist[0]).toMatchObject({ name: 'Kesi Vale', amount: 1081260, meta: 'Glasshouse, Velvet Hours and Paper Moons' });
    expect(r.unmatched).toMatchObject({ count: 27, value: 4112, note: 'Royalties Agent thinks 24 are a typo in "Night Bus" metadata.', unknown: { count: 3, value: 272 } });
    expect(r.zeroTracks).toEqual([{ name: 'Night Bus (demo)', streams: 412 }, { name: 'Static Hymn', streams: 688 }]);

    await page.goto('/money/royalties');
    await expect(page.getByText('1,204 of 1,231').first()).toBeVisible();
  });

  test('statements are served as issued, and checked', async ({ page }) => {
    await signIn(page, USERS.owner);
    const list = StatementsResponse.parse(await (await page.request.get('/api/statements')).json());
    expect(list.items.map((s) => s.id)).toEqual(['ST-2026-10-KV', 'ST-2026-10-MD', 'ST-2026-09-MD']);
    const kv = StatementResponse.parse(await (await page.request.get('/api/statements/ST-2026-10-KV')).json());
    expect(kv).toMatchObject({ payee: 'Kesi Vale', release: 'Glasshouse', period: 'October 2026', split: 'split v4', net: 234675, pays: 'Jan 15 on the quarterly artist run' });
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
    await signIn(page, USERS.payee);
    expect((await page.request.get('/api/money/royalties')).status()).toBe(403);
    expect(StatementsResponse.parse(await (await page.request.get('/api/statements')).json()).items.map((s) => s.id)).toEqual(['ST-2026-10-MD', 'ST-2026-09-MD']);
    expect((await page.request.get('/api/statements/ST-2026-10-KV')).status()).toBe(404);
    expect((await page.request.post('/api/money/royalties/match', { data: { isrc: 'USNL1250031', recordingId: 'night-bus' } })).status()).toBe(403);
    await page.goto('/portal/statements');
    await expect(page.getByRole('link', { name: /October 2026 · Glasshouse/ })).toContainText('$285.00');
    await expect(page.getByRole('link', { name: /September 2026 · Glasshouse/ })).toContainText('$312.60');
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
    expect(p.taxForms.filter((t) => t.status !== 'ok').map((t) => [t.name, t.label, t.fix])).toEqual([['Rue Sato', 'Expires Dec 1', 'Request new'], ['Jules Arden', 'Missing', 'Request form']]);
    const r = RecoupmentResponse.parse(await (await page.request.get('/api/money/recoupment')).json());
    expect(r.items.map((i) => [i.id, i.recouped, i.recoupedIn ?? i.projected])).toEqual([['rel_glasshouse', 400000, 'Oct 2026'], ['rel_nightbus', 305000, 'Aug 2027']]);
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
    expect(kesi).toMatchObject({ earned: 234675, paid: 0, next: { amount: 234675, date: 'Jan 15', from: 'From Glasshouse, October. 50% of net profit, less feature.' } });
    expect(kesi.signPrompt.text).toBe('Your share goes up from 43.65% to 48.02% of recording income.');
  });

  test('a payee sees only their own portal and none of the label’s payouts', async ({ page }) => {
    await signIn(page, USERS.payee);
    const me = PayeeResponse.parse(await (await page.request.get('/api/portal/marco-dela')).json());
    expect(me).toMatchObject({ name: 'Marco Dela', earned: 114630, paid: 86130, next: { amount: 28500, date: 'Nov 10', from: 'From Glasshouse, October. 3 points.' }, bank: { last4: '4821' } });
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
      ['2 weeks out', '2027-02-19', 'future'], ['Release week', '2027-03-05', 'future'], ['After release', '2027-06-03', 'future'],
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
    await signIn(page, USERS.payee);
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
    expect(c.summary).toBe('7 active · 1 waiting on signatures · next key date Jan 9');
    expect(c.contracts.map((x) => [x.id, x.template, x.sig, x.date])).toEqual([
      ['ct_producer', 'Northline producer v3 · 2 edits', 'Waiting on you', 'Nov 9'], ['ct_artist_kesi', 'Northline artist v2', 'Signed', 'Mar 6, 2029'],
      ['ct_band', 'Northline artist v2', 'Signed', 'Jan 9'], ['ct_feature', 'Northline feature v1', 'Signed', null],
      ['ct_split_gh', 'Split sheet v1', '1 of 2 signed', null], ['ct_distribution', 'Third party · reviewed', 'Signed', 'Aug 1'], ['ct_split_nb', 'Split sheet v1', 'Signed', null],
    ]);
    expect(c.contracts.find((x) => x.id === 'ct_split_gh')).toMatchObject({ parties: 'Kesi, Marco', terms: '75 / 25' });
    expect(c.contracts.find((x) => x.id === 'ct_band')?.parties).toBe('The Low Hours (3)');
    expect(c.templates.map((t) => t.id)).toEqual(['artist', 'producer', 'feature', 'split', 'sync']);
  });

  test('approving the producer agreement signs for the label; it then waits on Marco', async ({ page }) => {
    await signIn(page, USERS.owner);
    await page.request.delete('/api/approvals/apr_producer/decision');
    expect((await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve' } })).status()).toBe(200);
    const c = await contracts(page);
    expect(c.contracts[0]).toMatchObject({ id: 'ct_producer', sig: '0 of 1 signed', sigState: 'partial', date: null });
    expect(c.summary).toBe('7 active · 0 waiting on signatures · next key date Jan 9');
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
    await signIn(page, USERS.payee);
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
    expect(r.map((a) => [a.open, a.href])).toEqual([
      ['Glasshouse release in 17 weeks', '/releases/rel_glasshouse'], ['Rue Sato’s tax form expires Dec 1', '/money/payouts'],
      ['Producer agreement needs your eyes', '/approvals/apr_producer'],
    ]);
    expect([r[0].income, r[2].income]).toEqual([1081260, 21140]);
    await page.goto('/roster');
    await expect(page.getByRole('heading', { name: 'Kesi Vale', level: 2 })).toBeVisible();
  });

  test('once the producer agreement is approved, Marco’s card moves on', async ({ page }) => {
    await signIn(page, USERS.owner);
    await page.request.delete('/api/approvals/apr_producer/decision');
    await page.request.post('/api/approvals/apr_producer/decision', { data: { action: 'approve' } });
    expect((await roster(page))[2]).toMatchObject({ contract: 'Producer agreement · 0 of 1 signed', open: 'Nothing open' });
    await page.request.delete('/api/approvals/apr_producer/decision');
  });

  test('payees and other labels see no roster', async ({ page, browser }) => {
    await signIn(page, USERS.payee);
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
    await signIn(page, USERS.payee);
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
    await signIn(page, USERS.payee);
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
    expect(st.config).toEqual({ name: 'Northline Records', country: 'US', profile: 'Small label', statementPeriod: 'Monthly, artists quarterly', minimumPayout: 2500, spendCap: 30000 });
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
    await signIn(marco, USERS.payee);
    expect(await marco.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#f0c050'); // lint-allow-hex: test data
    await expect(marco.getByText('Paid by Northline Records')).toBeVisible();
  });

  test('payees and other labels', async ({ page, browser }) => {
    await signIn(page, USERS.payee);
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
    recouped: 'Glasshouse fully recouped', cash90: 'Recent average, less payouts due', unclaimed: '2 sources to claim' });
  await page.goto('/');
  await expect(page.getByText('Oct, 6 sources').first()).toBeVisible();
});

test('⌘K searches the signed-in label’s own data', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  const hits = async (p: import('@playwright/test').Page, q: string) => SearchResponse.parse(await (await p.request.get(`/api/search?q=${encodeURIComponent(q)}`)).json()).items;
  expect((await hits(page, 'glasshouse')).map((i) => i.id)).toEqual(expect.arrayContaining(['r-glasshouse', 'rel-rel_glasshouse', 'st-ST-2026-10-KV']));
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
  const answers = { profile: 'band', name: 'Northline Records', country: 'Canada', distributor: 'TuneCore', catalogFile: null, pro: { status: 'affiliated', org: 'SOCAN' }, autonomy: 'act_within_limits' };
  expect((await page.request.put('/api/onboarding', { data: { answers } })).status()).toBe(200);
  expect(OnboardingResponse.parse(await (await page.request.get('/api/onboarding')).json())).toMatchObject({ answers: { distributor: 'TuneCore' }, completed: false });
  await page.goto('/onboarding/name');
  await expect(page.getByLabel('Name')).toHaveValue('Northline Records'); // read back from the server
  expect(OnboardingResponse.parse(await (await page.request.put('/api/onboarding', { data: { answers, complete: true } })).json()).completed).toBe(true);
  const st = SettingsResponse.parse(await (await page.request.get('/api/settings')).json());
  expect(st.config).toMatchObject({ profile: 'Band', country: 'CA' });
  const d = DepartmentsResponse.parse(await (await page.request.get('/api/departments')).json()).departments;
  expect(d.find((x) => x.id === 'metadata')?.autonomy).toBe('act_within_limits');
  expect(d.find((x) => x.id === 'legal')?.autonomy).toBe('draft_and_wait'); // signatures always wait for you
  expect(d.find((x) => x.id === 'marketing')?.autonomy).toBeNull(); // Phase 2 untouched
});

test('a licensee owner switches into its labels and acts there as an owner', async ({ page }) => {
  await signIn(page, USERS.licensee);
  await page.goto('/');
  const sw = page.getByRole('button', { name: /switch label/ });
  await expect(async () => { await sw.click(); await expect(page.getByRole('list', { name: 'Switch label' })).toBeVisible({ timeout: 1000 }); }).toPass();
  await page.getByRole('list', { name: 'Switch label' }).getByRole('button', { name: 'Northline Records' }).click();
  await expect(page.getByRole('button', { name: /^Label\s*Northline Records/ })).toBeVisible(); // the page reloads in the new label
  expect((await (await page.request.get('/api/approvals')).json()).items.length).toBeGreaterThan(0);
  expect((await page.request.post('/api/session/tenant', { data: { tenantId: '00000000-0000-0000-0000-000000000000' } })).status()).toBe(403);
});

test('an owner invites a payee, who signs in to their own portal; a team member can’t invite', async ({ page, browser }) => {
  await signIn(page, USERS.owner);
  await page.goto('/settings/team');
  await page.getByRole('textbox', { name: 'Email' }).fill('ari@monroe.example');
  await page.getByRole('combobox', { name: /^Role/ }).selectOption('payee');
  await page.getByRole('combobox', { name: /^Which payee/ }).selectOption('ari-monroe');
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ari@monroe.example can now sign in' })).toBeVisible();
  await expect(page.getByRole('row', { name: /ari@monroe\.example/ })).toContainText('Not signed in yet');

  const ari = await (await browser.newContext()).newPage();
  await signIn(ari, 'ari@monroe.example');
  await expect(ari).toHaveURL(/\/portal/);
  await expect(ari.getByRole('heading', { name: /^Hi Ari\./ })).toBeVisible();

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
  await signIn(payee, USERS.payee);
  expect((await payee.request.get('/api/rights/documents')).status()).toBe(403);
  expect((await payee.request.get(`/api/rights/documents/${doc.id}/file`)).status()).toBe(403);

  const priya = await (await browser.newContext()).newPage();
  await signIn(priya, 'priya@northline.example');
  expect((await priya.request.post('/api/rights/documents', { data: { kind: 'label_copy', subject: 'release', id: 'rel_nightbus' } })).status()).toBe(200);
  expect((await priya.request.post('/api/rights/documents/ai', { data: { on: true } })).status()).toBe(403);
});
