import { test, expect, type Page } from '@playwright/test';
import { CatalogResponse, SplitVersionsResponse } from '@breakrecords/contract';

// Your own music on sample data: a release and its songs, its split with several people in a
// role, signatures, a new version of a signed split, songwriters, and changing or removing a release.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
test.beforeEach(({ page }) => test.skip(isPhone(page), 'Same flow; run once'));
const versions = async (page: Page, node: string) => SplitVersionsResponse.parse(await (await page.request.get(`/api/splits/${node}/versions`)).json());

test('add a release, split it with co-producers, sign it; then change it with a new version', async ({ page }) => {
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

  await dialog.getByRole('link', { name: 'Create its split' }).click();
  await expect(page.getByRole('heading', { name: 'Create a split' })).toBeVisible();
  await page.getByLabel('I am Joe Rivers, so I sign as the artist too').check();
  await page.getByLabel('Producer', { exact: true }).selectOption('new');
  await page.getByLabel('Producer’s name').fill('Sam Okoro');
  await expect(page.getByText('Joe Rivers: $48.50')).toBeVisible();
  await page.getByRole('button', { name: 'Save as draft' }).click();

  // Add a co-producer: the producers share the 3 points, half each.
  await expect(page).toHaveURL(/\/splits\/coastline-recording$/);
  await expect(page.getByRole('heading', { name: 'Coastline: who gets what' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByLabel('Person').last().selectOption('new');
  await page.getByLabel('Name', { exact: true }).fill('Kai Moss');
  await page.getByLabel('Share of role (%)').nth(1).fill('50');
  await expect(page.getByText('The producers’ shares add up to 150%.')).toBeVisible();
  await page.getByLabel('Share of role (%)').nth(2).fill('50');
  await page.getByLabel('Artists’ share of net profit (%)').fill('60');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Draft saved.');
  let v = await versions(page, 'coastline-recording');
  expect(v.open?.lines.map((l) => [l.role, l.name, l.shareBp, l.amount])).toEqual([
    ['artist', 'Joe Rivers', 10000, 5820], ['label', 'Northline Records', 10000, 3880], ['producer', 'Kai Moss', 5000, 150], ['producer', 'Sam Okoro', 5000, 150],
  ]);

  await page.getByRole('button', { name: 'Send for signatures' }).click();
  await expect(page.getByText(/out for signatures, 0 of 4 signed/)).toBeVisible();
  await page.getByRole('button', { name: /Sign as label/ }).click();
  await page.getByRole('button', { name: /Sign as artist/ }).click();
  // Each producer signs their own line (in their portal; here, through the API).
  for (const partyId of ['sam-okoro', 'kai-moss']) expect((await page.request.post('/api/splits/coastline-recording/sign', { data: { role: 'producer', partyId } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'In effect: version 1' })).toBeVisible();

  // A new version of a signed split: a draft copy; version 1 keeps paying until it's signed.
  await page.getByRole('button', { name: 'Propose a change' }).click();
  await expect(page.getByRole('heading', { name: 'Version 2: draft' })).toBeVisible();
  v = await versions(page, 'coastline-recording');
  expect([v.current?.version, v.open?.version, v.open?.status]).toEqual([1, 2, 'draft']);
  expect((await page.request.post('/api/splits/coastline-recording/versions', { data: {} })).status()).toBe(409); // one open version at a time
});

test('songwriters: set the writers of each song, 100% in all', async ({ page }) => {
  await page.goto('/splits');
  await page.waitForLoadState('networkidle');
  await page.request.post('/api/catalog/releases', { data: { title: 'Solo', kind: 'single', artist: { partyId: 'kesi-vale' }, tracks: [{ title: 'Solo' }] } });
  const terms = { producerBp: 0, artistOfNetBp: 5000, labelOfNetBp: 5000, featureOfArtistBp: 0 };
  const { node } = await (await page.request.post('/api/splits', { data: { releaseId: 'solo', terms } })).json();
  await page.goto(`/splits/${node}`);
  await page.getByRole('button', { name: 'Add songwriters for Solo' }).click();
  await page.getByLabel('Share (%)').fill('60');
  await page.getByRole('button', { name: 'Add a writer' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Mia Lund');
  await page.getByLabel('Share (%)').nth(1).fill('30');
  await expect(page.getByText('Shares add up to 90%.')).toBeVisible();
  await page.getByLabel('Share (%)').nth(1).fill('40');
  await page.getByRole('button', { name: 'Save songwriters' }).click();
  await expect(page.getByRole('status')).toContainText('Solo’s songwriters saved.');
  const v = await versions(page, node);
  expect(v.songs[0].writers.map((w) => [w.name, w.shareBp, w.confirmed])).toEqual([['Kesi Vale', 6000, false], ['Mia Lund', 4000, false]]);
  expect((await page.request.put('/api/catalog/recordings/solo/writers', { data: { writers: [{ party: { partyId: 'kesi-vale' }, shareBp: 9000 }] } })).status()).toBe(400);
  // A release can only have one split, and points need a producer.
  expect((await page.request.post('/api/splits', { data: { releaseId: 'solo', terms } })).status()).toBe(409);
  expect((await page.request.post('/api/splits', { data: { releaseId: 'solo', terms: { ...terms, producerBp: 300 } } })).status()).toBe(400);
});

test('a release can be changed, and removed until its split is sent', async ({ page }) => {
  await page.goto('/catalog/releases');
  await page.waitForLoadState('networkidle');
  for (const title of ['Draft EP', 'Kept']) await page.request.post('/api/catalog/releases', { data: { title, kind: 'ep', artist: { partyId: 'kesi-vale' }, tracks: [{ title: 'One' }, { title: 'Two' }] } });
  await page.reload();
  await page.getByRole('button', { name: 'Edit Draft EP' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change Draft EP' });
  await dialog.getByLabel('Title', { exact: true }).fill('First EP');
  await dialog.getByLabel('Track 2 title').fill('Two (radio edit)');
  await dialog.getByRole('button', { name: 'Remove track 1' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  const cat = CatalogResponse.parse(await (await page.request.get('/api/catalog')).json());
  expect(cat.releases.find((r) => r.id === 'draft-ep')).toMatchObject({ title: 'First EP', tracks: 1, edit: { tracks: [{ title: 'Two (radio edit)' }] } });

  // A sent split keeps the release; without one it can go.
  const terms = { producerBp: 0, artistOfNetBp: 5000, labelOfNetBp: 5000, featureOfArtistBp: 0 };
  const { node } = await (await page.request.post('/api/splits', { data: { releaseId: 'kept', terms } })).json();
  await page.request.post(`/api/splits/${node}/send`, { data: {} });
  const refused = await page.request.delete('/api/catalog/releases/kept');
  expect(refused.status()).toBe(409);
  await page.reload();
  await page.getByRole('button', { name: 'Remove First EP' }).click();
  await page.getByRole('button', { name: 'Remove First EP' }).click();
  await expect(page.getByRole('status')).toHaveText('First EP was removed from your catalog.');
  expect(CatalogResponse.parse(await (await page.request.get('/api/catalog')).json()).releases.some((r) => r.id === 'draft-ep')).toBe(false);
});
