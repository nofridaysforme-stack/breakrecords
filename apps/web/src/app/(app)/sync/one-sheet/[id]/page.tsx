import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import { PrintButton } from '@/components/sync/PrintButton';
import { getCatalog } from '@/data/api';
import { getSync, syncReader } from '@/server/syncRoute';
import { getContext } from '@/server/context';
import o from '@/components/ops/Ops.module.css';

export const metadata: Metadata = { title: 'One-sheet' };

/** A recording's one-sheet for music supervisors: what it is, who wrote it, and whether it's one-stop. */
export default async function OneSheet({ params }: { params: Promise<{ id: string }> }) {
  const who = await syncReader();
  if ('refused' in who) redirect('/');
  const { id } = await params;
  const [catalog, sync] = await Promise.all([getCatalog(), getSync(who.ctx)]);
  const r = catalog.recordings.find((x) => x.id === id);
  const s = sync.recordings.find((x) => x.id === id);
  if (!r || !s) notFound();
  const song = catalog.songs.find((x) => x.title === r.song);
  const label = (await getContext())?.tenantName ?? 'Northline Records';
  const rows: [string, string][] = [
    ['Artist', r.artist], ['ISRC', r.isrc ?? 'Not assigned'], ['Length', r.duration], ['Genre', r.genre ?? 'Not set'],
    ['Song', r.song], ['Writers', song?.writers ?? 'Not listed'], ['Clearance', s.oneStopNote], ['Contact', label],
  ];
  return (
    <Page>
      <nav aria-label="Breadcrumb" className={o.crumb}><Link href="/sync">Sync licensing</Link> / One-sheet</nav>
      <div className={o.head}>
        <div><PageTitle>{r.title}</PageTitle><p className={o.sub}>One-sheet for music supervisors{s.oneStop ? ' · one-stop' : ''}</p></div>
        <PrintButton label="Print or save as PDF" />
      </div>
      <dl className={o.kv} aria-label="Recording details">
        {rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </Page>
  );
}
