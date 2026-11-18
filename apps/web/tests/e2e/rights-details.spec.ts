import { test, expect, type Page } from '@playwright/test';
import { DocumentsResponse, PeopleResponse, PersonResponse } from '@breakrecords/contract';

// Every fact a rights form asks for has a place to be entered: a person's page, a recording's
// credits and owner, a song's writer roles and publishers. Each gap links straight to it.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same server; run once'));
const docs = async (page: Page) => DocumentsResponse.parse(await (await page.request.get('/api/rights/documents')).json());
const lodOf = async (page: Page, id: string) => (await docs(page)).subjects.find((x) => x.subject === 'recording' && x.id === id)!.docs.find((d) => d.kind === 'sx_lod')!;

test('a person’s details are entered on their page; bad values are refused', async ({ page }) => {
  await page.goto('/catalog/people');
  await page.waitForLoadState('networkidle');
  const list = PeopleResponse.parse(await (await page.request.get('/api/catalog/people')).json());
  expect(list.people.find((p) => p.id === 'marco-dela')!.missing).toEqual(expect.arrayContaining(['PRO', 'IPI', 'Phone', 'Address']));
  await page.getByRole('link', { name: 'Marco Dela' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Marco Dela' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Details for Marco Dela' });
  await expect(page.getByRole('note')).toContainText('Missing for the forms: PRO, IPI');
  await form.getByLabel(/^PRO/).selectOption('bmi');
  await form.getByLabel(/^IPI number/).fill('00612345678');
  await form.getByLabel('Phone').fill('+1 207 555 0142');
  await form.getByLabel('Mailing address').fill('9 Pine Street, Portland, ME 04101');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('status')).toContainText('Saved.');
  const p = PersonResponse.parse(await (await page.request.get('/api/catalog/people/marco-dela')).json());
  expect(p).toMatchObject({ pro: 'bmi', ipi: '00612345678', phone: '+1 207 555 0142' });
  expect(p.missing).not.toContain('IPI');
  expect(p.uses.map((u) => u.text)).toContain('Artist on Low Light');
  const bad = await page.request.patch('/api/catalog/people/marco-dela', { data: { ipi: '12' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).message).toMatch(/9 to 11 digits/);
  expect((await page.request.patch('/api/catalog/people/marco-dela', { data: { citizenship: 'usa' } })).status()).toBe(400);
  expect((await page.request.get('/api/catalog/people/nobody-here')).status()).toBe(404);
});

test('a Letter of Direction with no producer links to the recording, where one is credited', async ({ page }) => {
  await page.goto('/rights/documents');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Prepare: SoundExchange Letter of Direction for Low Light' }).click();
  await expect(page.getByRole('status')).toContainText('Letter of Direction for Low Light prepared');
  const gaps = (await lodOf(page, 'low-light')).latest!.gaps;
  expect(gaps.find((g) => g.field === 'Payee')!.fix).toEqual({ to: 'recording', id: 'low-light' });
  expect(gaps.map((g) => g.field)).not.toContain('Effective date'); // asked for once someone can be paid

  await page.getByRole('link', { name: /Fix it for Payee, Low Light/ }).click();
  await expect(page).toHaveURL(/\/catalog\/recordings\?edit=low-light/);
  const dialog = page.getByRole('dialog', { name: 'Edit Low Light' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Add a credit' }).click();
  await dialog.getByLabel('Their name').fill('Ivy Park');
  await dialog.getByLabel('Role').last().fill('Mix engineer');
  await dialog.getByLabel(/^Length/).fill('2:58');
  await dialog.getByLabel(/^℗ year/).fill('2026');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const panel = page.getByRole('complementary', { name: 'Low Light details' });
  await expect(panel.getByRole('link', { name: 'Ivy Park' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Low Light saved.');

  // The letter now has someone to pay, and asks for its terms.
  expect((await lodOf(page, 'low-light')).lod!.payees).toEqual(['Ivy Park']);
  await page.goto('/rights/documents');
  await page.getByRole('button', { name: 'Prepare again: SoundExchange Letter of Direction for Low Light' }).click();
  await expect(page.getByRole('form', { name: 'Letter of Direction terms for Low Light' }).getByLabel('Who is paid')).toHaveValue('Ivy Park');
  // A new person's page says what's still needed.
  const ivy = PersonResponse.parse(await (await page.request.get('/api/catalog/people/ivy-park')).json());
  expect(ivy.uses.map((u) => u.text)).toEqual(['Mix engineer on Low Light']);
  expect(ivy.missing).toContain('Email');
});

test('a song’s writer roles and publishers are set in its panel; gaps on people link to their page', async ({ page }) => {
  await page.goto('/catalog/songs?edit=glasshouse');
  await page.waitForLoadState('networkidle');
  const dialog = page.getByRole('dialog', { name: 'Edit Glasshouse' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Marco Dela’s publisher').selectOption('__new');
  await dialog.getByLabel('Their name').fill('Dela Music');
  await dialog.getByLabel('What Marco Dela wrote').selectOption('composer');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Glasshouse saved.');
  const people = PeopleResponse.parse(await (await page.request.get('/api/catalog/people')).json()).people;
  expect(people.find((p) => p.id === 'dela-music')).toMatchObject({ type: 'company', roles: 'Publisher' });
  expect((await page.request.patch('/api/catalog/songs/glasshouse', { data: { writers: [{ partyId: 'dana-okafor', role: 'composer', publisher: null }] } })).status()).toBe(400);

  // The PRO form now names the new publisher, and its missing IPI links to the publisher's page.
  await page.goto('/rights/documents');
  await page.getByRole('button', { name: 'Prepare: PRO registration for Glasshouse' }).click();
  await expect(page.getByRole('status')).toContainText('PRO registration for Glasshouse prepared');
  const link = page.getByRole('link', { name: /Fix it for Publisher IPI, Glasshouse/ });
  await expect(link).toHaveAttribute('href', '/catalog/people/dela-music?back=/rights/documents');
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dela Music' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Done, back to Documents' })).toHaveAttribute('href', '/rights/documents');
});
