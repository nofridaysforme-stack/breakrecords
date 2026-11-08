import { test, expect } from '@playwright/test';
import { ApprovalError, ApprovalState, CatalogResponse, ENDPOINTS, ProfileClaimsResponse, Recording, RegistrationsResponse, RoyaltiesResponse, SplitNodeResponse, SplitTreeResponse, StatementResponse, StatementsResponse, UnclaimedResponse } from '@breakrecords/contract';
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
