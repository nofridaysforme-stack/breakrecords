'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import o from '@/components/ops/Ops.module.css';

type Person = { id: string; name: string };
type Track = { id?: string; title: string; isrc: string };
export type EditTarget = { id: string; title: string; kind: 'single' | 'ep' | 'album'; releaseDate: string | null; tracks: { id: string; title: string; isrc: string | null }[] };

/**
 * Adds a release and its songs: title, kind, artist (someone already here, or a new person or
 * band), release date and tracks in order, each with an ISRC if it has one. Then offers the split.
 */
export function AddRelease({ people, open, onClose, edit }: { people: Person[]; open: boolean; onClose: () => void; edit?: EditTarget }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(edit?.title ?? '');
  const [kind, setKind] = useState<'single' | 'ep' | 'album'>(edit?.kind ?? 'single');
  const [artistId, setArtistId] = useState(people[0]?.id ?? 'new');
  const [newArtist, setNewArtist] = useState('');
  const [group, setGroup] = useState(false);
  const [date, setDate] = useState(edit?.releaseDate ?? '');
  const [tracks, setTracks] = useState<Track[]>(edit ? edit.tracks.map((t) => ({ id: t.id, title: t.title, isrc: t.isrc ?? '' })) : [{ title: '', isrc: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { if (open && ref.current && !ref.current.open) ref.current.showModal(); }, [open]);
  const close = () => { ref.current?.close(); onClose(); };
  const isNew = !edit && artistId === 'new';
  const valid = !!title.trim() && (!isNew || !!newArtist.trim()) && tracks.every((t) => t.title.trim());
  const setTrack = (i: number, t: Partial<Track>) => setTracks((ts) => ts.map((x, j) => (j === i ? { ...x, ...t } : x)));

  async function submit() {
    setError(null); setBusy(true);
    try {
      const trackBody = tracks.map((t) => ({ ...(t.id ? { id: t.id } : {}), title: t.title.trim(), ...(t.isrc.trim() ? { isrc: t.isrc.trim() } : {}) }));
      const res = edit
        ? await fetch(`/api/catalog/releases/${encodeURIComponent(edit.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: title.trim(), kind, releaseDate: date || null, tracks: trackBody }) })
        : await fetch('/api/catalog/releases', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(), kind, ...(date ? { releaseDate: date } : {}),
              artist: isNew ? { name: newArtist.trim(), ...(group ? { group: true } : {}) } : { partyId: artistId },
              tracks: trackBody,
            }),
          });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'That release wasn’t saved.'); return; }
      router.refresh();
      if (edit) { close(); return; }
      setDone(title.trim());
      setTitle(''); setNewArtist(''); setDate(''); setTracks([{ title: '', isrc: '' }]);
    } catch { setError('Couldn’t reach the server. Nothing was saved.'); } finally { setBusy(false); }
  }

  return (
    <dialog ref={ref} className={o.drawer} aria-labelledby="add-release-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={o.drawerHead}>
        <h2 id="add-release-title" className={o.drawerTitle}>{edit ? `Change ${edit.title}` : 'Add a release'}</h2>
        <button type="button" className={o.iconBtn} aria-label="Close" onClick={close}><X size={18} aria-hidden="true" /></button>
      </div>
      {done ? (
        <div className={o.form}>
          <p className={o.text} role="status"><Check size={16} className={o.good} aria-hidden="true" /> {done} is in your catalog.</p>
          <p className={o.text}>Next, set who gets paid from it: create its split and send it to everyone on it to sign.</p>
          <div className={o.formActions}>
            <Link href="/splits?create=1" className={o.linkInline} onClick={close}>Create its split</Link>
            <Button onClick={() => setDone(null)}>Add another release</Button>
          </div>
        </div>
      ) : (
        <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void submit(); }}>
          <label className={o.field}>Title<input className={o.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
          <div className={o.field}><label htmlFor="f-kind">Kind</label>            <select id="f-kind" className={o.input} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="single">Single</option><option value="ep">EP</option><option value="album">Album</option>
            </select>
          </div>
          {!edit && <div className={o.field}><label htmlFor="f-artist">Artist</label>            <select id="f-artist" className={o.input} value={artistId} onChange={(e) => setArtistId(e.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="new">Someone new</option>
            </select>
          </div>}
          {isNew && (
            <>
              <label className={o.field}>Artist name<input className={o.input} value={newArtist} onChange={(e) => setNewArtist(e.target.value)} maxLength={120} /></label>
              <label className={o.field} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />This is a band or duo</label>
            </>
          )}
          <label className={o.field}>Release date (optional)<input className={o.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <fieldset className={o.form} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={o.field}>Tracks, in order</legend>
            {edit && <p className={o.hint}>A track you take off is removed from the catalog too, unless it has earned income or is registered.</p>}
            {tracks.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label className={o.field} style={{ flex: '2 1 180px' }}>Track {i + 1} title<input className={o.input} value={t.title} onChange={(e) => setTrack(i, { title: e.target.value })} maxLength={200} /></label>
                <label className={o.field} style={{ flex: '1 1 140px' }}>ISRC (optional)<input className={o.input} value={t.isrc} onChange={(e) => setTrack(i, { isrc: e.target.value })} maxLength={20} placeholder="US-ABC-26-00001" /></label>
                {tracks.length > 1 && <button type="button" className={o.iconBtn} aria-label={`Remove track ${i + 1}`} onClick={() => setTracks((ts) => ts.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>}
              </div>
            ))}
            <div><Button size="sm" onClick={() => setTracks((ts) => [...ts, { title: '', isrc: '' }])}><Plus size={14} aria-hidden="true" />Add a track</Button></div>
          </fieldset>
          {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Not saved. {error}</p>}
          <div className={o.formActions}>
            <Button type="submit" variant="primary" disabled={!valid || busy} disabledReason="Give the release a title, an artist and a title for every track.">{edit ? 'Save changes' : 'Add release'}</Button>
            <Button onClick={close}>Cancel</Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
