import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { signIn, USERS } from './helpers';
import { MAILBOX } from '../../playwright.live.config';

test('what you enter in the screens is saved: credits, a person, a plan and an uploaded file survive a reload; the site reports every part live', async ({ page, browser }) => {
  await signIn(page, USERS.jana);
  const code = ((await (await page.request.post('/api/admin/invite-codes', { data: { note: 'repro', maxUses: 1, expiresInDays: 7 } })).json()) as { code: string }).code;
  const p = await (await browser.newContext()).newPage();
  const email = `repro-${Date.now()}@artist.example`;
  await p.goto(`/sign-up?code=${code}`);
  await p.getByLabel('Email').fill(email);
  await p.getByRole('button', { name: 'Create my account' }).click();
  await expect(p.getByRole('status')).toContainText('Check your email');
  const { url } = JSON.parse(readFileSync(path.join(MAILBOX, `${email}.json`), 'utf8')) as { url: string };
  await p.goto(url); await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p).toHaveURL(/\/onboarding/);
  const answers = { profile: 'solo', name: 'Repro Artist', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_yet' }, autonomy: 'draft_and_wait' };
  expect((await p.request.put('/api/onboarding', { data: { answers, complete: true } })).status()).toBe(200);
  expect((await p.request.post('/api/catalog/releases', { data: { title: 'Outside', kind: 'single', artist: { name: 'Repro Artist' }, releaseDate: '2025-05-01', tracks: [{ title: 'Outside' }] } })).status()).toBe(200);

  const logs: string[] = [];
  p.on('response', async (r) => { if (r.request().method() !== 'GET' && r.url().includes('/api/')) logs.push(`${r.request().method()} ${r.url()} ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`); });
  p.on('console', (m) => { if (m.type() === 'error') logs.push(`console: ${m.text().slice(0, 200)}`); });

  // Credits in the recording panel
  await p.goto('/catalog/recordings');
  await p.getByRole('button', { name: 'Edit metadata' }).click();
  const d = p.getByRole('dialog', { name: 'Edit Outside' });
  await d.getByRole('button', { name: 'Add a credit' }).click();
  await d.getByLabel('Their name').fill('Pat Producer');
  await d.getByLabel('Genre').fill('Indie');
  await d.getByRole('button', { name: 'Save' }).click();
  await p.waitForTimeout(1500);
  await p.reload();
  const panel = p.getByRole('complementary', { name: 'Outside details' });
  await expect(panel.getByRole('link', { name: 'Pat Producer' })).toBeVisible();
  await expect(panel).toContainText('Indie');

  // Person page
  await p.goto('/catalog/people/repro-artist');
  await p.getByLabel('Phone').fill('555 0100');
  await p.getByRole('button', { name: 'Save' }).click();
  await p.waitForTimeout(1500);
  await p.reload();
  await expect(p.getByLabel('Phone')).toHaveValue('555 0100');

  // Plan
  await p.request.post('/api/agents/run');
  await p.goto('/plan?goal=Get%20everything%20registered');
  await p.getByRole('button', { name: /Approve the plan/ }).click();
  await expect(p.getByRole('status')).toContainText('Plan approved');
  await p.goto('/plan');
  await expect(p.getByRole('region', { name: 'Your plans' })).toContainText('Get everything registered');

  // Uploading a file in Catalog › Assets keeps it, and it downloads back the same.
  await p.goto('/catalog/assets');
  await p.getByRole('button', { name: 'Upload assets' }).click();
  const up = p.getByRole('dialog', { name: 'Upload assets' });
  await up.locator('input[type=file]').setInputFiles({ name: 'outside-cover.png', mimeType: 'image/png', buffer: Buffer.from('fake png bytes for the test') });
  await up.getByLabel('For').selectOption('release:outside');
  await up.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(p.getByRole('status').filter({ hasText: 'uploaded and saved' })).toBeVisible();
  await p.reload();
  const link = p.getByRole('link', { name: 'Download outside-cover.png' });
  await expect(link).toBeVisible();
  const file = await p.request.get((await link.getAttribute('href'))!);
  expect(await file.text()).toBe('fake png bytes for the test');
  expect((await page.request.get((await link.getAttribute('href'))!)).status()).toBe(404); // another workspace

  // Nothing on this site is on sample data, so nothing typed in is thrown away.
  const status = await (await p.request.get('/api/status')).json();
  expect(status).toMatchObject({ sample: [], files: 'folder' });
  expect(logs.filter((l) => / [45]\d\d /.test(l))).toEqual([]);
});
