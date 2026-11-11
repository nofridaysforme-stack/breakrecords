import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import type { SplitNode } from '@/components/ui/Splits';
import { getSplitTree } from '@/data/api';
import o from '@/components/ops/Ops.module.css';

export const metadata: Metadata = { title: 'Splits' };

/** Every income stream that can carry its own split, under the artist and release it belongs to. */
function Branch({ node, path }: { node: SplitNode; path: string[] }) {
  if (!node.children?.length) {
    return <li><Link href={`/splits/${node.id}`} className={o.rowName}>{[...path, node.label].join(' · ')}</Link></li>;
  }
  return <>{node.children.map((c) => <Branch key={c.id} node={c} path={[...path, node.label]} />)}</>;
}

export default async function SplitsIndex() {
  const tree = await getSplitTree();
  const artists = tree.flatMap((root) => root.children ?? []);
  return (
    <Page>
      <div className={o.head}>
        <div>
          <PageTitle>Splits</PageTitle>
          <p className={o.sub}>Who gets what from each income stream. Open one to see its versions, signatures and draft.</p>
        </div>
      </div>
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
