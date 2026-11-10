import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { MAILBOX } from '../../playwright.live.config';

export const USERS = {
  owner: 'e2e-owner@northline.example',
  jana: 'jana@northline.example',
  harbor: 'e2e-harbor@harbor.example',
  payee: 'e2e-payee@northline.example',
  licensee: 'e2e-licensee@harbor.example',
};

/**
 * Requests a link, opens it from the test mailbox, presses Sign in (the real flow). `into`
 * then opens a workspace or a label that pays them, by name (payees land in their own).
 */
export async function signIn(page: Page, email: string, opts: { into?: string } = {}) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toHaveText('Check your email for a sign-in link.');
  const { url } = JSON.parse(readFileSync(path.join(MAILBOX, `${email}.json`), 'utf8')) as { url: string };
  await page.goto(url);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
  if (opts.into) await openPlace(page, opts.into);
}

/** Switches to a workspace, or to a label that pays you, by its name. */
export async function openPlace(page: Page, name: string) {
  const me = (await (await page.request.get('/api/session/tenant')).json()) as { workspaces: { id: string; name: string }[]; connections: { id: string; name: string }[] };
  const to = [...me.workspaces, ...me.connections].find((t) => t.name === name);
  expect(to, `${name} is one of their places`).toBeTruthy();
  expect((await page.request.post('/api/session/tenant', { data: { tenantId: to!.id } })).status()).toBe(200);
}
