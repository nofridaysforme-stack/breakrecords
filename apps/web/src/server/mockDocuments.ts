import 'server-only';
import { createHash } from 'node:crypto';
import { lodParticipants, prepare, toCsv, DOC_LABEL, type DocKind, type LodTerms, type DocSubject, type Person, type RecordingFacts, type ReleaseFacts, type SongFacts } from '@breakrecords/core/documents';
import type { DocReview, DocumentsResponse } from '@breakrecords/contract';
import { catalogReleases, recordings, songs } from '@/data/ops';
import { SAMPLE_LYRICS, SAMPLE_MASTER_OWNER, SAMPLE_PEOPLE, SAMPLE_P_YEAR, SAMPLE_RELEASE_TRACKS, SAMPLE_SIGNED, SAMPLE_SIGNED_BY, SAMPLE_SONGS } from '@/data/rightsDetails';
import { cookies } from 'next/headers';
import { mockSession } from './session';
import { mockOverlay, slugify, type Overlay } from './mockPeople';
import { renderPdf } from './documents/render';
import { documentStore, StorageRefused } from './documents/storage';
import { aiState, documentsView, type DocRow, type SubjectRef } from './documents/view';

// Sample-data mode: documents built from the same sample catalog the seed loads, kept per
// browser session (files in a local folder, or in memory on a hosted preview).

const LABEL = 'Northline Records';
const BRAND = 'Indie SRVCS';
const seconds = (d: string) => { const [m, s] = d.split(':').map(Number); return m * 60 + s; };

function facts(o: Overlay) {
  const people = new Map<string, Person>();
  const withEdits = (p: Person): Person => { const e = o.people[p.id]; if (!e) return p; const { isni: _i, ...rest } = e; return { ...p, ...rest }; };
  const person = (name: string): Person => {
    const id = slugify(name);
    if (!people.has(id)) {
      const p = SAMPLE_PEOPLE.find((x) => x.name === name);
      people.set(id, withEdits({ id, name, type: p?.type ?? (name === 'The Low Hours' ? 'group' : 'person'), legalName: p?.legalName ?? null, pro: p?.pro ?? null, ipi: p?.ipi ?? null, email: p?.email ?? null, phone: null, address: p?.address ?? null, citizenship: p?.citizenship ?? null, domicile: p?.domicile ?? null }));
    }
    return people.get(id)!;
  };
  for (const p of SAMPLE_PEOPLE) person(p.name);
  for (const a of o.added) if (!people.has(a.id)) people.set(a.id, withEdits({ id: a.id, name: a.name, type: a.type, legalName: null, pro: null, ipi: null, email: null, phone: null, address: null, citizenship: null, domicile: null }));
  const byId = (id: string | null | undefined) => (id ? people.get(id) ?? null : null);
  const songMap = new Map<string, SongFacts>();
  for (const s of songs) {
    const detail = SAMPLE_SONGS[s.id];
    const ed = o.songs[s.id];
    const writers = s.writers.split(',').map((x) => /^(.*) (\d+)%$/.exec(x.trim())).filter((m): m is RegExpExecArray => !!m).map((m) => {
      const d = detail?.writers[m[1]];
      const w = person(m[1]);
      const e = ed?.writers?.[w.id];
      return { person: w, shareBp: Number(m[2]) * 100, confirmed: SAMPLE_SIGNED.has(s.id) || SAMPLE_SIGNED_BY.get(s.id) === m[1],
        role: e ? e.role : d?.role ?? null, publisher: e ? byId(e.publisher) : d?.publisher ? person(d.publisher) : null };
    });
    songMap.set(s.title, { id: s.id, title: s.title, iswc: s.iswc, altTitles: ed?.altTitles ?? detail?.altTitles ?? [], completionYear: ed && ed.completionYear !== undefined ? ed.completionYear : detail?.completed ?? null, hasLyrics: SAMPLE_LYRICS.has(s.id), writers, recordings: [] });
  }
  const recMap = new Map<string, RecordingFacts>();
  for (const r of recordings) {
    const song = r.song ? songMap.get(r.song) ?? null : null;
    const ed = o.recordings[r.id];
    const credits = ed?.credits ? ed.credits.map((c) => { const p = byId(c.partyId); return { name: p?.name ?? c.partyId, role: c.role, person: p }; }) : r.credits.map((c) => ({ ...c, person: person(c.name) }));
    const durationS = ed && ed.durationS !== undefined ? ed.durationS : r.duration ? seconds(r.duration) : null;
    const rec: RecordingFacts = { id: r.id, title: r.title, isrc: r.isrc, durationS, genre: r.genre, artist: person(r.artist),
      owner: ed && ed.owner !== undefined ? byId(ed.owner) : person(SAMPLE_MASTER_OWNER), pYear: ed && ed.pYear !== undefined ? ed.pYear : SAMPLE_P_YEAR[r.id] ?? null, credits, song, releases: [] };
    recMap.set(r.id, rec);
    song?.recordings.push({ title: r.title, isrc: r.isrc, artist: r.artist, durationS: rec.durationS });
  }
  const relMap = new Map<string, ReleaseFacts>();
  for (const r of catalogReleases) {
    const plan = SAMPLE_RELEASE_TRACKS[r.id];
    const rel: ReleaseFacts = { id: r.id, title: r.title, kind: plan.kind, upc: r.upc, releaseDate: plan.date, artist: person(r.artist), labelName: LABEL, tracks: [] };
    plan.tracks.forEach((t, i) => {
      const rec = recMap.get(t);
      if (!rec) return;
      rel.tracks.push({ position: i + 1, recording: rec });
      rec.releases.push({ title: rel.title, kind: rel.kind, upc: rel.upc, releaseDate: rel.releaseDate });
    });
    relMap.set(r.id, rel);
  }
  return { songs: [...songMap.values()], recordings: [...recMap.values()], releases: [...relMap.values()], people };
}

/** The sample catalog's document facts with this session's edits. */
export async function mockFacts() { return facts(await mockOverlay()); }

function subjects(f: ReturnType<typeof facts>): SubjectRef[] {
  const kind = (k: string) => (k === 'ep' ? 'EP' : k[0].toUpperCase() + k.slice(1));
  return [
    ...f.songs.map((s) => ({ subject: 'work' as const, id: s.id, title: s.title, artist: s.recordings[0]?.artist ?? s.writers[0]?.person.name ?? 'No artist', detail: `Song · ${s.writers.length} writer${s.writers.length === 1 ? '' : 's'}` })),
    ...f.recordings.map((r) => ({ subject: 'recording' as const, id: r.id, title: r.title, artist: r.artist.name, detail: `Recording · ${r.isrc ?? 'no ISRC'}`, payees: lodParticipants(r).map((x) => x.name) })),
    ...f.releases.map((r) => ({ subject: 'release' as const, id: r.id, title: r.title, artist: r.artist.name, detail: `${kind(r.kind)} · ${r.releaseDate ?? 'no date'}` })),
  ];
}

type MockDoc = DocRow & { title: string; pdfKey: string; csvKey: string | null; subject: DocSubject };
const g = globalThis as unknown as { __brMockDocs?: Map<string, MockDoc[]>; __brMockAi?: Map<string, boolean> };
const emptyDocs: MockDoc[] = [];
const store: Map<string, MockDoc[]> = (g.__brMockDocs ??= new Map());
const aiOn: Map<string, boolean> = (g.__brMockAi ??= new Map());

/** This browser session's documents; writes start a session, reads never do (pages can't set cookies). */
const mine = async () => { const s = await mockSession(); if (!store.has(s)) store.set(s, []); return { session: s, docs: store.get(s)! }; };
const current = async () => { const s = (await cookies()).get('br_mock_session')?.value ?? ''; return { session: s, docs: store.get(s) ?? [] }; };
const view = async (): Promise<DocumentsResponse> => {
  const { session, docs } = await current();
  return documentsView(subjects(await mockFacts()), docs, aiState(aiOn.get(session) ?? false, true));
};

export const mockDocuments = () => view();

async function factsFor(subject: DocSubject, id: string) {
  const f = await mockFacts();
  if (subject === 'work') { const song = f.songs.find((s) => s.id === id); return song ? { subject, song } : null; }
  if (subject === 'recording') { const recording = f.recordings.find((r) => r.id === id); return recording ? { subject, recording } : null; }
  const release = f.releases.find((r) => r.id === id);
  return release ? { subject, release } : null;
}

const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export async function mockPrepareDocument(c: { kind: DocKind; subject: DocSubject; id: string; lod?: LodTerms }): Promise<{ ok: true; value: DocumentsResponse; id: string } | { ok: false; status: number; error: string; message: string }> {
  const f = await factsFor(c.subject, c.id);
  if (!f) return { ok: false, status: 404, error: 'not_found', message: 'No such song, recording or release.' };
  const options = c.kind === 'sx_lod' && c.lod ? { lod: c.lod } : null;
  const doc = prepare(c.kind, f as Parameters<typeof prepare>[1], today(), options ?? {});
  if (!doc) return { ok: false, status: 400, error: 'invalid', message: `A ${DOC_LABEL[c.kind].toLowerCase()} isn’t made for that.` };
  const { session, docs } = await mine();
  const version = docs.filter((d) => d.kind === c.kind && d.subjectId === c.id).length + 1;
  const pdf = await renderPdf(doc, { brand: BRAND, version });
  const base = `mock/${createHash('sha256').update(session).digest('hex').slice(0, 16)}/${c.kind}/${c.id}/v${version}`;
  try {
    const files = documentStore(false);
    await files.put(`${base}.pdf`, pdf, 'application/pdf');
    if (doc.csv) await files.put(`${base}.csv`, new TextEncoder().encode(toCsv(doc.csv.rows)), 'text/csv');
  } catch (e) {
    if (e instanceof StorageRefused) return { ok: false, status: 503, error: 'storage', message: e.message };
    throw e;
  }
  const id = crypto.randomUUID();
  docs.push({ id, kind: c.kind, subject: c.subject, subjectId: c.id, version, preparedAt: new Date(), preparedBy: 'You', gaps: doc.gaps, hasCsv: !!doc.csv, review: null, options, title: doc.title, pdfKey: `${base}.pdf`, csvKey: doc.csv ? `${base}.csv` : null });
  return { ok: true, value: await view(), id };
}

export async function mockDocumentFile(id: string, format: 'pdf' | 'csv'): Promise<{ name: string; body: Uint8Array } | null> {
  const d = (await current()).docs.find((x) => x.id === id);
  const key = d && (format === 'pdf' ? d.pdfKey : d.csvKey);
  if (!d || !key) return null;
  const body = await documentStore(false).get(key);
  return body ? { name: `${d.title.replace(/[^\w\- ]+/g, '').trim()} v${d.version}.${format}`, body } : null;
}

export async function mockDocumentForReview(id: string) {
  const d = (await current()).docs.find((x) => x.id === id);
  if (!d) return null;
  const f = await factsFor(d.subject, d.subjectId);
  return f ? prepare(d.kind, f as Parameters<typeof prepare>[1], today(), d.options ?? {}) : null;
}

export async function mockSaveReview(id: string, r: { model: string; findings: DocReview['findings']; nextSteps: string }): Promise<DocumentsResponse> {
  const d = (await mine()).docs.find((x) => x.id === id);
  if (d) d.review = { id: crypto.randomUUID(), model: r.model, at: today(), findings: r.findings, nextSteps: r.nextSteps };
  return view();
}

export async function mockAiOn(): Promise<boolean> { return aiOn.get((await current()).session) ?? false; }
export async function mockSetAiAssist(on: boolean): Promise<DocumentsResponse> { aiOn.set(await mockSession(), on); return view(); }
