import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@design': fileURLToPath(new URL('../../design', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'] },
});
