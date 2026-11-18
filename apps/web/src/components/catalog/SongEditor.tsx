'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import type { z } from 'zod';
import type { CatalogResponse, SongEdit } from '@breakrecords/contract';
import { Button } from '@/components/ui/Button';
import { PartyPicker, type PartyValue, type PeopleList } from './People';
import o from '@/components/ops/Ops.module.css';
import s from './Catalog.module.css';

type Song = { id: string; title: string } & z.infer<typeof SongEdit>;
type Role = 'composer' | 'lyricist' | 'composer_lyricist';

/** A song's writer roles and publishers, other titles and the year it was written. Shares change in Splits. */
export function SongEditor({ song, people, onClose, onSaved }: { song: Song; people: PeopleList; onClose: () => void; onSaved: (c: z.infer<typeof CatalogResponse>) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const [writers, setWriters] = useState(song.writers.map((w) => ({ partyId: w.partyId, name: w.name, share: w.share, role: (w.role ?? '') as Role | '', publisher: (w.publisher ? { partyId: w.publisher.partyId } : null) as PartyValue })));
  const [alt, setAlt] = useState(song.altTitles.join('\n'));
  const [year, setYear] = useState(song.completionYear ? String(song.completionYear) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = people.map((p) => ({ id: p.id, name: p.name }));
  const save = async () => {
    setError(null);
    const y = year.trim() ? Number(year) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1900 || y > 2100)) { setError('The year written is a year, like 2025.'); return; }
    if (writers.some((w) => w.publisher && 'name' in w.publisher && !w.publisher.name.trim())) { setError('Type the new publisher’s name, or choose No publisher.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/catalog/songs/${encodeURIComponent(song.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          writers: writers.map((w) => ({ partyId: w.partyId, role: w.role || null, publisher: w.publisher && 'name' in w.publisher ? { name: w.publisher.name.trim() } : w.publisher })),
          altTitles: alt.split('\n').map((t) => t.trim()).filter(Boolean), completionYear: y,
        }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'That didn’t save. Nothing was changed.'); return; }
      ref.current?.close();
      onSaved(out);
    } catch { setError('Couldn’t reach the server. Nothing was changed.'); } finally { setBusy(false); }
  };
  return (
    <dialog ref={ref} className={o.drawer} aria-labelledby="song-h" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div className={o.drawerHead}><h2 id="song-h" className={o.drawerTitle}>Edit {song.title}</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={() => ref.current?.close()}><X size={16} aria-hidden="true" /></button></div>
      <form className={`${o.form} ${s.drawerScroll}`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className={o.small}>Who wrote it and their shares are set in <Link href="/splits" className={o.linkInline}>Splits</Link>. Here you add what the PRO and MLC forms ask about each writer.</p>
        {writers.length ? writers.map((w, i) => (
          <div key={w.partyId} className={s.writerBox}>
            <p className={o.cardTitle}><Link href={`/catalog/people/${w.partyId}`} className={o.linkInline}>{w.name}</Link> <span className={o.small}>{w.share}</span></p>
            <label className={o.field}>What {w.name} wrote
              <select className={o.input} value={w.role} onChange={(e) => setWriters(writers.map((x, j) => (j === i ? { ...x, role: e.target.value as Role | '' } : x)))}>
                <option value="">Not set</option><option value="composer_lyricist">Music and lyrics</option><option value="composer">Music</option><option value="lyricist">Lyrics</option>
              </select>
            </label>
            <PartyPicker label={`${w.name}’s publisher`} hint="The company that collects the publisher share. A writer without one can set up their own with their PRO." people={pick} value={w.publisher}
              onChange={(v) => setWriters(writers.map((x, j) => (j === i ? { ...x, publisher: v } : x)))} allowNone noneLabel="No publisher" />
          </div>
        )) : <p className={o.small}>No writers yet. Add them in <Link href="/splits" className={o.linkInline}>Splits</Link>.</p>}
        <label className={o.field}>Year written<input className={o.input} value={year} inputMode="numeric" maxLength={4} onChange={(e) => setYear(e.target.value)} /></label>
        <label className={o.field}>Other titles <span className={o.hint}>One a line. Only for a translation, a live version or a remix with the same writers.</span>
          <textarea className={`${o.input} ${s.textarea}`} rows={2} value={alt} onChange={(e) => setAlt(e.target.value)} />
        </label>
        {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{error}</p>}
        <div className={o.formActions}><Button type="submit" variant="primary" disabled={busy}>Save</Button><Button onClick={() => ref.current?.close()}>Cancel</Button></div>
      </form>
    </dialog>
  );
}
