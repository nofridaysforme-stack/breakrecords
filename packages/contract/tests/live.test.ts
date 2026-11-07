// Runs the contract against a running server when CONTRACT_BASE_URL is set (mock or live).
// Playwright runs the same checks in CI against the built app (apps/web/tests/e2e/contract.spec.ts).
import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from '../src';

const base = process.env.CONTRACT_BASE_URL;

describe.skipIf(!base)(`contract against ${base}`, () => {
  for (const e of ENDPOINTS) {
    it(e.path, async () => {
      const res = await fetch(base + e.path);
      expect(res.status).toBe(200);
      const parsed = e.schema.safeParse(await res.json());
      expect(parsed.success ? 'ok' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe('ok');
    });
  }
});
