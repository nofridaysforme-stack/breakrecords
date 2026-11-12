'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Upload, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { StatusPill, type Status } from '@/components/ui/Status';
import { Term } from '@/components/ui/Controls';
import { LinkTabs } from '@/components/ops/LinkTabs';
import { AddRelease, type EditTarget } from './AddRelease';
import type { getCatalog } from '@/data/api';
import type { Recording } from '@/data/ops';
import { formatIsrc, normalizeIsrc } from '@breakrecords/core/codes';
import type { CodesResponse } from '@breakrecords/contract';
import o from '@/components/ops/Ops.module.css';
import s from './Catalog.module.css';

type Data = Awaited<ReturnType<typeof getCatalog>>;
export type CatalogTab = 'songs' | 'recordings' | 'releases' | 'assets';

const AI_USE = ['Not declared', 'None', 'Partial, stems', 'Partial, vocals', 'Partial, artwork', 'Full'];

const scoreTone = (n: number) => (n >= 90 ? s.good : n >= 70 ? s.warn : s.critical);

/** 5a. The recordings tab has a 380px detail panel; the other tabs are plain lists from the same parts. */
export function CatalogView({ data, tab, initialId }: { data: Data; tab: CatalogTab; initialId?: string }) {
  const [list, setList] = useState(data.recordings);
  const [selectedId, setSelectedId] = useState(initialId && data.recordings.some((r) => r.id === initialId) ? initialId : data.recordings[0]?.id);
  const selected = list.find((r) => r.id === selectedId) ?? list[0];
  const upload = useRef<HTMLDialogElement>(null);
  const edit = useRef<HTMLDialogElement>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const codes = useCodes();
  const [adding, setAdding] = useState(false);

  /** Gives the recording the next ISRC from the workspace's prefix. */
  const assignIsrc = async (r: Recording) => {
    setSaveError(null); setSaved(null);
    const res = await fetch('/api/catalog/codes/assign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'isrc', id: r.id }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok) { setSaveError(json?.message ?? 'Couldn’t assign an ISRC. Nothing was changed.'); return; }
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, isrc: json.code } : x)));
    setSaved(`${r.title} now has ISRC ${formatIsrc(json.code)}.`);
    codes.refresh();
  };

  /** Shows the edit at once, then takes the server's version (rescored when live) or puts the old one back. */
  const save = async (next: Recording) => {
    const before = list.find((x) => x.id === next.id);
    const put = (r: Recording) => setList((l) => l.map((x) => (x.id === r.id ? r : x)));
    put(next); setSaveError(null);
    try {
      const res = await fetch(`/api/catalog/recordings/${encodeURIComponent(next.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ genre: next.genre, ai: next.ai, ...(next.isrc !== before?.isrc ? { isrc: next.isrc } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { if (before) put(before); setSaveError(json?.message ?? 'That didn’t save. Nothing was changed.'); return; }
      put({ ...next, ...json });
      setSaved(`${next.title} saved.`);
    } catch {
      if (before) put(before);
      setSaveError('Couldn’t reach the server. Nothing was changed.');
    }
  };

  const head = (
    <>
      <div className={o.head}>
        <PageTitle>Catalog</PageTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => setAdding(true)}>Add a release</Button>
          <Button variant="primary" onClick={() => upload.current?.showModal()}>Upload assets</Button>
        </div>
      </div>
      <LinkTabs label="Catalog" tabs={[
        { label: 'Songs', href: '/catalog/songs', count: data.counts.songs },
        { label: 'Recordings', href: '/catalog/recordings', count: data.counts.recordings },
        { label: 'Releases', href: '/catalog/releases', count: data.counts.releases },
        { label: 'Assets', href: '/catalog/assets', count: data.counts.assets },
      ]} />
      {saved && !saveError && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{saved}</p>}
      {saveError && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{saveError}</p>}
      {data.counts.releases === 0 && data.counts.recordings === 0 && (
        <div className={o.callout} role="note">
          <div className={o.calloutBody}>
            <p className={o.calloutTitle}>Your catalog is empty</p>
            <p className={o.calloutText}>Start with a release: its title, the artist and its songs. Then you can set its split and send it to everyone on it to sign.</p>
          </div>
          <Button variant="primary" onClick={() => setAdding(true)}>Add your first release</Button>
        </div>
      )}
      {queued.length > 0 && (
        <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{queued.length} {queued.length === 1 ? 'file' : 'files'} queued. Metadata Agent will check {queued.length === 1 ? 'it' : 'them'} before anything is delivered.</p>
      )}
    </>
  );

  const dialogs = (
    <>
      <UploadDialog ref={upload} onQueue={(names) => setQueued((q) => [...q, ...names])} />
      <AddRelease people={data.people ?? []} open={adding} onClose={() => setAdding(false)} />
      {selected && <EditDialog ref={edit} recording={selected} onSave={(r) => void save(r)} nextIsrc={codes.data?.nextIsrc ?? null} onAssign={(r) => void assignIsrc(r)} />}
    </>
  );

  if (tab !== 'recordings') {
    return <div className={s.single}>{head}{tab === 'songs' ? <Songs data={data} /> : tab === 'releases' ? <Releases data={data} nextUpc={codes.data?.nextUpc ?? null} onAssigned={codes.refresh} /> : <Assets data={data} />}{dialogs}</div>;
  }

  return (
    <div className={s.layout}>
      <div className={s.main}>
        {head}
        <div className={o.tableWrap} role="region" aria-label="Recordings" tabIndex={0}>
          <table className={`${o.table} ${s.recTable}`}>
            <colgroup><col className={s.cTitle} /><col className={s.cArtist} /><col className={s.cIsrc} /><col className={s.cMeta} /><col className={s.cAi} /></colgroup>
            <thead><tr><th scope="col">Recording</th><th scope="col">Artist</th><th scope="col"><Term term="ISRC" /></th><th scope="col">Metadata</th><th scope="col">AI use</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const on = r.id === selected?.id;
                return (
                  <tr key={r.id} className={`${o.clickRow} ${on ? o.selected : ''}`} onClick={() => setSelectedId(r.id)}>
                    <th scope="row">
                      <button type="button" className={o.rowLink} aria-pressed={on} onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}>
                        <span className={o.art} style={{ width: 32, height: 32 }} aria-hidden="true" />{r.title}
                      </button>
                    </th>
                    <td className={o.text2}>{r.artist}</td>
                    <td>{r.isrc ? <span className={o.cellMono}>{r.isrc}</span> : <span className={`${s.isrcMissing}`}><CircleAlert size={12} strokeWidth={2.5} aria-hidden="true" />Not assigned</span>}</td>
                    <td>
                      <span className={s.score}>
                        <span className={s.scoreTrack} aria-hidden="true"><span className={`${s.scoreFill} ${scoreTone(r.score)}`} style={{ width: `${r.score}%` }} /></span>
                        <span className={s.scoreNum}>{r.score}%</span>
                      </span>
                    </td>
                    <td className={s.ai}>{r.ai}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <aside className={s.detail} aria-label={`${selected.title} details`}>
          <div className={s.detailHead}>
            <div className={`${o.art} ${s.bigArt}`} aria-hidden="true">art</div>
            <div>
              <h2 className={s.detailTitle}>{selected.title}</h2>
              <p className={s.detailMeta}>Recording (master) · {selected.duration}</p>
            </div>
          </div>
          <dl className={o.kv}>
            <dt><Term term="ISRC" /></dt><dd className={o.kvMono}>{selected.isrc ?? 'Not assigned'}</dd>
            <dt><Term term="UPC" /></dt><dd className={o.kvMono}>{selected.upc ?? 'No release yet'}</dd>
            <dt>Song <span className={s.paren}>(composition)</span></dt><dd>{selected.song} · {selected.iswc ? <span className={o.kvMono}>{selected.iswc}</span> : <>ISWC pending</>}</dd>
            <dt>Genre</dt><dd>{selected.genre ?? 'Not set'}</dd>
            <dt>AI use</dt><dd>{selected.ai === 'None' ? 'None declared' : selected.ai} · <button type="button" className={o.linkInline} onClick={() => edit.current?.showModal()} aria-label={`Edit AI use for ${selected.title}`}>edit</button></dd>
          </dl>
          <section aria-labelledby="credits-h" className={s.credits}>
            <h3 id="credits-h" className={o.eyebrow}>Credits</h3>
            <ul>{selected.credits.map((c) => <li key={c.name} className={s.credit}><span>{c.name}</span><span className={o.text2}>{c.role}</span></li>)}</ul>
          </section>
          <p className={o.note}><strong>{selected.score}% complete.</strong> {selected.note}</p>
          <Button variant="primary" block className={s.editBtn} onClick={() => edit.current?.showModal()}>Edit metadata</Button>
        </aside>
      )}
      {dialogs}
    </div>
  );
}

function Songs({ data }: { data: Data }) {
  return (
    <div className={o.tableWrap} role="region" aria-label="Songs" tabIndex={0}>
      <table className={o.table}>
        <thead><tr><th scope="col">Song (composition)</th><th scope="col">Writers</th><th scope="col"><Term term="ISWC" /></th><th scope="col">Recordings</th><th scope="col"><Term term="MLC" /></th></tr></thead>
        <tbody>
          {data.songs.map((x) => (
            <tr key={x.id}>
              <th scope="row" className={o.rowName}>{x.title}</th>
              <td className={o.text2}>{x.writers}</td>
              <td>{x.iswc ? <span className={o.cellMono}>{x.iswc}</span> : <span className={o.muted}>Pending</span>}</td>
              <td className={o.mono}>{x.recordings}</td>
              <td><StatusPill status={x.mlc as Status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Releases({ data, nextUpc, onAssigned }: { data: Data; nextUpc: string | null; onAssigned: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState(data.releases);
  const [changing, setChanging] = useState<EditTarget | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (id: string, title: string) => {
    setToast(null);
    const res = await fetch(`/api/catalog/releases/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setRemoving(null);
    if (!res?.ok) { setToast({ ok: false, text: json?.message ?? 'That release wasn’t removed.' }); return; }
    setRows((r) => r.filter((x) => x.id !== id));
    setToast({ ok: true, text: `${title} was removed from your catalog.` });
    router.refresh();
  };
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const has = (upc: string) => /^\d{12,13}$/.test(upc);
  const done = (id: string, upc: string | null, text: string) => { setRows((r) => r.map((x) => (x.id === id ? { ...x, upc: upc ?? 'Not assigned' } : x))); setToast({ ok: true, text }); setEditing(null); };
  const saveUpc = async (id: string, title: string) => {
    setToast(null);
    const res = await fetch(`/api/catalog/releases/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ upc: value.trim() || null }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok) { setToast({ ok: false, text: json?.message ?? 'That didn’t save. Nothing was changed.' }); return; }
    done(id, json.upc, json.upc ? `${title} now has UPC ${json.upc}.` : `${title}’s UPC was removed.`);
  };
  const assign = async (id: string, title: string) => {
    setToast(null);
    const res = await fetch('/api/catalog/codes/assign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'upc', id }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok) { setToast({ ok: false, text: json?.message ?? 'Couldn’t assign a UPC. Nothing was changed.' }); return; }
    done(id, json.code, `${title} now has UPC ${json.code}.`);
    onAssigned();
  };
  return (
    <>
      {toast && <p className={o.toast} role={toast.ok ? 'status' : 'alert'}>{toast.ok ? <Check size={16} className={o.good} aria-hidden="true" /> : <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{toast.text}</p>}
      {changing && <AddRelease key={changing.id} people={data.people ?? []} open edit={changing} onClose={() => setChanging(null)} />}
      <div className={o.tableWrap} role="region" aria-label="Releases" tabIndex={0}>
        <table className={o.table}>
          <thead><tr><th scope="col">Release</th><th scope="col">Artist</th><th scope="col">Type</th><th scope="col">Release date</th><th scope="col"><Term term="UPC" /></th><th scope="col">Tracks</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.href ? <Link href={r.href} className={o.rowLink}><span className={o.art} style={{ width: 32, height: 32 }} aria-hidden="true" />{r.title}</Link> : <span className={o.rowLink} style={{ cursor: 'default' }}><span className={o.art} style={{ width: 32, height: 32 }} aria-hidden="true" />{r.title}</span>}</th>
                <td className={o.text2}>{r.artist}</td>
                <td className={o.text2}>{r.kind}</td>
                <td className={o.dateMono}>{r.date}</td>
                <td className={o.cellMono}>
                  {editing === r.id ? (
                    <form style={{ display: 'flex', gap: 6, alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); void saveUpc(r.id, r.title); }}>
                      <label className="visually-hidden" htmlFor={`upc-${r.id}`}>UPC for {r.title}</label>
                      <input id={`upc-${r.id}`} className={o.input} style={{ width: 150 }} value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="12 digits" />
                      <Button size="sm" type="submit">Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {r.upc}
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r.id); setValue(has(r.upc) ? r.upc : ''); }} aria-label={`Edit the UPC for ${r.title}`}>Edit</Button>
                      {!has(r.upc) && nextUpc && <Button size="sm" onClick={() => void assign(r.id, r.title)} aria-label={`Assign the next UPC to ${r.title}`}>Assign {nextUpc}</Button>}
                    </span>
                  )}
                </td>
                <td className={o.mono}>
                  {r.tracks}
                  {'edit' in r && r.edit && ((ed) => (
                    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 12, fontFamily: 'var(--font-body)' }}>
                      <Button size="sm" onClick={() => setChanging({ id: r.id, title: r.title, ...ed })}>Edit<span className="visually-hidden"> {r.title}</span></Button>
                      {removing === r.id
                        ? <><Button size="sm" variant="destructive" onClick={() => void remove(r.id, r.title)}>Remove {r.title}</Button><Button size="sm" onClick={() => setRemoving(null)}>Keep</Button></>
                        : <Button size="sm" onClick={() => setRemoving(r.id)}>Remove<span className="visually-hidden"> {r.title}</span></Button>}
                    </span>
                  ))(r.edit as Omit<EditTarget, 'id' | 'title'>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!nextUpc && <p className={o.small}>Your distributor gives you a UPC, or set your GS1 company prefix in Settings, Profile to assign your own.</p>}
    </>
  );
}

function Assets({ data }: { data: Data }) {
  return (
    <ul className={s.assets}>
      {data.assets.map((a) => (
        <li key={a.name} className={o.card}>
          <span className={`${o.art} ${s.assetArt}`} aria-hidden="true" />
          <span className={o.cardTitle}>{a.name}</span>
          <span className={o.cardMeta}>{a.kind} · {a.release}</span>
          <span className={`${o.status} ${a.ready ? o.good : o.warn}`}>{a.ready ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : <CircleAlert size={13} strokeWidth={2.5} aria-hidden="true" />}{a.ready ? 'Ready' : 'Missing'}</span>
        </li>
      ))}
    </ul>
  );
}

function Drawer({ ref, title, id, children }: { ref: React.Ref<HTMLDialogElement>; title: string; id: string; children: ReactNode }) {
  const close = (e: React.MouseEvent) => (e.currentTarget.closest('dialog') as HTMLDialogElement).close();
  return (
    <dialog ref={ref} className={o.drawer} aria-labelledby={id} onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div className={o.drawerHead}><h2 id={id} className={o.drawerTitle}>{title}</h2><button type="button" className={o.iconBtn} aria-label="Close" onClick={close}><X size={16} aria-hidden="true" /></button></div>
      {children}
    </dialog>
  );
}

function UploadDialog({ ref, onQueue }: { ref: React.RefObject<HTMLDialogElement | null>; onQueue: (names: string[]) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  return (
    <Drawer ref={ref} title="Upload assets" id="upload-h">
      <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (files.length) { onQueue(files); setFiles([]); ref.current?.close(); } }}>
        <label className={o.drop}>
          <span><Upload size={18} aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px' }} />Drop audio, art or documents, or choose files</span>
          <input type="file" multiple className="visually-hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))} />
        </label>
        {files.length > 0 && <ul className={o.small}>{files.map((f) => <li key={f}>{f}</li>)}</ul>}
        <p className={o.small}>Files stay in your catalog. Nothing goes to stores until a release is delivered, and that needs your approval.</p>
        <div className={o.formActions}>
          <Button variant="primary" type="submit" disabled={!files.length} disabledReason="Choose at least one file.">Queue {files.length || ''} {files.length === 1 ? 'file' : 'files'}</Button>
          <Button onClick={() => ref.current?.close()}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
}

function EditDialog({ ref, recording, onSave, nextIsrc, onAssign }: { ref: React.RefObject<HTMLDialogElement | null>; recording: Recording; onSave: (r: Recording) => void; nextIsrc: string | null; onAssign: (r: Recording) => void }) {
  const [genre, setGenre] = useState(recording.genre ?? '');
  const [ai, setAi] = useState(recording.ai);
  const [isrc, setIsrc] = useState(recording.isrc ?? '');
  const [last, setLast] = useState(`${recording.id}:${recording.isrc}`);
  if (last !== `${recording.id}:${recording.isrc}`) { setLast(`${recording.id}:${recording.isrc}`); setGenre(recording.genre ?? ''); setAi(recording.ai); setIsrc(recording.isrc ?? ''); }
  return (
    <Drawer ref={ref} title={`Edit ${recording.title}`} id="edit-h">
      <form className={o.form} onSubmit={(e) => { e.preventDefault(); onSave({ ...recording, genre: genre.trim() || null, ai, isrc: isrc.trim() ? normalizeIsrc(isrc) : null }); ref.current?.close(); }}>
        <label className={o.field}>Genre<input className={o.input} value={genre} onChange={(e) => setGenre(e.target.value)} /></label>
        <label className={o.field}>AI use
          <select className={o.input} value={ai} onChange={(e) => setAi(e.target.value)}>{AI_USE.filter((v) => v !== 'Not declared' || ai === 'Not declared').map((v) => <option key={v} value={v}>{v === 'None' ? 'None declared' : v}</option>)}</select>
          <span className={o.hint}>Stores ask for this. Declare any AI in the audio, lyrics or art.</span>
        </label>
        <label className={o.field}><span><Term term="ISRC" /></span>
          <input className={o.input} value={isrc} onChange={(e) => setIsrc(e.target.value)} placeholder="US-XXX-26-00001" autoCapitalize="characters" spellCheck={false} />
          <span className={o.hint}>From your distributor, or your own. Change it only if it’s wrong: stores pay by it.</span>
        </label>
        {!recording.isrc && nextIsrc && (
          <Button onClick={() => { onAssign(recording); ref.current?.close(); }}>Assign the next ISRC ({formatIsrc(nextIsrc)})</Button>
        )}
        <p className={o.small}>Credits come from signed agreements, so Metadata Agent updates them.</p>
        <div className={o.formActions}><Button variant="primary" type="submit">Save</Button><Button onClick={() => ref.current?.close()}>Cancel</Button></div>
      </form>
    </Drawer>
  );
}

/** The workspace's code prefixes and the next code each would give (null until loaded). */
function useCodes() {
  const [data, setData] = useState<CodesResponse | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => { fetch('/api/catalog/codes').then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null)); }, [n]);
  return { data, refresh: () => setN((x) => x + 1) };
}
