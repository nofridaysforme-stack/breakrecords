import { test, expect, type Page } from '@playwright/test';
import { CatalogResponse, FirstSplitResponse } from '@breakrecords/contract';

// Adding your own music and its split on sample data: a release with its songs, its first
// split as a draft, sending it, and signing until it takes effect.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same flow; run once'));

test('add a release, create its split, send it, sign it: it takes effect', async ({ page }) => {
  await page.goto('/catalog/releases');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Add a release' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a release' });
  await dialog.getByLabel('Title', { exact: true }).fill('Coastline');
  await dialog.getByLabel('Kind').selectOption('ep');
  await dialog.getByLabel('Artist', { exact: true }).selectOption('new');
  await dialog.getByLabel('Artist name').fill('Joe Rivers');
  await dialog.getByLabel('Track 1 title').fill('Tide');
  await dialog.getByRole('button', { name: 'Add a track' }).click();
  await dialog.getByLabel('Track 2 title').fill('Undertow');
  await dialog.getByLabel('ISRC (optional)').nth(1).fill('US-ZZZ-26-00002');
  await dialog.getByRole('button', { name: 'Add release' }).click();
  await expect(dialog.getByRole('status')).toContainText('Coastline is in your catalog.');
  const cat = CatalogResponse.parse(await (await page.request.get('/api/catalog')).json());
  expect(cat.releases.at(-1)).toMatchObject({ title: 'Coastline', artist: 'Joe Rivers', kind: 'EP', tracks: 2 });
  expect(cat.recordings.slice(-2).map((r) => [r.title, r.isrc])).toEqual([['Tide', null], ['Undertow', 'USZZZ2600002']]);
  expect(cat.unsplit).toEqual([{ id: 'coastline', title: 'Coastline', artist: 'Joe Rivers' }]);

  await dialog.getByRole('link', { name: 'Create its split' }).click();
  await expect(page.getByRole('heading', { name: 'Create a split' })).toBeVisible();
  await page.getByLabel('I am Joe Rivers, so I sign as the artist too').check();
  await page.getByLabel('Producer', { exact: true }).selectOption('new');
  await page.getByLabel('Producer’s name').fill('Sam Okoro');
  await expect(page.getByText('Producer: $3.00')).toBeVisible();
  await expect(page.getByText('Joe Rivers: $48.50')).toBeVisible();
  await page.getByRole('button', { name: 'Save as draft' }).click();

  await expect(page).toHaveURL(/\/splits\/coastline-recording$/);
  await expect(page.getByRole('heading', { name: 'Coastline: who gets what' })).toBeVisible();
  await page.getByLabel('Artist’s share of net profit (%)').fill('60');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft saved.');
  await page.getByRole('button', { name: 'Send for signatures' }).click();
  await expect(page.getByText('out for signatures, 0 of 3 signed')).toBeVisible();
  const f = FirstSplitResponse.parse(await (await page.request.get('/api/splits/coastline-recording/first')).json());
  expect(f.terms).toEqual({ producerBp: 300, artistOfNetBp: 6000, labelOfNetBp: 4000, featureOfArtistBp: 0 });

  await page.getByRole('button', { name: /Sign as label/ }).click();
  await page.getByRole('button', { name: /Sign as artist/ }).click();
  await expect(page.getByText('out for signatures, 2 of 3 signed')).toBeVisible();
  // The producer signs in their own portal; in sample data, sign for them through the API.
  expect((await page.request.post('/api/splits/coastline-recording/sign', { data: { role: 'producer' } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByText(/Version 1 · in effect since/)).toBeVisible();
  expect((await page.request.get('/api/splits/coastline-recording/first')).status()).toBe(404);
});

test('an empty Splits page explains the first step; a release can have only one split', async ({ page }) => {
  await page.goto('/splits');
  await page.waitForLoadState('networkidle'); // the sample session cookie is settled before anything is saved
  await expect(page.getByRole('heading', { name: 'Kesi Vale' })).toBeVisible(); // the sample label has splits
  await page.request.post('/api/catalog/releases', { data: { title: 'Solo', kind: 'single', artist: { partyId: 'kesi-vale' }, tracks: [{ title: 'Solo' }] } });
  const terms = { producerBp: 0, artistOfNetBp: 5000, labelOfNetBp: 5000, featureOfArtistBp: 0 };
  expect((await page.request.post('/api/splits', { data: { releaseId: 'solo', terms } })).status()).toBe(200);
  expect((await page.request.post('/api/splits', { data: { releaseId: 'solo', terms } })).status()).toBe(409);
  expect((await page.request.post('/api/splits', { data: { releaseId: 'solo', terms: { ...terms, producerBp: 300 } } })).status()).toBe(400); // points need a producer
  expect((await page.request.post('/api/catalog/releases', { data: { title: 'Bad', kind: 'single', artist: { partyId: 'kesi-vale' }, tracks: [{ title: 'x', isrc: 'NOPE' }] } })).status()).toBe(400);
});
