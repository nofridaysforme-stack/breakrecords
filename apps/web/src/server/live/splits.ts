import 'server-only';
import type { FirstSplitResponse, SplitNodeResponse, SplitTreeNode } from '@breakrecords/contract';
import { freeSlug } from './catalog';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { editDraft, producerMarketNote, PRODUCER_RANGE, send, sign, SPLIT_ROLES, validTerms, type SplitOutcome, type SplitRole, type VersionState } from '@breakrecords/core/splitVersions';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';

type NodeRow = { id: string; slug: string; label: string; parent_id: string | null; deal_notes: [string, string][] };
type VersionRow = { id: string; version: number; status: 'draft' | 'sent' | 'in_effect' | 'superseded'; terms: DealTerms; effective_from: Date; created_at: Date };
type PartyRow = { version_id: string; role: SplitRole; name: string; signed_at: Date | null };

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The tree, with `override` on nodes that have a split of their own. */
export function liveSplitTree(ctx: RequestContext): Promise<SplitTreeNode[]> {
  return withTenant(sql, ctx, async (tx) => {
    const rows = await tx<(NodeRow & { has_split: boolean })[]>`
      SELECT n.id, n.slug, n.label, n.parent_id, n.deal_notes, EXISTS (SELECT 1 FROM split_versions v WHERE v.node_id = n.id) AS has_split
      FROM split_nodes n ORDER BY n.position, n.created_at`;
    const build = (parent: string | null): SplitTreeNode[] => rows.filter((r) => r.parent_id === parent).map((r) => {
      const children = build(r.id);
      return { id: r.slug, label: r.label, ...(r.has_split ? { override: true } : {}), ...(children.length ? { children } : {}) };
    });
    return build(null);
  });
}

async function load(tx: Tx, slug: string) {
  const [node] = await tx<NodeRow[]>`SELECT id, slug, label, parent_id, deal_notes FROM split_nodes WHERE slug = ${slug}`;
  if (!node) return null;
  const versions = await tx<VersionRow[]>`SELECT id, version, status::text, terms, effective_from, created_at FROM split_versions WHERE node_id = ${node.id} ORDER BY version DESC`;
  const parties = versions.length ? await tx<PartyRow[]>`
    SELECT sp.version_id, sp.role::text AS role, p.name, sp.signed_at FROM split_parties sp JOIN parties p ON p.id = sp.party_id
    WHERE sp.version_id = ANY(${versions.map((v) => v.id)}::uuid[])` : [];
  return { node, versions, parties };
}

const stateOf = (v: VersionRow, parties: PartyRow[]): VersionState => ({
  status: v.status, terms: v.terms, roles: parties.filter((p) => p.version_id === v.id).map((p) => p.role),
  signed: Object.fromEntries(parties.filter((p) => p.version_id === v.id && p.signed_at).map((p) => [p.role, p.signed_at!.toISOString().slice(0, 10)])),
});

/** One node's split in the contract's shape, or null when it inherits its parent's. */
export function liveSplitNode(ctx: RequestContext, slug: string): Promise<SplitNodeResponse | null> {
  return withTenant(sql, ctx, async (tx) => {
    const got = await load(tx, slug);
    if (!got || !got.versions.length) return null;
    const { node, versions, parties } = got;
    const current = versions.find((v) => v.status === 'in_effect');
    const open = versions.find((v) => v.status === 'draft' || v.status === 'sent');
    const shown = current ?? open!;
    const names = (v: VersionRow) => Object.fromEntries(SPLIT_ROLES.map((r) => [r, parties.find((p) => p.version_id === v.id && p.role === r)?.name ?? ''])) as Record<SplitRole, string>;
    const signed = (v: VersionRow) => Object.fromEntries(parties.filter((p) => p.version_id === v.id && p.signed_at).map((p) => [p.name, short(p.signed_at!)]));

    // Breadcrumb: the path below the label, with "(single)"-style notes dropped.
    const path: string[] = [];
    let at: string | null = node.id;
    while (at) {
      const [n]: { label: string; parent_id: string | null }[] = await tx`SELECT label, parent_id FROM split_nodes WHERE id = ${at}`;
      if (!n || !n.parent_id) break;
      path.unshift(n.label.replace(/\s*\(.*\)$/, ''));
      at = n.parent_id;
    }
    const who = names(shown);
    return {
      breadcrumb: path,
      parties: who,
      v4: { version: shown.version, terms: shown.terms, effective: long(shown.effective_from), signed: signed(shown) },
      v5: open && open !== shown ? {
        version: open.version, status: open.status as 'draft' | 'sent', terms: open.terms, effective: long(open.effective_from), created: short(open.created_at), signed: signed(open),
      } : null,
      dealTerms: node.deal_notes,
      market: { text: producerMarketNote((open ?? shown).terms.producerBp, who.producer || 'The producer'), verified: PRODUCER_RANGE.verified },
      history: versions.filter((v) => v.status === 'superseded').map((v) => ({ v: `v${v.version}`, date: long(v.effective_from) })),
    };
  });
}

export type SplitWrite = { kind: 'draft'; terms: DealTerms } | { kind: 'send' } | { kind: 'sign'; role: SplitRole };

/**
 * Applies a rule from packages/core to the node's open version and writes what changed.
 * A payee may only sign their own line; owners and team edit, send, and sign for the label.
 */
export function liveSplitWrite(ctx: RequestContext, slug: string, w: SplitWrite): Promise<SplitOutcome | { ok: false; error: 'not_found' | 'forbidden'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId + ':splits'}))`;
    const got = await load(tx, slug);
    const open = got?.versions.find((v) => v.status === 'draft' || v.status === 'sent');
    if (!got || !open) return { ok: false, error: 'not_found', message: 'There is no open version of this split.' } as const;
    const state = stateOf(open, got.parties);
    const today = new Date().toISOString().slice(0, 10);

    if (w.kind === 'sign') {
      const mine = await tx<{ role: SplitRole }[]>`SELECT role::text FROM split_parties WHERE version_id = ${open.id} AND party_id = app_party()`;
      // Each party signs their own line; the owner and team also sign for the label.
      const allowed = mine.some((m) => m.role === w.role) || (ctx.role !== 'payee' && w.role === 'label');
      if (!allowed) return { ok: false, error: 'forbidden', message: ctx.role === 'payee' ? 'You can only sign your own share.' : 'The label signs as itself; each other party signs their own share.' } as const;
    } else if (ctx.role === 'payee') {
      return { ok: false, error: 'forbidden', message: 'Only the label’s owner and team can change a split.' } as const;
    }

    const out = w.kind === 'draft' ? editDraft(state, w.terms) : w.kind === 'send' ? send(state) : sign(state, w.role, today);
    if (!out.ok) return out;
    const audit = (kind: string, data: Record<string, unknown>) => tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SPL-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, ${kind}, ${`${slug}/v${open.version}`}, ${tx.json(data as never)})`;
    if (w.kind === 'draft') {
      await tx`UPDATE split_versions SET terms = ${tx.json(w.terms as never)} WHERE id = ${open.id}`;
      await audit('split.draft_edited', { terms: w.terms });
    } else if (w.kind === 'send') {
      await tx`UPDATE split_versions SET status = 'sent', sent_at = now() WHERE id = ${open.id}`;
      await audit('split.sent', {});
    } else {
      // The database puts the version in effect when the last party signs (split_take_effect).
      await tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ctx.userId} WHERE version_id = ${open.id} AND role = ${w.role}`;
      await audit('split.signed', { role: w.role, tookEffect: out.tookEffect });
    }
    return out;
  });
}

type PartyInput = { partyId: string } | { name: string };

/**
 * A release's first split, as a draft: the workspace is the label (a company party named after
 * it), the release's artist the artist, and an optional producer and featured artist. The tree
 * gets the artist, the release and its recording income; the draft sits on recording income.
 * New people get a payee record, so they can be paid and invited to sign.
 */
export function liveCreateSplit(ctx: RequestContext, c: { releaseId: string; producer?: PartyInput; feature?: PartyInput; artistIsMe?: boolean; terms: DealTerms }):
  Promise<{ ok: true; node: string } | { ok: false; status: number; error: 'not_found' | 'already_split' | 'invalid_terms' | 'forbidden'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners and team make splits.' } as const;
    const bad = validTerms(c.terms);
    if (bad) return { ok: false, status: 400, error: 'invalid_terms', message: bad } as const;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId + ':splits'}))`;
    const [rel] = await tx<{ id: string; slug: string; title: string; kind: string; artist_id: string; artist: string; artist_slug: string }[]>`
      SELECT rl.id, rl.slug, rl.title, rl.kind::text AS kind, rl.artist_id, a.name AS artist, a.slug AS artist_slug
      FROM releases rl JOIN parties a ON a.id = rl.artist_id WHERE rl.slug = ${c.releaseId}`;
    if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'No such release.' } as const;
    if ((await tx`SELECT 1 FROM split_nodes WHERE release_id = ${rel.id}`).length) return { ok: false, status: 409, error: 'already_split', message: `${rel.title} already has a split. Open it from Splits.` } as const;

    const partyOf = async (p: PartyInput): Promise<string | null> => {
      if ('partyId' in p) return (await tx<{ id: string }[]>`SELECT id FROM parties WHERE slug = ${p.partyId}`)[0]?.id ?? null;
      const slug = await freeSlug(tx, 'parties', p.name);
      const [row] = await tx<{ id: string }[]>`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ctx.tenantId}, ${slug}, ${p.name}, 'person') RETURNING id`;
      return row.id;
    };
    const producer = c.producer ? await partyOf(c.producer) : null;
    const feature = c.feature ? await partyOf(c.feature) : null;
    if ((c.producer && !producer) || (c.feature && !feature)) return { ok: false, status: 404, error: 'not_found', message: 'Someone on this split isn’t in the workspace.' } as const;
    // The workspace signs as the label.
    let [label] = await tx<{ id: string }[]>`SELECT id FROM parties WHERE type = 'company' AND name = ${ctx.tenantName} ORDER BY created_at LIMIT 1`;
    if (!label) [label] = await tx<{ id: string }[]>`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'parties', ctx.tenantName)}, ${ctx.tenantName}, 'company') RETURNING id`;
    // A solo artist's own workspace: the person signed in is the artist, and signs that line.
    if (c.artistIsMe) await tx`SELECT app_link_me_to_party(${rel.artist_id})`;
    for (const id of [rel.artist_id, producer, feature].filter(Boolean) as string[]) {
      await tx`INSERT INTO payees (tenant_id, party_id) VALUES (${ctx.tenantId}, ${id}) ON CONFLICT (party_id) DO NOTHING`;
    }

    // The tree: workspace, artist, release, recording income.
    let [root] = await tx<{ id: string }[]>`SELECT id FROM split_nodes WHERE parent_id IS NULL ORDER BY created_at LIMIT 1`;
    if (!root) [root] = await tx<{ id: string }[]>`INSERT INTO split_nodes (tenant_id, slug, label) VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'split_nodes', ctx.tenantName)}, ${ctx.tenantName}) RETURNING id`;
    let [artistNode] = await tx<{ id: string }[]>`SELECT id FROM split_nodes WHERE parent_id = ${root.id} AND label = ${rel.artist} ORDER BY created_at LIMIT 1`;
    if (!artistNode) [artistNode] = await tx<{ id: string }[]>`INSERT INTO split_nodes (tenant_id, slug, label, parent_id, position)
      VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'split_nodes', rel.artist)}, ${rel.artist}, ${root.id}, (SELECT count(*) FROM split_nodes WHERE parent_id = ${root.id})) RETURNING id`;
    const kind = rel.kind === 'ep' ? 'EP' : rel.kind;
    const [relNode] = await tx<{ id: string }[]>`INSERT INTO split_nodes (tenant_id, slug, label, parent_id, position, release_id)
      VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'split_nodes', rel.title)}, ${`${rel.title} (${kind})`}, ${artistNode.id}, (SELECT count(*) FROM split_nodes WHERE parent_id = ${artistNode.id}), ${rel.id}) RETURNING id`;
    const leafSlug = await freeSlug(tx, 'split_nodes', `${rel.title} recording`);
    const [leaf] = await tx<{ id: string }[]>`INSERT INTO split_nodes (tenant_id, slug, label, parent_id, position, deal_notes)
      VALUES (${ctx.tenantId}, ${leafSlug}, 'Recording income', ${relNode.id}, 0, ${tx.json([['Type', 'Net profit'], ['Set up', 'In the app']] as never)}) RETURNING id`;
    const [v] = await tx<{ id: string }[]>`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from, created_by)
      VALUES (${ctx.tenantId}, ${leaf.id}, 1, 'draft', ${tx.json(c.terms as never)}, ${new Date().toISOString().slice(0, 10)}, ${ctx.userId}) RETURNING id`;
    const lines: [SplitRole, string | null][] = [['label', label.id], ['artist', rel.artist_id], ['producer', producer], ['feature', feature]];
    for (const [role, id] of lines) if (id) await tx`INSERT INTO split_parties (tenant_id, version_id, role, party_id) VALUES (${ctx.tenantId}, ${v.id}, ${role}, ${id})`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SPL-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'split.created', ${`${leafSlug}/v1`}, ${tx.json({ release: rel.slug, terms: c.terms } as never)})`;
    return { ok: true, node: leafSlug } as const;
  });
}

/** A split's first version while it is still being agreed, or null if the node has none (or it is in effect). */
export function liveFirstSplit(ctx: RequestContext, slug: string): Promise<FirstSplitResponse | null> {
  return withTenant(sql, ctx, async (tx) => {
    const got = await load(tx, slug);
    if (!got || got.versions.some((v) => v.status === 'in_effect' || v.status === 'superseded')) return null;
    const open = got.versions.find((v) => v.status === 'draft' || v.status === 'sent');
    if (!open) return null;
    const rows = await tx<{ role: SplitRole; name: string; slug: string; signed_at: Date | null; mine: boolean; can_sign_in: boolean }[]>`
      SELECT sp.role::text AS role, p.name, p.slug, sp.signed_at, sp.party_id = app_party() AS mine,
             EXISTS (SELECT 1 FROM memberships m WHERE m.party_id = p.id AND m.tenant_id = sp.tenant_id)
               OR EXISTS (SELECT 1 FROM allowlist a WHERE a.party_slug = p.slug AND a.tenant_id = sp.tenant_id) AS can_sign_in
      FROM split_parties sp JOIN parties p ON p.id = sp.party_id WHERE sp.version_id = ${open.id}`;
    const path: string[] = [];
    let at: string | null = got.node.id;
    while (at) {
      const [n]: { label: string; parent_id: string | null }[] = await tx`SELECT label, parent_id FROM split_nodes WHERE id = ${at}`;
      if (!n || !n.parent_id) break;
      path.unshift(n.label.replace(/\s*\(.*\)$/, ''));
      at = n.parent_id;
    }
    const order: SplitRole[] = ['artist', 'label', 'producer', 'feature'];
    return {
      node: slug, title: path.slice(-2, -1)[0] ?? got.node.label, breadcrumb: path, version: open.version, status: open.status as 'draft' | 'sent',
      terms: open.terms, effective: long(open.effective_from),
      parties: rows.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).map((r) => ({
        role: r.role, name: r.name, partyId: r.slug, signed: r.signed_at ? short(r.signed_at) : null,
        canSign: open.status === 'sent' && !r.signed_at && (r.mine || (ctx.role !== 'payee' && r.role === 'label')),
        canSignIn: r.role === 'label' || r.can_sign_in,
      })),
    };
  });
}
