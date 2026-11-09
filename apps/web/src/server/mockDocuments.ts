import 'server-only';
import { createHash } from 'node:crypto';
import { prepare, toCsv, DOC_LABEL, type DocKind, type DocSubject, type Person, type RecordingFacts, type ReleaseFacts, type SongFacts } from '@breakrecords/core/documents';
import type { DocReview, DocumentsResponse } from '@breakrecords/contract';
import { catalogReleases, recordings, songs } from '@/data/ops';
import { SAMPLE_LYRICS, SAMPLE_MASTER_OWNER, SAMPLE_PEOPLE, SAMPLE_P_YEAR, SAMPLE_RELEASE_TRACKS, SAMPLE_SIGNED, SAMPLE_SIGNED_BY, SAMPLE_SONGS } from '@/data/rightsDetails';
import { cookies } from 'next/headers';
import { mockSession } from './session';
import { renderPdf } from './documents/render';
import { documentStore } from './documents/storage';
import { aiState, documentsView, type DocRow, type SubjectRef } from './documents/view';

// Sample-data mode: documents built from the same sample catalog the seed loads, kept per
// browser session (files in a local folder, or in memory on a hosted preview).

const LABEL = 'Northline Records';
const BRAND = 'Indie SRVCS';
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seconds = (d: string) => { const [m, s] = d.split(':').map(Number); return m * 60 + s; };

function facts() {
  const people = new Map<string, Person>();
  const person = (name: string): Person => {
    if (!people.has(name)) {
      const p = SAMPLE_PEOPLE.find((x) => x.name === name);
      people.set(name, { id: slugify(name), name, type: p?.type ?? (name === 'The Low Hours' ? 'group' : 'person'), legalName: p?.legalName ?? null, pro: p?.pro ?? null, ipi: p?.ipi ?? null, email: p?.email ?? null, address: p?.address ?? null, citizenship: p?.citizenship ?? null, domicile: p?.domicile ?? null });
    }
    return people.get(name)!;
  };
  const songMap = new Map<string, SongFacts>();
  for (const s of songs) {
    const detail = SAMPLE_SONGS[s.id];
    const writers = s.writers.split(',').map((x) => /^(.*) (\d+)%$/.exec(x.trim())).filter((m): m is RegExpExecArray => !!m).map((m) => {
      const d = detail?.writers[m[1]];
      return { person: person(m[1]), shareBp: Number(m[2]) * 100, confirmed: SAMPLE_SIGNED.has(s.id) || SAMPLE_SIGNED_BY.get(s.id) === m[1], role: d?.role ?? null, publisher: d?.publisher ? person(d.publisher) : null };
    });
    songMap.set(s.title, { id: s.id, title: s.title, iswc: s.iswc, altTitles: detail?.altTitles ?? [], completionYear: detail?.completed ?? null, hasLyrics: SAMPLE_LYRICS.has(s.id), writers, recordings: [] });
  }
  const recMap = new Map<string, RecordingFacts>();
  for (const r of recordings) {
    const song = r.song ? songMap.get(r.song) ?? null : null;
    const rec: RecordingFacts = { id: r.id, title: r.title, isrc: r.isrc, durationS: r.duration ? seconds(r.duration) : null, genre: r.genre, artist: person(r.artist), owner: person(SAMPLE_MASTER_OWNER), pYear: SAMPLE_P_YEAR[r.id] ?? null, credits: r.credits, song, releases: [] };
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
  return { songs: [...songMap.values()], recordings: [...recMap.values()], releases: [...relMap.values()] };
}

function subjects(f: ReturnType<typeof facts>): SubjectRef[] {
  const kind = (k: string) => (k === 'ep' ? 'EP' : k[0].toUpperCase() + k.slice(1));
  return [
    ...f.songs.map((s) => ({ subject: 'work' as const, id: s.id, title: s.title, artist: s.recordings[0]?.artist ?? s.writers[0]?.person.name ?? 'No artist', detail: `Song · ${s.writers.length} writer${s.writers.length === 1 ? '' : 's'}` })),
    ...f.recordings.map((r) => ({ subject: 'recording' as const, id: r.id, title: r.title, artist: r.artist.name, detail: `Recording · ${r.isrc ?? 'no ISRC'}` })),
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
  return documentsView(subjects(facts()), docs, aiState(aiOn.get(session) ?? false, true));
};

export const mockDocuments = () => view();

function factsFor(subject: DocSubject, id: string) {
  const f = facts();
  if (subject === 'work') { const song = f.songs.find((s) => s.id === id); return song ? { subject, song } : null; }
  if (subject === 'recording') { const recording = f.recordings.find((r) => r.id === id); return recording ? { subject, recording } : null; }
  const release = f.releases.find((r) => r.id === id);
  return release ? { subject, release } : null;
}

const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export async function mockPrepareDocument(c: { kind: DocKind; subject: DocSubject; id: string }): Promise<{ ok: true; value: DocumentsResponse; id: string } | { ok: false; status: number; error: string; message: string }> {
  const f = factsFor(c.subject, c.id);
  if (!f) return { ok: false, status: 404, error: 'not_found', message: 'No such song, recording or release.' };
  const doc = prepare(c.kind, f as Parameters<typeof prepare>[1], today());
  if (!doc) return { ok: false, status: 400, error: 'invalid', message: `A ${DOC_LABEL[c.kind].toLowerCase()} isn’t made for that.` };
  const { session, docs } = await mine();
  const version = docs.filter((d) => d.kind === c.kind && d.subjectId === c.id).length + 1;
  const pdf = await renderPdf(doc, { brand: BRAND, version });
  const base = `mock/${createHash('sha256').update(session).digest('hex').slice(0, 16)}/${c.kind}/${c.id}/v${version}`;
  const files = documentStore(false);
  await files.put(`${base}.pdf`, pdf, 'application/pdf');
  if (doc.csv) await files.put(`${base}.csv`, new TextEncoder().encode(toCsv(doc.csv.rows)), 'text/csv');
  const id = crypto.randomUUID();
  docs.push({ id, kind: c.kind, subject: c.subject, subjectId: c.id, version, preparedAt: new Date(), preparedBy: 'You', gaps: doc.gaps, hasCsv: !!doc.csv, review: null, title: doc.title, pdfKey: `${base}.pdf`, csvKey: doc.csv ? `${base}.csv` : null });
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
  const f = factsFor(d.subject, d.subjectId);
  return f ? prepare(d.kind, f as Parameters<typeof prepare>[1], today()) : null;
}

export async function mockSaveReview(id: string, r: { model: string; findings: DocReview['findings']; nextSteps: string }): Promise<DocumentsResponse> {
  const d = (await mine()).docs.find((x) => x.id === id);
  if (d) d.review = { id: crypto.randomUUID(), model: r.model, at: today(), findings: r.findings, nextSteps: r.nextSteps };
  return view();
}

export async function mockAiOn(): Promise<boolean> { return aiOn.get((await current()).session) ?? false; }
export async function mockSetAiAssist(on: boolean): Promise<DocumentsResponse> { aiOn.set(await mockSession(), on); return view(); }
