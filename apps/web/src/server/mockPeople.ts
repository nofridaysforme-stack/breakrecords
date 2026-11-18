import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';
import type { PartyRef, PeopleResponse, PersonResponse, UpdatePersonCommand, UpdateRecordingCommand, UpdateSongCommand } from '@breakrecords/contract';
import type { Person, WriterRole } from '@breakrecords/core/documents';
import { personMissing } from '@breakrecords/core/people';
import { mockSession } from './session';

// Sample-data mode: rights details entered this browser session (people's legal facts, recording
// credits and owners, writer roles and publishers). The sample documents are built on top of them.

export type PersonEdit = Partial<Omit<Person, 'id'>> & { isni?: string | null };
export type Overlay = {
  people: Record<string, PersonEdit>;
  added: { id: string; name: string; type: Person['type'] }[];
  recordings: Record<string, { credits?: { partyId: string; role: string }[]; owner?: string | null; pYear?: number | null; durationS?: number | null }>;
  songs: Record<string, { writers?: Record<string, { role: WriterRole | null; publisher: string | null }>; altTitles?: string[]; completionYear?: number | null }>;
};
const empty = (): Overlay => ({ people: {}, added: [], recordings: {}, songs: {} });
const g = globalThis as unknown as { __brPeople?: Map<string, Overlay> };
const store = (g.__brPeople ??= new Map());

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'someone';

/** This session's details, without starting a session (safe in server components). */
export async function mockOverlay(): Promise<Overlay> {
  const id = (await cookies()).get('br_mock_session')?.value;
  return (id && store.get(id)) || empty();
}
async function edit<T>(change: (o: Overlay) => T): Promise<T> {
  const id = await mockSession();
  const o = store.get(id) ?? empty();
  const out = change(o);
  store.set(id, o);
  return out;
}

type Facts = Awaited<ReturnType<typeof import('./mockDocuments').mockFacts>>;
const facts = async (): Promise<Facts> => (await import('./mockDocuments')).mockFacts();

type Use = { text: string; href: string; role: string };
function usesIn(f: Facts, id: string): Use[] {
  const out: Use[] = [];
  for (const r of f.recordings) {
    if (r.artist.id === id) out.push({ text: `Artist on ${r.title}`, href: `/catalog/recordings?id=${r.id}`, role: 'Artist' });
    for (const c of r.credits) if (c.person?.id === id && c.name !== r.artist.name) out.push({ text: `${c.role} on ${r.title}`, href: `/catalog/recordings?id=${r.id}`, role: c.role });
    if (r.owner?.id === id) out.push({ text: `Owns the master of ${r.title}`, href: `/catalog/recordings?id=${r.id}`, role: 'Master owner' });
  }
  for (const s of f.songs) for (const w of s.writers) {
    if (w.person.id === id) out.push({ text: `Wrote ${s.title}`, href: `/catalog/songs?edit=${s.id}`, role: 'Writer' });
    if (w.publisher?.id === id) out.push({ text: `Publishes ${s.title}`, href: `/catalog/songs?edit=${s.id}`, role: 'Publisher' });
  }
  return out;
}

export async function mockPeople(): Promise<z.infer<typeof PeopleResponse>> {
  const f = await facts();
  return { people: [...f.people.values()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
    const roles = [...new Set(usesIn(f, p.id).map((u) => u.role))];
    return { id: p.id, name: p.name, type: p.type, missing: personMissing(p), roles: roles.length ? roles.slice(0, 4).join(', ') : 'Not on anything yet' };
  }) };
}

export async function mockPerson(id: string): Promise<z.infer<typeof PersonResponse> | null> {
  const f = await facts();
  const p = f.people.get(id);
  if (!p) return null;
  const o = await mockOverlay();
  return { id: p.id, name: p.name, type: p.type, legalName: p.legalName, pro: p.pro, ipi: p.ipi, isni: o.people[id]?.isni ?? null, email: p.email, phone: p.phone ?? null,
    address: p.address, citizenship: p.citizenship, domicile: p.domicile, missing: personMissing(p), uses: usesIn(f, id).map(({ text, href }) => ({ text, href })) };
}

export async function mockUpdatePerson(id: string, c: z.infer<typeof UpdatePersonCommand>) {
  if (!(await facts()).people.has(id)) return null;
  await edit((o) => {
    const next: PersonEdit = { ...o.people[id] };
    for (const [k, v] of Object.entries(c)) if (v !== undefined) (next as Record<string, unknown>)[k] = k === 'email' && typeof v === 'string' ? v.toLowerCase() : v;
    o.people[id] = next;
  });
  return mockPerson(id);
}

/** Someone in the sample (or added this session) by id, or a new person or company by name. */
async function resolve(ref: z.infer<typeof PartyRef>): Promise<string | null> {
  const f = await facts();
  if ('partyId' in ref) return f.people.has(ref.partyId) ? ref.partyId : null;
  const same = [...f.people.values()].find((p) => p.name.toLowerCase() === ref.name.toLowerCase());
  if (same) return same.id;
  return edit((o) => {
    const taken = new Set([...f.people.keys(), ...o.added.map((a) => a.id)]);
    let id = slugify(ref.name);
    for (let i = 2; taken.has(id); i++) id = `${slugify(ref.name)}-${i}`;
    o.added.push({ id, name: ref.name, type: ref.company ? 'company' : 'person' });
    return id;
  });
}

export type MockWrite = { ok: true } | { ok: false; status: number; error: string; message: string };

export async function mockUpdateRecordingRights(id: string, c: UpdateRecordingCommand): Promise<MockWrite> {
  if (c.credits === undefined && c.owner === undefined && c.pYear === undefined && c.durationS === undefined) return { ok: true };
  let owner: string | null | undefined;
  if (c.owner !== undefined) {
    owner = c.owner ? await resolve(c.owner) : null;
    if (c.owner && !owner) return { ok: false, status: 404, error: 'not_found', message: 'That owner isn’t in this workspace.' };
  }
  let credits: { partyId: string; role: string }[] | undefined;
  if (c.credits) {
    credits = [];
    for (const x of c.credits) {
      const p = await resolve(x.party);
      if (!p) return { ok: false, status: 404, error: 'not_found', message: 'Someone in the credits isn’t in this workspace.' };
      if (credits.some((y) => y.partyId === p)) return { ok: false, status: 400, error: 'invalid', message: 'Each person is credited once; put both roles on one line, like "Producer, mix engineer".' };
      credits.push({ partyId: p, role: x.role });
    }
  }
  await edit((o) => {
    const r = { ...o.recordings[id] };
    if (credits) r.credits = credits;
    if (owner !== undefined) r.owner = owner;
    if (c.pYear !== undefined) r.pYear = c.pYear;
    if (c.durationS !== undefined) r.durationS = c.durationS;
    o.recordings[id] = r;
  });
  return { ok: true };
}

export async function mockUpdateSong(id: string, c: z.infer<typeof UpdateSongCommand>): Promise<MockWrite> {
  const f = await facts();
  const song = f.songs.find((s) => s.id === id);
  if (!song) return { ok: false, status: 404, error: 'not_found', message: `No song ${id}.` };
  const writers: Record<string, { role: WriterRole | null; publisher: string | null }> = {};
  for (const w of c.writers ?? []) {
    if (!song.writers.some((x) => x.person.id === w.partyId)) return { ok: false, status: 400, error: 'invalid', message: 'Only the song’s writers can be changed here. Add writers in Splits.' };
    const pub = w.publisher ? await resolve('partyId' in w.publisher ? w.publisher : { ...w.publisher, company: true }) : null;
    if (w.publisher && !pub) return { ok: false, status: 404, error: 'not_found', message: 'That publisher isn’t in this workspace.' };
    writers[w.partyId] = { role: w.role, publisher: pub };
  }
  await edit((o) => {
    const s = { ...o.songs[id] };
    if (c.writers) s.writers = { ...s.writers, ...writers };
    if (c.altTitles !== undefined) s.altTitles = c.altTitles;
    if (c.completionYear !== undefined) s.completionYear = c.completionYear;
    o.songs[id] = s;
  });
  return { ok: true };
}
