import 'server-only';
import type { SplitNodeResponse, SplitTreeNode, SplitVersionsResponse } from '@breakrecords/contract';
import { freeSlug } from './catalog';
import type { DealTerms } from '@breakrecords/core/dealSplit';
import { checkLines, editDraft, lineAmounts, lineKey, producerMarketNote, PRODUCER_RANGE, send, sign, SPLIT_ROLES, validTerms, type SplitOutcome, type SplitRole, type VersionState } from '@breakrecords/core/splitVersions';
import { withTenant, type Tx } from '@breakrecords/db/client';
import { sql } from '../db';
import type { RequestContext } from '../context';

type NodeRow = { id: string; slug: string; label: string; parent_id: string | null; deal_notes: [string, string][] };
type VersionRow = { id: string; version: number; status: 'draft' | 'sent' | 'in_effect' | 'superseded'; terms: DealTerms; effective_from: Date; created_at: Date };
type PartyRow = { version_id: string; role: SplitRole; name: string; signed_at: Date | null; party_id: string; slug: string; share_bp: number };

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
    SELECT sp.version_id, sp.role::text AS role, p.name, sp.signed_at, sp.party_id, p.slug, sp.share_bp FROM split_parties sp JOIN parties p ON p.id = sp.party_id
    WHERE sp.version_id = ANY(${versions.map((v) => v.id)}::uuid[]) ORDER BY sp.share_bp DESC, p.name` : [];
  return { node, versions, parties };
}

/** A version's lines, each keyed by role alone when it's the only person in that role. */
const keyed = (v: VersionRow, parties: PartyRow[]) => {
  const mine = parties.filter((p) => p.version_id === v.id);
  return mine.map((p) => ({ ...p, key: lineKey(p.role, p.slug, mine.filter((x) => x.role === p.role).length === 1) }));
};
const stateOf = (v: VersionRow, parties: PartyRow[]): VersionState => {
  const lines = keyed(v, parties);
  return { status: v.status, terms: v.terms, roles: lines.map((l) => l.key),
    signed: Object.fromEntries(lines.filter((l) => l.signed_at).map((l) => [l.key, l.signed_at!.toISOString().slice(0, 10)])) };
};

/** One node's split in the contract's shape, or null when it inherits its parent's. */
export function liveSplitNode(ctx: RequestContext, slug: string): Promise<SplitNodeResponse | null> {
  return withTenant(sql, ctx, async (tx) => {
    const got = await load(tx, slug);
    if (!got || !got.versions.length) return null;
    const { node, versions, parties } = got;
    const current = versions.find((v) => v.status === 'in_effect');
    const open = versions.find((v) => v.status === 'draft' || v.status === 'sent');
    const shown = current ?? open!;
    const names = (v: VersionRow) => Object.fromEntries(SPLIT_ROLES.map((r) => [r, parties.filter((p) => p.version_id === v.id && p.role === r).map((p) => p.name).join(' and ')])) as Record<SplitRole, string>;
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

export type LineInput = { role: 'artist' | 'producer' | 'feature'; party: { partyId: string } | { name: string }; shareBp: number };
export type SplitWrite = { kind: 'draft'; terms: DealTerms; lines?: LineInput[] } | { kind: 'send' } | { kind: 'sign'; role: SplitRole; partyId?: string };

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

    const lines = keyed(open, got.parties);
    let line: (typeof lines)[number] | undefined;
    if (w.kind === 'sign') {
      const [me] = await tx<{ id: string | null }[]>`SELECT app_party() AS id`;
      const inRole = lines.filter((l) => l.role === w.role);
      line = w.partyId ? inRole.find((l) => l.slug === w.partyId) : inRole.find((l) => l.party_id === me.id) ?? (inRole.length === 1 ? inRole[0] : undefined);
      if (!line) return { ok: false, error: 'forbidden', message: 'That person isn’t on this split in that role.' } as const;
      // Each person signs their own line; the owner and team also sign for the label.
      const allowed = line.party_id === me.id || (ctx.role !== 'payee' && w.role === 'label');
      if (!allowed) return { ok: false, error: 'forbidden', message: ctx.role === 'payee' ? 'You can only sign your own share.' : 'The label signs as itself; each other person signs their own share.' } as const;
    } else if (ctx.role === 'payee') {
      return { ok: false, error: 'forbidden', message: 'Only the label’s owner and team can change a split.' } as const;
    }
    if (w.kind === 'draft' && w.lines) {
      const bad = await replaceLines(tx, ctx, open.id, w.lines, null);
      if (bad) return { ok: false, error: 'invalid_terms', message: bad } as SplitOutcome;
    }

    const out = w.kind === 'draft' ? editDraft(state, w.terms) : w.kind === 'send' ? send(state) : sign(state, line!.key, today);
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
      await tx`UPDATE split_parties SET signed_at = now(), signed_by = ${ctx.userId} WHERE version_id = ${open.id} AND role = ${w.role} AND party_id = ${line!.party_id}`;
      await audit('split.signed', { role: w.role, party: line!.slug, tookEffect: out.tookEffect });
    }
    return out;
  });
}

type PartyInput = { partyId: string } | { name: string };

/** A party by slug, or a new person by name (with a payee record, so they can be paid and invited). */
async function partyOf(tx: Tx, ctx: RequestContext, p: PartyInput): Promise<string | null> {
  let id: string | undefined;
  if ('partyId' in p) id = (await tx<{ id: string }[]>`SELECT id FROM parties WHERE slug = ${p.partyId}`)[0]?.id;
  else [{ id }] = await tx<{ id: string }[]>`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'parties', p.name)}, ${p.name}, 'person') RETURNING id`;
  if (id) await tx`INSERT INTO payees (tenant_id, party_id) VALUES (${ctx.tenantId}, ${id}) ON CONFLICT (party_id) DO NOTHING`;
  return id ?? null;
}

/** The workspace's own party, which signs as the label. */
async function labelParty(tx: Tx, ctx: RequestContext): Promise<string> {
  const [label] = await tx<{ id: string }[]>`SELECT id FROM parties WHERE type = 'company' AND name = ${ctx.tenantName} ORDER BY created_at LIMIT 1`;
  if (label) return label.id;
  const [made] = await tx<{ id: string }[]>`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'parties', ctx.tenantName)}, ${ctx.tenantName}, 'company') RETURNING id`;
  return made.id;
}

/**
 * Replaces a draft's people: the label stays; artists, producers and featured artists are
 * set from `lines` (each role's shares total 100%). With no artist lines, `defaultArtist` is the
 * artist at 100%. Returns a message if the lines don't add up.
 */
async function replaceLines(tx: Tx, ctx: RequestContext, versionId: string, lines: LineInput[], defaultArtist: string | null): Promise<string | null> {
  const resolved: { role: SplitRole; id: string; shareBp: number }[] = [];
  for (const l of lines) {
    const id = await partyOf(tx, ctx, l.party);
    if (!id) return 'Someone on this split isn’t in the workspace.';
    resolved.push({ role: l.role, id, shareBp: l.shareBp });
  }
  if (!resolved.some((l) => l.role === 'artist') && defaultArtist) resolved.push({ role: 'artist', id: defaultArtist, shareBp: 10000 });
  const label = (await tx<{ party_id: string }[]>`SELECT party_id FROM split_parties WHERE version_id = ${versionId} AND role = 'label'`)[0]?.party_id ?? await labelParty(tx, ctx);
  const all = [{ role: 'label' as SplitRole, id: label, shareBp: 10000 }, ...resolved];
  const bad = checkLines(all.map((l) => ({ role: l.role, party: l.id, shareBp: l.shareBp })));
  if (bad) return bad;
  await tx`DELETE FROM split_parties WHERE version_id = ${versionId}`;
  for (const l of all) await tx`INSERT INTO split_parties (tenant_id, version_id, role, party_id, share_bp) VALUES (${ctx.tenantId}, ${versionId}, ${l.role}, ${l.id}, ${l.shareBp})`;
  return null;
}

/**
 * A release's first split, as a draft: the workspace is the label, and the artists, producers
 * and featured artists are those given (the release's artist at 100% when no artist is given).
 * The tree gets the artist, the release and its recording income; the draft sits on recording income.
 */
export function liveCreateSplit(ctx: RequestContext, c: { releaseId: string; lines?: LineInput[]; artistIsMe?: boolean; terms: DealTerms }):
  Promise<{ ok: true; node: string } | { ok: false; status: number; error: 'not_found' | 'already_split' | 'invalid_terms' | 'forbidden'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners and team make splits.' } as const;
    const bad = validTerms(c.terms);
    if (bad) return { ok: false, status: 400, error: 'invalid_terms', message: bad } as const;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId + ':splits'}))`;
    const [rel] = await tx<{ id: string; slug: string; title: string; kind: string; artist_id: string; artist: string }[]>`
      SELECT rl.id, rl.slug, rl.title, rl.kind::text AS kind, rl.artist_id, a.name AS artist FROM releases rl JOIN parties a ON a.id = rl.artist_id WHERE rl.slug = ${c.releaseId}`;
    if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'No such release.' } as const;
    if ((await tx`SELECT 1 FROM split_nodes WHERE release_id = ${rel.id}`).length) return { ok: false, status: 409, error: 'already_split', message: `${rel.title} already has a split. Open it from Splits.` } as const;
    // A solo artist's own workspace: the person signed in is the artist, and signs that line.
    if (c.artistIsMe) await tx`SELECT app_link_me_to_party(${rel.artist_id})`;
    await tx`INSERT INTO payees (tenant_id, party_id) VALUES (${ctx.tenantId}, ${rel.artist_id}) ON CONFLICT (party_id) DO NOTHING`;

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
    const wrong = await replaceLines(tx, ctx, v.id, c.lines ?? [], rel.artist_id);
    if (wrong) throw Object.assign(new Error(wrong), { userMessage: wrong });
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SPL-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'split.created', ${`${leafSlug}/v1`}, ${tx.json({ release: rel.slug, terms: c.terms } as never)})`;
    return { ok: true, node: leafSlug } as const;
  }).catch((e: { userMessage?: string }) => {
    if (e.userMessage) return { ok: false, status: 400, error: 'invalid_terms', message: e.userMessage } as const;
    throw e;
  });
}

async function songsOf(tx: Tx, releaseId: string | null): Promise<SplitVersionsResponse['songs']> {
  if (!releaseId) return [];
  const rows = await tx<{ slug: string; title: string; writers: { slug: string; name: string; share: number; confirmed: boolean; mine: boolean; can_sign_in: boolean }[] }[]>`
    SELECT r.slug, r.title,
      coalesce((SELECT json_agg(json_build_object('slug', p.slug, 'name', p.name, 'share', ww.share_bp, 'confirmed', ww.confirmed, 'mine', ww.party_id = app_party(),
          'can_sign_in', EXISTS (SELECT 1 FROM memberships m WHERE m.party_id = p.id) OR EXISTS (SELECT 1 FROM allowlist a WHERE a.party_slug = p.slug AND a.tenant_id = p.tenant_id))
        ORDER BY ww.share_bp DESC, p.name) FROM work_writers ww JOIN parties p ON p.id = ww.party_id WHERE ww.work_id = r.work_id), '[]') AS writers
    FROM release_tracks t JOIN recordings r ON r.id = t.recording_id WHERE t.release_id = ${releaseId} ORDER BY t.position`;
  return rows.map((r) => ({
    recordingId: r.slug, title: r.title,
    writers: r.writers.map((w) => ({ partyId: w.slug, name: w.name, shareBp: w.share, confirmed: w.confirmed, canConfirm: !!w.mine && !w.confirmed, canSignIn: !!w.can_sign_in })),
  }));
}

/** A split's version in effect and its open one, line by line, with the release's songwriter splits. */
export function liveSplitVersions(ctx: RequestContext, slug: string): Promise<SplitVersionsResponse | null> {
  return withTenant(sql, ctx, async (tx) => {
    const got = await load(tx, slug);
    if (!got || !got.versions.length) return null;
    const [me] = await tx<{ id: string | null }[]>`SELECT app_party() AS id`;
    const signIn = new Set((await tx<{ slug: string }[]>`
      SELECT p.slug FROM parties p WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.party_id = p.id)
        OR EXISTS (SELECT 1 FROM allowlist a WHERE a.party_slug = p.slug AND a.tenant_id = p.tenant_id) OR p.type = 'company'`).map((r) => r.slug));
    const current = got.versions.find((v) => v.status === 'in_effect');
    const open = got.versions.find((v) => v.status === 'draft' || v.status === 'sent');
    const out = (v: VersionRow) => {
      const lines = got.parties.filter((p) => p.version_id === v.id);
      const order: SplitRole[] = ['artist', 'label', 'producer', 'feature'];
      lines.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.share_bp - a.share_bp || a.name.localeCompare(b.name));
      const amounts = lineAmounts(v.terms, lines.map((l) => ({ role: l.role, party: l.slug, shareBp: l.share_bp })));
      return { version: v.version, terms: v.terms, effective: long(v.effective_from), lines: lines.map((l, i) => ({
        role: l.role, name: l.name, partyId: l.slug, shareBp: l.share_bp, amount: amounts[i], signed: l.signed_at ? short(l.signed_at) : null,
        canSign: v.status === 'sent' && !l.signed_at && (l.party_id === me.id || (ctx.role !== 'payee' && l.role === 'label')),
        canSignIn: signIn.has(l.slug),
      })) };
    };
    const path: string[] = [];
    let at: string | null = got.node.id;
    let releaseId: string | null = null;
    while (at) {
      const [n]: { label: string; parent_id: string | null; release_id: string | null }[] = await tx`SELECT label, parent_id, release_id FROM split_nodes WHERE id = ${at}`;
      if (!n || !n.parent_id) break;
      releaseId ??= n.release_id;
      path.unshift(n.label.replace(/\s*\(.*\)$/, ''));
      at = n.parent_id;
    }
    const [rel] = releaseId ? await tx<{ slug: string; title: string }[]>`SELECT slug, title FROM releases WHERE id = ${releaseId}` : [];
    return {
      node: slug, title: rel?.title ?? path.slice(-2, -1)[0] ?? got.node.label, breadcrumb: path, releaseId: rel?.slug ?? null,
      current: current ? out(current) : null,
      open: open ? { ...out(open), status: open.status as 'draft' | 'sent', created: short(open.created_at) } : null,
      canEdit: ctx.role !== 'payee', songs: await songsOf(tx, releaseId),
    };
  });
}

/** Starts a new version of a split that's in effect: a draft copy of it, with the same people. */
export function liveProposeVersion(ctx: RequestContext, slug: string): Promise<{ ok: true } | { ok: false; status: number; error: 'not_found' | 'forbidden' | 'not_draft'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the label’s owner and team can change a split.' } as const;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId + ':splits'}))`;
    const got = await load(tx, slug);
    const current = got?.versions.find((v) => v.status === 'in_effect');
    if (!got || !current) return { ok: false, status: 404, error: 'not_found', message: 'This split has no version in effect to change.' } as const;
    if (got.versions.some((v) => v.status === 'draft' || v.status === 'sent')) return { ok: false, status: 409, error: 'not_draft', message: 'A new version is already open. Finish or change that one.' } as const;
    const next = Math.max(...got.versions.map((v) => v.version)) + 1;
    const [v] = await tx<{ id: string }[]>`INSERT INTO split_versions (tenant_id, node_id, version, status, terms, effective_from, created_by)
      VALUES (${ctx.tenantId}, ${got.node.id}, ${next}, 'draft', ${tx.json(current.terms as never)}, ${new Date().toISOString().slice(0, 10)}, ${ctx.userId}) RETURNING id`;
    await tx`INSERT INTO split_parties (tenant_id, version_id, role, party_id, share_bp)
      SELECT tenant_id, ${v.id}, role, party_id, share_bp FROM split_parties WHERE version_id = ${got.versions.find((x) => x.id === current.id)!.id}`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SPL-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'split.version_proposed', ${`${slug}/v${next}`}, ${tx.json({ from: current.version } as never)})`;
    return { ok: true } as const;
  });
}

/** Sets a recording's songwriters and their shares (total 100%). Makes the song if it has none. Clears every confirmation. */
export function liveSetWriters(ctx: RequestContext, recordingSlug: string, writers: { party: PartyInput; shareBp: number }[]): Promise<{ ok: true } | { ok: false; status: number; error: 'not_found' | 'forbidden' | 'invalid'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners and team set songwriters.' } as const;
    const [rec] = await tx<{ id: string; title: string; work_id: string | null }[]>`SELECT id, title, work_id FROM recordings WHERE slug = ${recordingSlug}`;
    if (!rec) return { ok: false, status: 404, error: 'not_found', message: 'No such recording.' } as const;
    let work = rec.work_id;
    if (!work) {
      [{ id: work }] = await tx<{ id: string }[]>`INSERT INTO works (tenant_id, slug, title) VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'works', rec.title)}, ${rec.title}) RETURNING id`;
      await tx`UPDATE recordings SET work_id = ${work} WHERE id = ${rec.id}`;
    }
    const ids: string[] = [];
    for (const w of writers) {
      const id = await partyOf(tx, ctx, w.party);
      if (!id) return { ok: false, status: 404, error: 'not_found', message: 'A writer isn’t in the workspace.' } as const;
      if (ids.includes(id)) return { ok: false, status: 400, error: 'invalid', message: 'Someone is listed twice.' } as const;
      ids.push(id);
    }
    await tx`DELETE FROM work_writers WHERE work_id = ${work}`;
    for (const [i, w] of writers.entries()) await tx`INSERT INTO work_writers (tenant_id, work_id, party_id, share_bp, confirmed) VALUES (${ctx.tenantId}, ${work}, ${ids[i]}, ${w.shareBp}, false)`;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-SNG-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'song.writers_set', ${recordingSlug}, ${tx.json({ writers: writers.map((w, i) => ({ party: ids[i], shareBp: w.shareBp })) } as never)})`;
    return { ok: true } as const;
  });
}

/** A writer confirms their own share of a song. */
export function liveConfirmWriter(ctx: RequestContext, recordingSlug: string): Promise<{ ok: true } | { ok: false; status: number; error: 'not_found' | 'forbidden' | 'invalid'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    // A recording (the label's screens) or a song (a writer's portal, where recordings aren't visible).
    const [rec] = await tx<{ work_id: string | null }[]>`SELECT r.work_id FROM recordings r WHERE r.slug = ${recordingSlug}
      UNION ALL SELECT w.id FROM works w WHERE w.slug = ${recordingSlug} LIMIT 1`;
    if (!rec?.work_id) return { ok: false, status: 404, error: 'not_found', message: 'That song has no writers yet.' } as const;
    try {
      await tx`SELECT app_confirm_writer_share(${rec.work_id})`;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '42501') return { ok: false, status: 403, error: 'forbidden', message: 'You can only confirm your own share.' } as const;
      if (code === '22023') return { ok: false, status: 400, error: 'invalid', message: 'This song’s shares don’t total 100%.' } as const;
      throw e;
    }
    return { ok: true } as const;
  });
}
