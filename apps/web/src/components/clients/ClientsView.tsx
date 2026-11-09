'use client';

import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import type { ClientsResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Blocks';
import o from '@/components/ops/Ops.module.css';
import s from '@/components/admin/InviteCodes.module.css';

/** Add clients and open their workspaces. Each client's data stays in their own workspace. */
export function ClientsView({ initial }: { initial: ClientsResponse }) {
  const [clients, setClients] = useState(initial.clients);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'artist' | 'label'>('artist');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setToast(null);
    try {
      const res = await fetch('/api/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, kind }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setToast({ ok: false, text: json?.message ?? 'That didn’t go through. Nothing was changed.' }); return; }
      setClients(json.clients); setToast({ ok: true, text: `${name.trim()} added. Open their workspace to invite them and add their music.` }); setName('');
    } catch { setToast({ ok: false, text: 'Couldn’t reach the server. Nothing was changed.' }); } finally { setBusy(false); }
  };
  const open = async (id: string) => {
    const res = await fetch('/api/session/tenant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: id }) }).catch(() => null);
    if (!res?.ok) { setToast({ ok: false, text: 'Couldn’t open that workspace. Try again.' }); return; }
    window.location.assign('/');
  };

  return (
    <>
      <div className={o.head}>
        <div>
          <PageTitle>Clients</PageTitle>
          <p className={o.sub}>Each client has their own workspace: their catalog, money, splits and documents stay separate from every other client’s. You work inside it as an owner, and invite the artist from its Settings, Team and roles.</p>
        </div>
      </div>

      <form className={s.form} onSubmit={add} style={{ gridTemplateColumns: 'minmax(0, 2fr) 200px auto' }}>
        <label className={s.field}>Client name
          <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="Rue Nova" />
        </label>
        <label className={s.field}>They are
          <select className={s.input} value={kind} onChange={(e) => setKind(e.target.value as 'artist' | 'label')}>
            <option value="artist">An artist or band</option>
            <option value="label">A label</option>
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Add client</Button>
      </form>

      {toast && <p className={o.toast} role={toast.ok ? 'status' : 'alert'}>{!toast.ok && <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{toast.text}</p>}

      {clients.length === 0 ? (
        <EmptyState title="No clients yet">Add the first artist or label you run releases for. They get their own workspace.</EmptyState>
      ) : (
        <div className={s.tableWrap} role="region" aria-label="Clients" tabIndex={0}>
          <table className={s.table}>
            <thead><tr><th scope="col">Client</th><th scope="col">Type</th><th scope="col">People</th><th scope="col">Added</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td>{c.kind === 'artist' ? 'Artist or band' : 'Label'}</td>
                  <td className={s.mono}>{c.people}</td>
                  <td>{c.added}</td>
                  <td><Button size="sm" onClick={() => open(c.id)} aria-label={`Open ${c.name}’s workspace`}>Open workspace</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
