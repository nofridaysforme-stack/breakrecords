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

/** Requests a link, opens it from the test mailbox, presses Sign in (the real flow). */
export async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toHaveText('Check your email for a sign-in link.');
  const { url } = JSON.parse(readFileSync(path.join(MAILBOX, `${email}.json`), 'utf8')) as { url: string };
  await page.goto(url);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
}
