import type { Metadata } from 'next';
import { connection } from 'next/server';
import { BackToWorkspace } from '@/components/portal/BackToWorkspace';
import { SignOutButton } from '@/components/shell/SignOutButton';
import { authRequired, requireContext } from '@/server/context';
import s from '@/components/portal/Portal.module.css';

export const metadata: Metadata = { title: 'Nothing to show yet' };

/**
 * A payee whose record in this label is gone (a removed payee, or sample data that was reloaded).
 * Instead of "page not found" on every page: what happened and the ways out.
 */
export default async function PortalUnavailable() {
  await connection(); // decided per request, never at build time
  const ctx = authRequired() ? await requireContext() : null;
  const label = ctx?.tenantName ?? 'This label';
  const others = ctx ? ctx.workspaces.filter((w) => w.tenantId !== ctx.tenantId) : [];
  return (
    <section aria-labelledby="pu-h" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <h1 id="pu-h" style={{ font: '700 var(--fs-h2) var(--font-display)', margin: 0 }}>Nothing from {label} to show you</h1>
      <p style={{ color: 'var(--text-2)', margin: 0 }}>
        You were invited as someone {label} pays, but they don’t have you on file as a payee right now. Your earnings, statements and tax forms with them will show here once they set you up again.
      </p>
      <p style={{ color: 'var(--text-2)', margin: 0 }}>Ask {label} to add you as a payee, or carry on in your own workspace.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {others.map((w) => <BackToWorkspace key={w.tenantId} id={w.tenantId} name={w.name} />)}
        {ctx && <SignOutButton className={s.back} />}
      </div>
    </section>
  );
}
