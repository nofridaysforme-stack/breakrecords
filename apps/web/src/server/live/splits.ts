import 'server-only';
import type { SplitNodeResponse, SplitTreeNode } from '@breakrecords/contract';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { editDraft, producerMarketNote, PRODUCER_RANGE, send, sign, SPLIT_ROLES, type SplitOutcome, type SplitRole, type VersionState } from '@breakrecords/core/splitVersions';
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
  status: v.status, terms: v.terms,
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
      const allowed = ctx.role === 'payee' ? mine.some((m) => m.role === w.role) : w.role === 'label';
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
