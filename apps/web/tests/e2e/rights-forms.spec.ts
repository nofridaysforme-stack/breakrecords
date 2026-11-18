import { test, expect, type Page } from '@playwright/test';
import { DocumentsResponse } from '@breakrecords/contract';

// A form for each organization, filled in from the catalog: PRO and MLC registrations for songs,
// SoundExchange registration and a Letter of Direction for recordings, and the album group.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));
const docs = async (page: Page) => DocumentsResponse.parse(await (await page.request.get('/api/rights/documents')).json());

test('every song, recording and release offers the right forms', async ({ page }) => {
  const v = await docs(page);
  const kinds = (subject: string) => v.subjects.find((x) => x.subject === subject)!.docs.map((d) => d.kind);
  expect(kinds('work')).toEqual(['split_sheet', 'pro_registration', 'mlc_registration', 'copyright_worksheet']);
  expect(kinds('recording')).toEqual(['sx_registration', 'sx_lod', 'copyright_worksheet']);
  expect(kinds('release')).toEqual(['label_copy', 'copyright_group']);
  const vh = v.subjects.find((x) => x.subject === 'recording' && x.id === 'velvet-hours')!.docs.find((d) => d.kind === 'sx_lod')!;
  expect(vh.lod).toEqual({ payees: ['Marco Dela'], last: null });
});

test('a Letter of Direction asks for its terms, keeps them, and fills SoundExchange’s repertoire chart', async ({ page }) => {
  await page.goto('/rights/documents');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  await page.getByRole('button', { name: 'Prepare: SoundExchange Letter of Direction for Velvet Hours' }).click();
  const form = page.getByRole('form', { name: 'Letter of Direction terms for Velvet Hours' });
  await expect(form.getByLabel('Who is paid')).toHaveValue('Marco Dela');
  await form.getByLabel(/Percentage of the featured artist’s share/).fill('3');
  await form.getByLabel(/Effective date/).fill('2026-01-01');
  await form.getByRole('button', { name: 'Prepare the letter' }).click();
  await expect(page.getByRole('status')).toContainText('SoundExchange Letter of Direction for Velvet Hours prepared, version 1.');

  const slot = (await docs(page)).subjects.find((x) => x.subject === 'recording' && x.id === 'velvet-hours')!.docs.find((d) => d.kind === 'sx_lod')!;
  expect(slot.lod!.last).toEqual({ payee: 'Marco Dela', percentBp: 300, effectiveDate: '2026-01-01', allRoyalties: false });
  expect(slot.latest!.gaps.filter((g) => g.severity === 'blocker').map((g) => g.field)).not.toContain('Percentage');
  const csv = await (await page.request.get(`/api/rights/documents/${slot.latest!.id}/file?format=csv`)).text();
  expect(csv.split('\r\n').slice(0, 2)).toEqual([
    '"Solo Artist or Group Name","Sound Recording Track Name","Effective Date","ISRC","Percentage"',
    '"Kesi Vale","Velvet Hours","2026-01-01","USNL12400007","3%"',
  ]);
  // The next version starts from the same terms.
  await page.getByRole('button', { name: 'Prepare again: SoundExchange Letter of Direction for Velvet Hours' }).click();
  await expect(page.getByRole('form', { name: 'Letter of Direction terms for Velvet Hours' }).getByLabel(/Percentage/)).toHaveValue('3');
  // A payee who isn't a credited producer, mixer or engineer is a gap, never a letter.
  const bad = await page.request.post('/api/rights/documents', { data: { kind: 'sx_lod', subject: 'recording', id: 'velvet-hours', lod: { payee: 'Someone Else', percentBp: 100, effectiveDate: null, allRoyalties: true } } });
  const after = DocumentsResponse.parse(await bad.json()).subjects.find((x) => x.subject === 'recording' && x.id === 'velvet-hours')!.docs.find((d) => d.kind === 'sx_lod')!;
  expect(after.latest!.gaps.find((g) => g.field === 'Payee')?.message).toMatch(/isn't credited as a producer/);
});

test('the MLC form follows its six steps and has the bulk spreadsheet values', async ({ page }) => {
  const res = await page.request.post('/api/rights/documents', { data: { kind: 'mlc_registration', subject: 'work', id: 'night-bus' } });
  expect(res.status()).toBe(200);
  const id = (await res.json()).prepared as string;
  const csv = await (await page.request.get(`/api/rights/documents/${id}/file?format=csv`)).text();
  expect(csv.split('\r\n')[0]).toBe('"Work title (A)","AKA title (E)","AKA title type code (F)","Writer (G to I)","Writer role code (J)","Publisher IPI (M)","Collection share (Q)","Recording title (R)","Recording artist (S)"');
  expect(csv.split('\r\n')[1]).toMatch(/^"Night Bus",/);
  const pdf = await page.request.get(`/api/rights/documents/${id}/file`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  for (const kind of ['pro_registration', 'copyright_worksheet']) expect((await page.request.post('/api/rights/documents', { data: { kind, subject: 'work', id: 'night-bus' } })).status()).toBe(200);
  expect((await page.request.post('/api/rights/documents', { data: { kind: 'copyright_group', subject: 'release', id: 'rel_velvet' } })).status()).toBe(200);
  expect((await page.request.post('/api/rights/documents', { data: { kind: 'sx_lod', subject: 'work', id: 'night-bus' } })).status()).toBe(400);
});
