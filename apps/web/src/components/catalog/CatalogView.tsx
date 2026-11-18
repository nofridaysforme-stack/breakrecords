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
import { PartyPicker, PeopleTable, type PartyValue, type PeopleList } from './People';
import { SongEditor } from './SongEditor';
import { CREDIT_ROLES, parseLength } from '@breakrecords/core/people';
import type { RecordingRights, SongEdit, UpdateRecordingCommand } from '@breakrecords/contract';
import type { z } from 'zod';
import type { getCatalog } from '@/data/api';
import type { Recording } from '@/data/ops';
import { formatIsrc, normalizeIsrc } from '@breakrecords/core/codes';
import type { CodesResponse } from '@breakrecords/contract';
import o from '@/components/ops/Ops.module.css';
import s from './Catalog.module.css';

type Data = Awaited<ReturnType<typeof getCatalog>>;
export type CatalogTab = 'songs' | 'recordings' | 'releases' | 'assets' | 'people';

const AI_USE = ['Not declared', 'None', 'Partial, stems', 'Partial, vocals', 'Partial, artwork', 'Full'];

const scoreTone = (n: number) => (n >= 90 ? s.good : n >= 70 ? s.warn : s.critical);

/** 5a. The recordings tab has a 380px detail panel; the other tabs are plain lists from the same parts. */
export function CatalogView({ data, tab, initialId, inProgress, people = [], openEdit }: { data: Data; tab: CatalogTab; initialId?: string; inProgress?: ReactNode; people?: PeopleList; openEdit?: string }) {
  const [list, setList] = useState(data.recordings);
  const [selectedId, setSelectedId] = useState(initialId && data.recordings.some((r) => r.id === initialId) ? initialId : data.recordings[0]?.id);
  const selected = list.find((r) => r.id === selectedId) ?? list[0];
  const upload = useRef<HTMLDialogElement>(null);
  const edit = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const codes = useCodes();
  const [adding, setAdding] = useState(false);
  // Opened from a "Fix it" link: show this recording's edit panel straight away.
  useEffect(() => { if (tab === 'recordings' && openEdit && openEdit === selectedId) edit.current?.showModal(); }, [tab, openEdit, selectedId]);

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
  const save = async (next: Recording, rights: Partial<UpdateRecordingCommand> = {}) => {
    const before = list.find((x) => x.id === next.id);
    const put = (r: Recording) => setList((l) => l.map((x) => (x.id === r.id ? r : x)));
    put(next); setSaveError(null);
    try {
      const res = await fetch(`/api/catalog/recordings/${encodeURIComponent(next.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ genre: next.genre, ai: next.ai, ...(next.isrc !== before?.isrc ? { isrc: next.isrc } : {}), ...rights }),
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
        { label: 'People', href: '/catalog/people', count: people.length || undefined },
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
    </>
  );

  const dialogs = (
    <>
      <UploadDialog ref={upload} data={data} onDone={(text, ok) => { if (ok) { setSaved(text); setSaveError(null); router.refresh(); } }} />
      <AddRelease people={data.people ?? []} open={adding} onClose={() => setAdding(false)} />
      {selected && <EditDialog ref={edit} recording={selected} people={people} onSave={(r, rights) => void save(r, rights)} nextIsrc={codes.data?.nextIsrc ?? null} onAssign={(r) => void assignIsrc(r)} />}
    </>
  );

  if (tab !== 'recordings') {
    return <div className={s.single}>{head}{tab === 'songs' ? <Songs data={data} people={people} openEdit={openEdit} /> : tab === 'releases' ? <>{inProgress}<Releases data={data} nextUpc={codes.data?.nextUpc ?? null} onAssigned={codes.refresh} openEdit={openEdit} /></> : tab === 'people' ? <PeopleTable people={people} /> : <Assets data={data} />}{dialogs}</div>;
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
            <dt>Master owner</dt><dd>{rightsOf(selected)?.owner ? <Link href={`/catalog/people/${rightsOf(selected)!.owner!.partyId}`} className={o.linkInline}>{rightsOf(selected)!.owner!.name}</Link> : 'Not set'}</dd>
            <dt>AI use</dt><dd>{selected.ai === 'None' ? 'None declared' : selected.ai} · <button type="button" className={o.linkInline} onClick={() => edit.current?.showModal()} aria-label={`Edit AI use for ${selected.title}`}>edit</button></dd>
          </dl>
          <section aria-labelledby="credits-h" className={s.credits}>
            <h3 id="credits-h" className={o.eyebrow}>Credits</h3>
            {selected.credits.length ? <ul>{selected.credits.map((c) => {
              const id = rightsOf(selected)?.credits.find((x) => x.name === c.name)?.partyId;
              return <li key={c.name} className={s.credit}>{id ? <Link href={`/catalog/people/${id}`} className={o.linkInline}>{c.name}</Link> : <span>{c.name}</span>}<span className={o.text2}>{c.role}</span></li>;
            })}</ul> : <p className={o.small}>No one credited yet.</p>}
          </section>
          <p className={o.note}><strong>{selected.score}% complete.</strong> {selected.note}</p>
          <Button variant="primary" block className={s.editBtn} onClick={() => edit.current?.showModal()}>Edit metadata</Button>
        </aside>
      )}
      {dialogs}
    </div>
  );
}

type Rights = z.infer<typeof RecordingRights>;
type SongRow = Data['songs'][number] & { edit?: z.infer<typeof SongEdit> };
const rightsOf = (r: Recording) => (r as Recording & { rights?: Rights }).rights;

function Songs({ data, people, openEdit }: { data: Data; people: PeopleList; openEdit?: string }) {
  const [songs, setSongs] = useState(data.songs as SongRow[]);
  const [editing, setEditing] = useState<string | null>(openEdit && data.songs.some((x) => x.id === openEdit) ? openEdit : null);
  const [toast, setToast] = useState<string | null>(null);
  const song = songs.find((x) => x.id === editing);
  return (
    <>
    {toast && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{toast}</p>}
    {song?.edit && <SongEditor key={song.id} song={{ id: song.id, title: song.title, ...song.edit }} people={people} onClose={() => setEditing(null)}
      onSaved={(cat) => { setSongs(cat.songs as SongRow[]); setToast(`${song.title} saved.`); setEditing(null); }} />}
    <div className={o.tableWrap} role="region" aria-label="Songs" tabIndex={0}>
      <table className={o.table}>
        <thead><tr><th scope="col">Song (composition)</th><th scope="col">Writers</th><th scope="col"><Term term="ISWC" /></th><th scope="col">Recordings</th><th scope="col"><Term term="MLC" /></th></tr></thead>
        <tbody>
          {songs.map((x) => (
            <tr key={x.id}>
              <th scope="row" className={o.rowName}>{x.title}</th>
              <td className={o.text2}>{x.writers}</td>
              <td>{x.iswc ? <span className={o.cellMono}>{x.iswc}</span> : <span className={o.muted}>Pending</span>}</td>
              <td className={o.mono}>{x.recordings}</td>
              <td><StatusPill status={x.mlc as Status} />{x.edit && <Button size="sm" onClick={() => setEditing(x.id)} style={{ marginLeft: 10 }}>Edit<span className="visually-hidden"> {x.title}</span></Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function Releases({ data, nextUpc, onAssigned, openEdit }: { data: Data; nextUpc: string | null; onAssigned: () => void; openEdit?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(data.releases);
  const [changing, setChanging] = useState<EditTarget | null>(() => {
    const r = openEdit ? data.releases.find((x) => x.id === openEdit) : undefined;
    return r && 'edit' in r && r.edit ? { id: r.id, title: r.title, ...(r.edit as Omit<EditTarget, 'id' | 'title'>) } : null;
  });
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
      {(data.assets as (Data["assets"][number] & { size?: string; href?: string })[]).map((a) => (
        <li key={a.name} className={o.card}>
          <span className={`${o.art} ${s.assetArt}`} aria-hidden="true" />
          <span className={o.cardTitle}>{a.name}</span>
          <span className={o.cardMeta}>{a.kind} · {a.release}{a.size ? ` · ${a.size}` : ''}</span>
          {a.href && <a className={o.linkInline} href={a.href}>Download<span className="visually-hidden"> {a.name}</span></a>}
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

const KINDS: [string, string][] = [['cover_art', 'Cover art'], ['master_audio', 'Master audio'], ['instrumental', 'Instrumental'], ['stems', 'Stems'], ['lyrics', 'Lyrics'], ['press_photo', 'Press photo'], ['document', 'Document']];
const guessKind = (f: File) => (f.type.startsWith('image/') ? 'cover_art' : f.type.startsWith('audio/') || /\.(wav|aiff?|flac|mp3)$/i.test(f.name) ? 'master_audio' : /\.(txt|lrc)$/i.test(f.name) ? 'lyrics' : 'document');

/** Sends one file: straight to storage when it can, else through the app; then confirms it arrived. */
async function sendFile(file: File, kind: string, attach: string): Promise<string | null> {
  const [what, id] = attach ? attach.split(':') : ['', ''];
  const start = await fetch('/api/catalog/assets', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: file.name, kind, size: file.size, contentType: file.type || undefined, ...(what === 'release' ? { releaseId: id } : what === 'recording' ? { recordingId: id } : {}) }) });
  const s = await start.json().catch(() => null);
  if (!start.ok) return s?.message ?? `${file.name} couldn’t be started.`;
  const put = (url: string) => fetch(url, { method: 'PUT', body: file, headers: file.type ? { 'content-type': file.type } : {} });
  let sent = await put(s.upload.url).then((r) => r.ok).catch(() => false);
  if (!sent && s.fallback) sent = await put(s.fallback).then((r) => r.ok).catch(() => false);
  if (!sent) return s.upload.via === 'storage' && !s.fallback
    ? `${file.name} didn’t reach file storage. Large files go straight from your browser to storage; check that storage allows uploads from this site.`
    : `${file.name} didn’t upload. Nothing was saved.`;
  const done = await fetch(`/api/catalog/assets/${s.id}/done`, { method: 'POST' });
  if (!done.ok) return (await done.json().catch(() => null))?.message ?? `${file.name} didn’t finish uploading.`;
  return null;
}

function UploadDialog({ ref, data, onDone }: { ref: React.RefObject<HTMLDialogElement | null>; data: Data; onDone: (text: string, ok: boolean) => void }) {
  const [files, setFiles] = useState<{ file: File; kind: string }[]>([]);
  const [attach, setAttach] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = async () => {
    setError(null);
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}: ${f.file.name}`);
      const problem = await sendFile(f.file, f.kind, attach);
      if (problem) failed.push(problem);
    }
    setBusy(null);
    if (failed.length) { setError(failed.join(' ')); if (failed.length < files.length) onDone(`${files.length - failed.length} uploaded.`, true); return; }
    onDone(`${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded and saved.`, true);
    setFiles([]); ref.current?.close();
  };
  return (
    <Drawer ref={ref} title="Upload assets" id="upload-h">
      <form className={`${o.form} ${s.drawerScroll}`} onSubmit={(e) => { e.preventDefault(); if (files.length) void upload(); }}>
        <label className={o.drop}>
          <span><Upload size={18} aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px' }} />Drop audio, art or documents, or choose files</span>
          <input type="file" multiple className="visually-hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((file) => ({ file, kind: guessKind(file) })))} />
        </label>
        {files.map((f, i) => (
          <label key={f.file.name + i} className={o.field}>{f.file.name} <span className={o.hint}>{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
            <select className={o.input} value={f.kind} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <label className={o.field}>For
          <select className={o.input} value={attach} onChange={(e) => setAttach(e.target.value)}>
            <option value="">Nothing in particular</option>
            {data.releases.length > 0 && <optgroup label="Releases">{data.releases.map((r) => <option key={r.id} value={`release:${r.id}`}>{r.title}</option>)}</optgroup>}
            {data.recordings.length > 0 && <optgroup label="Recordings">{data.recordings.map((r) => <option key={r.id} value={`recording:${r.id}`}>{r.title}</option>)}</optgroup>}
          </select>
          <span className={o.hint}>Cover art goes with a release; masters and stems with a recording.</span>
        </label>
        <p className={o.small}>Files are kept privately for your workspace. Nothing goes to stores until a release is delivered, and that needs your approval.</p>
        {busy && <p className={o.small} role="status">{busy}</p>}
        {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{error}</p>}
        <div className={o.formActions}>
          <Button variant="primary" type="submit" disabled={!files.length || !!busy} disabledReason="Choose at least one file.">{busy ? 'Uploading' : `Upload ${files.length || ''} ${files.length === 1 ? 'file' : 'files'}`}</Button>
          <Button onClick={() => ref.current?.close()}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
}

type CreditRow = { key: number; party: PartyValue; role: string };
const fmtLength = (sec: number | null) => (sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '');

function EditDialog({ ref, recording, people, onSave, nextIsrc, onAssign }: { ref: React.RefObject<HTMLDialogElement | null>; recording: Recording; people: PeopleList; onSave: (r: Recording, rights: Partial<UpdateRecordingCommand>) => void; nextIsrc: string | null; onAssign: (r: Recording) => void }) {
  const rights = rightsOf(recording);
  const init = () => ({
    genre: recording.genre ?? '', ai: recording.ai, isrc: recording.isrc ?? '',
    credits: (rights?.credits ?? []).map((c, i) => ({ key: i, party: { partyId: c.partyId } as PartyValue, role: c.role })),
    owner: (rights?.owner ? { partyId: rights.owner.partyId } : null) as PartyValue,
    pYear: rights?.pYear ? String(rights.pYear) : '', length: fmtLength(rights?.durationS ?? null),
  });
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const sig = `${recording.id}:${recording.isrc}:${JSON.stringify(rights ?? null)}`;
  const [last, setLast] = useState(sig);
  if (last !== sig) { setLast(sig); setF(init()); }
  const pick = people.map((p) => ({ id: p.id, name: p.name }));
  const ref2 = (v: PartyValue) => (v && 'name' in v ? { name: v.name.trim() } : v);
  const submit = () => {
    setError(null);
    const out: Partial<UpdateRecordingCommand> = {};
    if (rights) {
      const credits = f.credits.filter((c) => c.party && ('partyId' in c.party || c.party.name.trim()));
      if (credits.some((c) => !c.role.trim())) { setError('Give each credit a role, like Producer.'); return; }
      const now = credits.map((c) => ({ party: ref2(c.party)!, role: c.role.trim() }));
      if (JSON.stringify(now) !== JSON.stringify(rights.credits.map((c) => ({ party: { partyId: c.partyId }, role: c.role })))) out.credits = now;
      const owner = f.owner && 'name' in f.owner && !f.owner.name.trim() ? null : ref2(f.owner);
      if (JSON.stringify(owner) !== JSON.stringify(rights.owner ? { partyId: rights.owner.partyId } : null)) out.owner = owner;
      const year = f.pYear.trim() ? Number(f.pYear) : null;
      if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) { setError('The ℗ year is a year, like 2026.'); return; }
      if (year !== rights.pYear) out.pYear = year;
      const len = f.length.trim() ? parseLength(f.length) : null;
      if (f.length.trim() && len === null) { setError('Write the length as minutes and seconds, like 3:45.'); return; }
      if (len !== rights.durationS) out.durationS = len;
    }
    onSave({ ...recording, genre: f.genre.trim() || null, ai: f.ai, isrc: f.isrc.trim() ? normalizeIsrc(f.isrc) : null }, out);
    ref.current?.close();
  };
  return (
    <Drawer ref={ref} title={`Edit ${recording.title}`} id="edit-h">
      <form className={`${o.form} ${s.drawerScroll}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className={o.field}>Genre<input className={o.input} value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })} /></label>
        <label className={o.field}>AI use
          <select className={o.input} value={f.ai} onChange={(e) => setF({ ...f, ai: e.target.value })}>{AI_USE.filter((v) => v !== 'Not declared' || f.ai === 'Not declared').map((v) => <option key={v} value={v}>{v === 'None' ? 'None declared' : v}</option>)}</select>
          <span className={o.hint}>Stores ask for this. Declare any AI in the audio, lyrics or art.</span>
        </label>
        <label className={o.field}><span><Term term="ISRC" /></span>
          <input className={o.input} value={f.isrc} onChange={(e) => setF({ ...f, isrc: e.target.value })} placeholder="US-XXX-26-00001" autoCapitalize="characters" spellCheck={false} />
          <span className={o.hint}>From your distributor, or your own. Change it only if it’s wrong: stores pay by it.</span>
        </label>
        {!recording.isrc && nextIsrc && (
          <Button onClick={() => { onAssign(recording); ref.current?.close(); }}>Assign the next ISRC ({formatIsrc(nextIsrc)})</Button>
        )}
        {rights ? (
          <>
            <label className={o.field}>Length <span className={o.hint}>Minutes and seconds, like 3:45.</span><input className={o.input} value={f.length} inputMode="numeric" maxLength={8} onChange={(e) => setF({ ...f, length: e.target.value })} /></label>
            <PartyPicker label="Master owner" hint="Who owns the recording: usually the label or the artist. They're the claimant on copyright and SoundExchange forms." people={pick} value={f.owner} onChange={(v) => setF({ ...f, owner: v })} allowNone />
            <label className={o.field}>℗ year <span className={o.hint}>The year the recording was first released.</span><input className={o.input} value={f.pYear} inputMode="numeric" maxLength={4} onChange={(e) => setF({ ...f, pYear: e.target.value })} /></label>
            <fieldset className={s.fieldset}>
              <legend className={s.legend}>Credits</legend>
              <p className={o.small}>Producers, mixers and engineers listed here can be paid through a SoundExchange Letter of Direction.</p>
              <datalist id="credit-roles">{CREDIT_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
              {f.credits.map((c, i) => (
                <div key={c.key} className={s.creditRow}>
                  <PartyPicker label={`Credit ${i + 1}`} people={pick} value={c.party} onChange={(v) => setF({ ...f, credits: f.credits.map((x) => (x.key === c.key ? { ...x, party: v } : x)) })} />
                  <label className={o.field}>Role<input className={o.input} list="credit-roles" value={c.role} maxLength={60} onChange={(e) => setF({ ...f, credits: f.credits.map((x) => (x.key === c.key ? { ...x, role: e.target.value } : x)) })} /></label>
                  <Button size="sm" variant="ghost" onClick={() => setF({ ...f, credits: f.credits.filter((x) => x.key !== c.key) })}>Remove<span className="visually-hidden"> credit {i + 1}</span></Button>
                </div>
              ))}
              <Button size="sm" onClick={() => setF({ ...f, credits: [...f.credits, { key: Date.now(), party: { name: '' }, role: 'Producer' }] })}>Add a credit</Button>
            </fieldset>
          </>
        ) : <p className={o.small}>Credits and the master owner can be changed once this recording is saved to your catalog.</p>}
        {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />{error}</p>}
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
