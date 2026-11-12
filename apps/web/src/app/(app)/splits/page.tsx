import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import { CreateSplit } from '@/components/splits/CreateSplit';
import type { SplitNode } from '@/components/ui/Splits';
import { getCatalog, getSplitTree } from '@/data/api';
import { getContext } from '@/server/context';
import o from '@/components/ops/Ops.module.css';

export const metadata: Metadata = { title: 'Splits' };

/** Every income stream that can carry its own split, under the artist and release it belongs to. */
function Branch({ node, path }: { node: SplitNode; path: string[] }) {
  if (!node.children?.length) {
    return <li><Link href={`/splits/${node.id}`} className={o.rowName}>{[...path, node.label].join(' · ')}</Link></li>;
  }
  return <>{node.children.map((c) => <Branch key={c.id} node={c} path={[...path, node.label]} />)}</>;
}

type Props = { searchParams: Promise<{ create?: string; release?: string }> };

export default async function SplitsIndex({ searchParams }: Props) {
  const { create, release } = await searchParams;
  const [tree, catalog] = await Promise.all([getSplitTree(), getCatalog()]);
  const artists = tree.flatMap((root) => root.children ?? []);
  const labelName = tree[0]?.label ?? (await getContext())?.tenantName ?? 'Your label';
  const unsplit = catalog.unsplit ?? [];
  const creating = !!create || !!release || (!artists.length && unsplit.length > 0);
  return (
    <Page>
      <div className={o.head}>
        <div>
          <PageTitle>Splits</PageTitle>
          <p className={o.sub}>Who gets what from each income stream. Open one to see its versions, signatures and draft.</p>
        </div>
        {!creating && unsplit.length > 0 && <Link href="/splits?create=1" className={o.linkInline}>Create a split</Link>}
      </div>
      {creating && (
        <section className={o.section} aria-labelledby="new-split">
          <h2 id="new-split" className={o.sectionTitle}>Create a split</h2>
          <CreateSplit releases={unsplit} people={catalog.people ?? []} labelName={labelName} initialRelease={release} />
        </section>
      )}
      {!artists.length && !unsplit.length && (
        <section className={o.callout} role="note">
          <div className={o.calloutBody}>
            <p className={o.calloutTitle}>No splits yet</p>
            <p className={o.calloutText}>A split belongs to a release. Add your first release in Catalog, with its artist and songs, then come back to set who gets what.</p>
          </div>
          <Link href="/catalog/releases" className={o.linkInline}>Add a release</Link>
        </section>
      )}
      {artists.map((a) => (
        <section key={a.id} className={o.section} aria-labelledby={`sp-${a.id}`}>
          <h2 id={`sp-${a.id}`} className={o.sectionTitle}>{a.label}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(a.children ?? []).map((c) => <Branch key={c.id} node={c} path={[]} />)}
          </ul>
        </section>
      ))}
    </Page>
  );
}
