import 'server-only';
import { themeVars } from '@/lib/theme';
import { authRequired, getContext } from './context';
import { isLive } from './modules';

/**
 * The licensee's published theme as CSS variables on :root, for everyone working in its labels
 * (and their payees). Nothing until a theme is published. Colors are validated hex on the way
 * in (database and contract), so the values here are safe to write into a style block.
 */
export async function PublishedTheme() {
  if (!authRequired() || !isLive('settings')) return null;
  const ctx = await getContext();
  if (!ctx) return null;
  const { liveTheme } = await import('./live/settings');
  const t = await liveTheme(ctx);
  if (!t.published) return null;
  const css = Object.entries(themeVars(t.theme)).map(([k, v]) => `${k}:${v}`).join(';');
  return <style data-theme-tenant={t.tenant.name}>{`:root{${css}}`}</style>;
}
