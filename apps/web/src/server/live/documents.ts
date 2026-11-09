import 'server-only';
import { createHash } from 'node:crypto';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { prepare, toCsv, DOC_LABEL, type DocKind, type DocSubject, type Gap, type Person, type RecordingFacts, type ReleaseFacts, type ReleaseRef, type SongFacts } from '@breakrecords/core/documents';
import type { DocReview, DocumentsResponse } from '@breakrecords/contract';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { renderPdf } from '../documents/render';
import { documentStore } from '../documents/storage';
import { aiState, documentsView, type DocRow, type SubjectRef } from '../documents/view';

const BRAND = 'Indie SRVCS';

type Catalog = { songs: Map<string, SongFacts>; recordings: Map<string, RecordingFacts>; releases: Map<string, ReleaseFacts>; ids: Map<string, { subject: DocSubject; id: string }> };

/** The label's catalog as document facts, keyed by database id. */
async function catalog(tx: Tx, labelName: string): Promise<Catalog> {
  const people = new Map<string, Person>();
  for (const p of await tx<{ id: string; name: string; type: Person['type']; legal_name: string | null; pro: Person['pro']; ipi: string | null; email: string | null; address: string | null; citizenship: string | null; domicile: string | null }[]>`
    SELECT id, name, type::text AS type, legal_name, pro::text AS pro, ipi, email, address, citizenship, domicile FROM parties`) {
    people.set(p.id, { id: p.id, name: p.name, type: p.type, legalName: p.legal_name, pro: p.pro, ipi: p.ipi, email: p.email, address: p.address, citizenship: p.citizenship, domicile: p.domicile });
  }
  const ids = new Map<string, { subject: DocSubject; id: string }>();
  const songs = new Map<string, SongFacts>();
  for (const w of await tx<{ id: string; slug: string; title: string; iswc: string | null; alt_titles: string[]; completion_year: number | null; has_lyrics: boolean }[]>`
    SELECT id, slug, title, iswc, alt_titles, completion_year, has_lyrics FROM works ORDER BY created_at, slug`) {
    songs.set(w.id, { id: w.slug, title: w.title, iswc: w.iswc, altTitles: w.alt_titles, completionYear: w.completion_year, hasLyrics: w.has_lyrics, writers: [], recordings: [] });
    ids.set(`work:${w.slug}`, { subject: 'work', id: w.id });
  }
  for (const ww of await tx<{ work_id: string; party_id: string; share_bp: number; confirmed: boolean; role: SongFacts['writers'][number]['role']; publisher_id: string | null }[]>`
    SELECT work_id, party_id, share_bp, confirmed, role::text AS role, publisher_id FROM work_writers ORDER BY share_bp DESC, party_id`) {
    songs.get(ww.work_id)?.writers.push({ person: people.get(ww.party_id)!, shareBp: ww.share_bp, confirmed: ww.confirmed, role: ww.role, publisher: ww.publisher_id ? people.get(ww.publisher_id)! : null });
  }
  const recordings = new Map<string, RecordingFacts>();
  const recRows = await tx<{ id: string; slug: string; title: string; isrc: string | null; duration_s: number | null; genre: string | null; artist_id: string; owner_id: string | null; p_year: number | null; work_id: string | null }[]>`
    SELECT id, slug, title, isrc, duration_s, genre, artist_id, owner_id, p_year, work_id FROM recordings ORDER BY created_at, slug`;
  for (const r of recRows) {
    const song = r.work_id ? songs.get(r.work_id) ?? null : null;
    recordings.set(r.id, { id: r.slug, title: r.title, isrc: r.isrc, durationS: r.duration_s, genre: r.genre, artist: people.get(r.artist_id)!, owner: r.owner_id ? people.get(r.owner_id)! : null, pYear: r.p_year, credits: [], song, releases: [] });
    song?.recordings.push({ title: r.title, isrc: r.isrc, artist: people.get(r.artist_id)!.name, durationS: r.duration_s });
    ids.set(`recording:${r.slug}`, { subject: 'recording', id: r.id });
  }
  for (const c of await tx<{ recording_id: string; party_id: string; role: string }[]>`SELECT recording_id, party_id, role FROM recording_credits ORDER BY position`) {
    recordings.get(c.recording_id)?.credits.push({ name: people.get(c.party_id)!.name, role: c.role });
  }
  const releases = new Map<string, ReleaseFacts>();
  for (const r of await tx<{ id: string; slug: string; title: string; kind: ReleaseRef['kind']; upc: string | null; release_date: Date | null; artist_id: string }[]>`
    SELECT id, slug, title, kind::text AS kind, upc, release_date, artist_id FROM releases ORDER BY release_date DESC NULLS FIRST, slug`) {
    releases.set(r.id, { id: r.slug, title: r.title, kind: r.kind, upc: r.upc, releaseDate: r.release_date ? r.release_date.toISOString().slice(0, 10) : null, artist: people.get(r.artist_id)!, labelName, tracks: [] });
    ids.set(`release:${r.slug}`, { subject: 'release', id: r.id });
  }
  for (const t of await tx<{ release_id: string; recording_id: string; position: number }[]>`SELECT release_id, recording_id, position FROM release_tracks ORDER BY release_id, position`) {
    const rel = releases.get(t.release_id); const rec = recordings.get(t.recording_id);
    if (!rel || !rec) continue;
    rel.tracks.push({ position: t.position, recording: rec });
    rec.releases.push({ title: rel.title, kind: rel.kind, upc: rel.upc, releaseDate: rel.releaseDate });
  }
  return { songs, recordings, releases, ids };
}

function subjects(c: Catalog): SubjectRef[] {
  const kind = (k: ReleaseRef['kind']) => (k === 'ep' ? 'EP' : k[0].toUpperCase() + k.slice(1));
  return [
    ...[...c.songs.values()].map((s) => ({ subject: 'work' as const, id: s.id, title: s.title, artist: s.recordings[0]?.artist ?? s.writers[0]?.person.name ?? 'No artist', detail: `Song · ${s.writers.length} writer${s.writers.length === 1 ? '' : 's'}` })),
    ...[...c.recordings.values()].map((r) => ({ subject: 'recording' as const, id: r.id, title: r.title, artist: r.artist.name, detail: `Recording · ${r.isrc ?? 'no ISRC'}` })),
    ...[...c.releases.values()].map((r) => ({ subject: 'release' as const, id: r.id, title: r.title, artist: r.artist.name, detail: `${kind(r.kind)} · ${r.releaseDate ?? 'no date'}` })),
  ];
}

async function docRows(tx: Tx): Promise<DocRow[]> {
  const rows = await tx<{ id: string; kind: DocKind; subject: DocSubject; slug: string; version: number; created_at: Date; by: string; gaps: Gap[]; csv_key: string | null; review: (DocReview & { at: Date }) | null }[]>`
    SELECT d.id, d.kind::text AS kind, d.subject::text AS subject,
           coalesce(w.slug, r.slug, rl.slug) AS slug, d.version, d.created_at, coalesce(u.name, split_part(u.email, '@', 1)) AS by, d.gaps, d.csv_key,
           (SELECT jsonb_build_object('id', v.id, 'model', v.model, 'at', v.created_at, 'findings', v.findings, 'nextSteps', v.next_steps)
              FROM document_reviews v WHERE v.document_id = d.id ORDER BY v.created_at DESC LIMIT 1) AS review
    FROM documents d LEFT JOIN users u ON u.id = d.created_by
      LEFT JOIN works w ON d.subject = 'work' AND w.id = d.subject_id
      LEFT JOIN recordings r ON d.subject = 'recording' AND r.id = d.subject_id
      LEFT JOIN releases rl ON d.subject = 'release' AND rl.id = d.subject_id`;
  return rows.map((d) => ({
    id: d.id, kind: d.kind, subjectId: d.slug, version: d.version, preparedAt: d.created_at, preparedBy: d.by ?? 'Someone', gaps: d.gaps, hasCsv: !!d.csv_key,
    review: d.review ? { ...d.review, at: new Date(d.review.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) } : null,
  }));
}

async function viewIn(tx: Tx, ctx: RequestContext): Promise<DocumentsResponse> {
  const [cfg] = await tx<{ ai_assist: boolean }[]>`SELECT ai_assist FROM label_settings`;
  return documentsView(subjects(await catalog(tx, ctx.tenantName)), await docRows(tx), aiState(cfg?.ai_assist ?? false, ctx.role === 'owner'));
}

/** Rights → Documents for the signed-in label. */
export function liveDocuments(ctx: RequestContext): Promise<DocumentsResponse> {
  return withTenant(sql, ctx, (tx) => viewIn(tx, ctx));
}

export type DocWrite = { ok: true; value: DocumentsResponse; id: string } | { ok: false; status: number; error: 'not_found' | 'invalid' | 'storage'; message: string };

const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Prepares the next version of a document from the catalog as it is now: renders it, stores the
 * files, records the version with its gaps, and audits it. Earlier versions stay as they were.
 */
export function livePrepareDocument(ctx: RequestContext, c: { kind: DocKind; subject: DocSubject; id: string }): Promise<DocWrite> {
  return withTenant(sql, ctx, async (tx) => {
    const cat = await catalog(tx, ctx.tenantName);
    const ref = cat.ids.get(`${c.subject}:${c.id}`);
    if (!ref) return { ok: false, status: 404, error: 'not_found', message: 'No such song, recording or release.' } as const;
    const facts = c.subject === 'work' ? { subject: 'work' as const, song: cat.songs.get(ref.id)! }
      : c.subject === 'recording' ? { subject: 'recording' as const, recording: cat.recordings.get(ref.id)! }
      : { subject: 'release' as const, release: cat.releases.get(ref.id)! };
    const doc = prepare(c.kind, facts, today());
    if (!doc) return { ok: false, status: 400, error: 'invalid', message: `A ${DOC_LABEL[c.kind].toLowerCase()} isn’t made for that.` } as const;
    const [{ next }] = await tx<{ next: number }[]>`SELECT coalesce(max(version), 0) + 1 AS next FROM documents WHERE kind = ${c.kind} AND subject_id = ${ref.id}`;
    const pdf = await renderPdf(doc, { brand: BRAND, version: next });
    const base = `${ctx.tenantId}/${c.kind}/${ref.id}/v${next}`;
    let store;
    try { store = documentStore(true); } catch (e) { return { ok: false, status: 503, error: 'storage', message: (e as Error).message } as const; }
    await store.put(`${base}.pdf`, pdf, 'application/pdf');
    if (doc.csv) await store.put(`${base}.csv`, new TextEncoder().encode(toCsv(doc.csv.rows)), 'text/csv');
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO documents (tenant_id, kind, subject, subject_id, version, title, pdf_key, csv_key, sha256, gaps, created_by)
      VALUES (${ctx.tenantId}, ${c.kind}, ${c.subject}, ${ref.id}, ${next}, ${doc.title}, ${`${base}.pdf`}, ${doc.csv ? `${base}.csv` : null},
              ${createHash('sha256').update(pdf).digest('hex')}, ${tx.json(doc.gaps)}, ${ctx.userId}) RETURNING id`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-DOC-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'document.prepared', ${row.id},
              ${tx.json({ title: doc.title, version: next, gaps: doc.gaps.length })})`;
    return { ok: true, value: await viewIn(tx, ctx), id: row.id } as const;
  });
}

/** A stored file, only if the document belongs to the signed-in label. */
export function liveDocumentFile(ctx: RequestContext, id: string, format: 'pdf' | 'csv'): Promise<{ name: string; body: Uint8Array } | null> {
  return withTenant(sql, ctx, async (tx) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const [d] = await tx<{ title: string; version: number; pdf_key: string; csv_key: string | null }[]>`SELECT title, version, pdf_key, csv_key FROM documents WHERE id = ${id}`;
    const key = d && (format === 'pdf' ? d.pdf_key : d.csv_key);
    if (!d || !key) return null;
    const body = await documentStore(true).get(key);
    return body ? { name: `${d.title.replace(/[^\w\- ]+/g, '').trim()} v${d.version}.${format}`, body } : null;
  });
}

/** The facts a document was built from, for AI review: the document as prepared now. */
export function liveDocumentForReview(ctx: RequestContext, id: string) {
  return withTenant(sql, ctx, async (tx) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const [d] = await tx<{ kind: DocKind; subject: DocSubject; subject_id: string; title: string; gaps: Gap[] }[]>`
      SELECT kind::text AS kind, subject::text AS subject, subject_id, title, gaps FROM documents WHERE id = ${id}`;
    if (!d) return null;
    const cat = await catalog(tx, ctx.tenantName);
    const facts = d.subject === 'work' ? { subject: 'work' as const, song: cat.songs.get(d.subject_id)! }
      : d.subject === 'recording' ? { subject: 'recording' as const, recording: cat.recordings.get(d.subject_id)! }
      : { subject: 'release' as const, release: cat.releases.get(d.subject_id)! };
    return prepare(d.kind, facts, today());
  });
}

/** Saves an AI review of a document (suggestions only) and returns the updated view. */
export function liveSaveReview(ctx: RequestContext, id: string, r: { model: string; findings: DocReview['findings']; nextSteps: string }): Promise<DocumentsResponse> {
  return withTenant(sql, ctx, async (tx) => {
    await tx`INSERT INTO document_reviews (tenant_id, document_id, model, findings, next_steps, created_by)
      VALUES (${ctx.tenantId}, ${id}, ${r.model}, ${tx.json(r.findings)}, ${r.nextSteps}, ${ctx.userId})`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-DOC-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'document.reviewed', ${id}, ${tx.json({ model: r.model, findings: r.findings.length })})`;
    return viewIn(tx, ctx);
  });
}

/** Whether this label has AI review turned on. */
export function liveAiOn(ctx: RequestContext): Promise<boolean> {
  return withTenant(sql, ctx, async (tx) => ((await tx<{ ai_assist: boolean }[]>`SELECT ai_assist FROM label_settings`)[0]?.ai_assist ?? false));
}

/** Owners turn AI review on or off for their label (the database refuses anyone else). */
export function liveSetAiAssist(ctx: RequestContext, on: boolean): Promise<{ ok: true; value: DocumentsResponse } | { ok: false; status: number; error: 'forbidden'; message: string }> {
  if (ctx.role !== 'owner') return Promise.resolve({ ok: false, status: 403, error: 'forbidden', message: 'Only the label’s owners turn AI review on or off.' });
  return withTenant(sql, ctx, async (tx) => {
    await tx`SELECT app_set_ai_assist(${on})`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SET-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'ai_assist.changed', 'label', ${tx.json({ on })})`;
    return { ok: true, value: await viewIn(tx, ctx) } as const;
  });
}
