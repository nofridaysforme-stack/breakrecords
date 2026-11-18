import 'server-only';
import type { z } from 'zod';
import type { PartyRef, PeopleResponse, PersonResponse, UpdatePersonCommand } from '@breakrecords/contract';
import type { Person } from '@breakrecords/core/documents';
import { personMissing } from '@breakrecords/core/people';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';
import { freeSlug } from './catalog';

// People and companies in the workspace: the facts the rights forms need about each one.

type PartyRow = { id: string; slug: string; name: string; type: Person['type']; legal_name: string | null; pro: Person['pro']; ipi: string | null; isni: string | null;
  email: string | null; phone: string | null; address: string | null; citizenship: string | null; domicile: string | null };

const toPerson = (p: PartyRow): Person => ({ id: p.slug, name: p.name, type: p.type, legalName: p.legal_name, pro: p.pro, ipi: p.ipi, email: p.email, phone: p.phone,
  address: p.address, citizenship: p.citizenship, domicile: p.domicile });

const partyRows = (tx: Tx, slug?: string) => tx<PartyRow[]>`
  SELECT id, slug, name, type::text AS type, legal_name, pro::text AS pro, ipi, isni, email, phone, address, citizenship, domicile
  FROM parties WHERE ${slug ?? null}::text IS NULL OR slug = ${slug ?? null} ORDER BY name`;

type Use = { kind: 'artist' | 'credit' | 'owner' | 'writer' | 'publisher'; title: string; slug: string; role: string | null };
async function usesOf(tx: Tx, partyId?: string): Promise<(Use & { party_id: string })[]> {
  return tx<(Use & { party_id: string })[]>`
    SELECT * FROM (
      SELECT r.artist_id AS party_id, 'artist' AS kind, r.title, r.slug, NULL AS role FROM recordings r
      UNION ALL SELECT c.party_id, 'credit', r.title, r.slug, c.role FROM recording_credits c JOIN recordings r ON r.id = c.recording_id
      UNION ALL SELECT r.owner_id, 'owner', r.title, r.slug, NULL FROM recordings r WHERE r.owner_id IS NOT NULL
      UNION ALL SELECT ww.party_id, 'writer', w.title, w.slug, NULL FROM work_writers ww JOIN works w ON w.id = ww.work_id
      UNION ALL SELECT ww.publisher_id, 'publisher', w.title, w.slug, NULL FROM work_writers ww JOIN works w ON w.id = ww.work_id WHERE ww.publisher_id IS NOT NULL
    ) u WHERE ${partyId ?? null}::uuid IS NULL OR u.party_id = ${partyId ?? null}::uuid`;
}

const ROLE: Record<Use['kind'], string> = { artist: 'Artist', credit: 'Credited', owner: 'Master owner', writer: 'Writer', publisher: 'Publisher' };
function rolesText(uses: Use[]): string {
  const words = new Set(uses.map((u) => (u.kind === 'credit' && u.role ? u.role : ROLE[u.kind])));
  return words.size ? [...words].slice(0, 4).join(', ') : 'Not on anything yet';
}
const useLine = (u: Use) => {
  const href = u.kind === 'writer' || u.kind === 'publisher' ? `/catalog/songs?edit=${u.slug}` : `/catalog/recordings?id=${u.slug}`;
  const what = u.kind === 'artist' ? `Artist on ${u.title}` : u.kind === 'credit' ? `${u.role ?? 'Credited'} on ${u.title}` : u.kind === 'owner' ? `Owns the master of ${u.title}`
    : u.kind === 'writer' ? `Wrote ${u.title}` : `Publishes ${u.title}`;
  return { text: what, href };
};

export function livePeople(ctx: RequestContext): Promise<z.infer<typeof PeopleResponse>> {
  return withTenant(sql, ctx, async (tx) => {
    const people = await partyRows(tx);
    const uses = await usesOf(tx);
    return { people: people.map((p) => ({ id: p.slug, name: p.name, type: p.type, missing: personMissing(toPerson(p)), roles: rolesText(uses.filter((u) => u.party_id === p.id)) })) };
  });
}

async function personIn(tx: Tx, slug: string): Promise<z.infer<typeof PersonResponse> | null> {
  const [p] = await partyRows(tx, slug);
  if (!p) return null;
  const uses = await usesOf(tx, p.id);
  return {
    id: p.slug, name: p.name, type: p.type, legalName: p.legal_name, pro: p.pro, ipi: p.ipi, isni: p.isni, email: p.email, phone: p.phone, address: p.address,
    citizenship: p.citizenship, domicile: p.domicile, missing: personMissing(toPerson(p)), uses: uses.map(useLine),
  };
}

export function livePerson(ctx: RequestContext, slug: string) {
  return withTenant(sql, ctx, (tx) => personIn(tx, slug));
}

/** Changes what's on file for someone. Only the fields sent change; an empty one is cleared. */
export function liveUpdatePerson(ctx: RequestContext, slug: string, c: z.infer<typeof UpdatePersonCommand>) {
  return withTenant(sql, ctx, async (tx) => {
    const set = (k: keyof typeof c) => c[k] !== undefined;
    const res = await tx`UPDATE parties SET
        name = CASE WHEN ${set('name')} THEN ${c.name ?? null} ELSE name END,
        type = CASE WHEN ${set('type')} THEN ${c.type ?? null}::party_type ELSE type END,
        legal_name = CASE WHEN ${set('legalName')} THEN ${c.legalName ?? null} ELSE legal_name END,
        pro = CASE WHEN ${set('pro')} THEN ${c.pro ?? null}::pro_org ELSE pro END,
        ipi = CASE WHEN ${set('ipi')} THEN ${c.ipi ?? null} ELSE ipi END,
        isni = CASE WHEN ${set('isni')} THEN ${c.isni?.replace(/\s/g, '') ?? null} ELSE isni END,
        email = CASE WHEN ${set('email')} THEN ${c.email?.toLowerCase() ?? null} ELSE email END,
        phone = CASE WHEN ${set('phone')} THEN ${c.phone ?? null} ELSE phone END,
        address = CASE WHEN ${set('address')} THEN ${c.address ?? null} ELSE address END,
        citizenship = CASE WHEN ${set('citizenship')} THEN ${c.citizenship ?? null} ELSE citizenship END,
        domicile = CASE WHEN ${set('domicile')} THEN ${c.domicile ?? null} ELSE domicile END
      WHERE slug = ${slug}`;
    if (!res.count) return null;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-PPL-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'person.updated', ${slug}, ${tx.json({ fields: Object.keys(c) })})`;
    return personIn(tx, slug);
  });
}

/** The id of someone already in the workspace, or of a new person or company added by name. Null if the id isn't in this workspace. */
export async function resolveParty(tx: Tx, ctx: RequestContext, ref: z.infer<typeof PartyRef>): Promise<string | null> {
  if ('partyId' in ref) return (await tx<{ id: string }[]>`SELECT id FROM parties WHERE slug = ${ref.partyId}`)[0]?.id ?? null;
  const [same] = await tx<{ id: string }[]>`SELECT id FROM parties WHERE lower(name) = lower(${ref.name}) ORDER BY created_at LIMIT 1`;
  if (same) return same.id;
  const [made] = await tx<{ id: string }[]>`INSERT INTO parties (tenant_id, slug, name, type)
    VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'parties', ref.name)}, ${ref.name}, ${ref.company ? 'company' : 'person'}) RETURNING id`;
  return made.id;
}
