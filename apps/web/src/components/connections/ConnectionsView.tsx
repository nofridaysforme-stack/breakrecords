'use client';

import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Blocks';
import o from '@/components/ops/Ops.module.css';
import s from '@/components/admin/InviteCodes.module.css';

/**
 * Labels that pay you. Inside each you see only what your deal covers: your statements,
 * splits, payouts and tax form. Your own music and tools stay in your workspace.
 */
export function ConnectionsView({ workspace, labels }: { workspace: string; labels: { id: string; name: string }[] }) {
  const [error, setError] = useState('');
  const open = async (id: string) => {
    setError('');
    const res = await fetch('/api/session/tenant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: id }) }).catch(() => null);
    if (!res?.ok) { setError('Couldn’t open that label. Try again.'); return; }
    window.location.assign('/portal');
  };
  return (
    <>
      <div className={o.head}>
        <div>
          <PageTitle>Labels I work with</PageTitle>
          <p className={o.sub}>Labels that pay you. Open one to see your statements, splits, payouts and tax form with it. They can’t see inside {workspace}.</p>
        </div>
      </div>
      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{error}</p>}
      {labels.length === 0 ? (
        <EmptyState title="No labels yet">When a label invites you as an artist or payee, it shows up here.</EmptyState>
      ) : (
        <div className={s.tableWrap} role="region" aria-label="Labels I work with" tabIndex={0}>
          <table className={s.table}>
            <thead><tr><th scope="col">Label</th><th scope="col">What you see</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l.id}>
                  <th scope="row">{l.name}</th>
                  <td>Your statements, splits, payouts and tax form</td>
                  <td><Button size="sm" onClick={() => open(l.id)} aria-label={`Open what ${l.name} pays you`}>Open</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
