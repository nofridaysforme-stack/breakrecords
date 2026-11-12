import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import { PrintButton } from '@/components/sync/PrintButton';
import { syncReader } from '@/server/syncRoute';
import o from '@/components/ops/Ops.module.css';

export const metadata: Metadata = { title: 'Sync license' };

/** A quote's license, built from the workspace's sync template. A draft until its signature card is approved. */
export default async function LicensePage({ params }: { params: Promise<{ id: string }> }) {
  const who = await syncReader();
  if ('refused' in who) redirect('/');
  const { id } = await params;
  const l = who.ctx ? await (await import('@/server/live/sync')).liveLicense(who.ctx, id) : await (await import('@/server/mockSync')).mockLicense(id);
  if (!l) notFound();
  return (
    <Page>
      <nav aria-label="Breadcrumb" className={o.crumb}><Link href="/sync">Sync licensing</Link> / License</nav>
      <div className={o.head}>
        <div><PageTitle>{l.title}</PageTitle><p className={o.sub}>{l.signed ? 'Signed: its approval card was approved.' : 'Draft: not signed. It becomes a license once its approval card is approved.'}</p></div>
        <PrintButton label="Print or save as PDF" />
      </div>
      <article className={o.card} aria-label="License text">
        {l.sections.map((s) => (
          <section key={s.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className={o.cardTitle}>{s.title}</h2>
            <p className={o.muted}>{s.text}</p>
          </section>
        ))}
        {!l.signed && <p className={o.warnText} role="note">DRAFT. Not for signature until approved.</p>}
      </article>
    </Page>
  );
}
