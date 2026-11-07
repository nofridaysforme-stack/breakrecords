'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Upload, X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { StatusPill, type Status } from '@/components/ui/Status';
import { Term } from '@/components/ui/Controls';
import { LinkTabs } from '@/components/ops/LinkTabs';
import type { getCatalog } from '@/data/api';
import type { Recording } from '@/data/ops';
import o from '@/components/ops/Ops.module.css';
import s from './Catalog.module.css';

type Data = ReturnType<typeof getCatalog>;
export type CatalogTab = 'songs' | 'recordings' | 'releases' | 'assets';

const AI_USE = ['None', 'Partial, stems', 'Partial, vocals', 'Partial, artwork', 'Full'];

const scoreTone = (n: number) => (n >= 90 ? s.good : n >= 70 ? s.warn : s.critical);

/** 5a. The recordings tab has a 380px detail panel; the other tabs are plain lists from the same parts. */
export function CatalogView({ data, tab, initialId }: { data: Data; tab: CatalogTab; initialId?: string }) {
  const [list, setList] = useState(data.recordings);
  const [selectedId, setSelectedId] = useState(initialId && data.recordings.some((r) => r.id === initialId) ? initialId : data.recordings[0]?.id);
  const selected = list.find((r) => r.id === selectedId) ?? list[0];
  const upload = useRef<HTMLDialogElement>(null);
  const edit = useRef<HTMLDialogElement>(null);
  const [queued, setQueued] = useState<string[]>([]);

  const head = (
    <>
      <div className={o.head}>
        <PageTitle>Catalog</PageTitle>
        <Button variant="primary" onClick={() => upload.current?.showModal()}>Upload assets</Button>
      </div>
      <LinkTabs label="Catalog" tabs={[
        { label: 'Songs', href: '/catalog/songs', count: data.counts.songs },
        { label: 'Recordings', href: '/catalog/recordings', count: data.counts.recordings },
        { label: 'Releases', href: '/catalog/releases', count: data.counts.releases },
        { label: 'Assets', href: '/catalog/assets', count: data.counts.assets },
      ]} />
      {queued.length > 0 && (
        <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />{queued.length} {queued.length === 1 ? 'file' : 'files'} queued. Metadata Agent will check {queued.length === 1 ? 'it' : 'them'} before anything is delivered.</p>
      )}
    </>
  );

  const dialogs = (
    <>
      <UploadDialog ref={upload} onQueue={(names) => setQueued((q) => [...q, ...names])} />
      {selected && <EditDialog ref={edit} recording={selected} onSave={(r) => setList((l) => l.map((x) => (x.id === r.id ? r : x)))} />}
    </>
  );

  if (tab !== 'recordings') {
    return <div className={s.single}>{head}{tab === 'songs' ? <Songs data={data} /> : tab === 'releases' ? <Releases data={data} /> : <Assets data={data} />}{dialogs}</div>;
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

function Releases({ data }: { data: Data }) {
  return (
    <div className={o.tableWrap} role="region" aria-label="Releases" tabIndex={0}>
      <table className={o.table}>
        <thead><tr><th scope="col">Release</th><th scope="col">Artist</th><th scope="col">Type</th><th scope="col">Release date</th><th scope="col"><Term term="UPC" /></th><th scope="col">Tracks</th></tr></thead>
        <tbody>
          {data.releases.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.href ? <Link href={r.href} className={o.rowLink}><span className={o.art} style={{ width: 32, height: 32 }} aria-hidden="true" />{r.title}</Link> : <span className={o.rowLink} style={{ cursor: 'default' }}><span className={o.art} style={{ width: 32, height: 32 }} aria-hidden="true" />{r.title}</span>}</th>
              <td className={o.text2}>{r.artist}</td>
              <td className={o.text2}>{r.kind}</td>
              <td className={o.dateMono}>{r.date}</td>
              <td className={o.cellMono}>{r.upc}</td>
              <td className={o.mono}>{r.tracks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function EditDialog({ ref, recording, onSave }: { ref: React.RefObject<HTMLDialogElement | null>; recording: Recording; onSave: (r: Recording) => void }) {
  const [genre, setGenre] = useState(recording.genre ?? '');
  const [ai, setAi] = useState(recording.ai);
  const [last, setLast] = useState(recording.id);
  if (last !== recording.id) { setLast(recording.id); setGenre(recording.genre ?? ''); setAi(recording.ai); }
  return (
    <Drawer ref={ref} title={`Edit ${recording.title}`} id="edit-h">
      <form className={o.form} onSubmit={(e) => { e.preventDefault(); onSave({ ...recording, genre: genre.trim() || null, ai }); ref.current?.close(); }}>
        <label className={o.field}>Genre<input className={o.input} value={genre} onChange={(e) => setGenre(e.target.value)} /></label>
        <label className={o.field}>AI use
          <select className={o.input} value={ai} onChange={(e) => setAi(e.target.value)}>{AI_USE.map((v) => <option key={v} value={v}>{v === 'None' ? 'None declared' : v}</option>)}</select>
          <span className={o.hint}>Stores ask for this. Declare any AI in the audio, lyrics or art.</span>
        </label>
        <p className={o.small}>ISRC and credits come from your distributor and signed agreements, so Metadata Agent updates them.</p>
        <div className={o.formActions}><Button variant="primary" type="submit">Save</Button><Button onClick={() => ref.current?.close()}>Cancel</Button></div>
      </form>
    </Drawer>
  );
}
