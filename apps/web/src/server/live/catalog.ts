import 'server-only';
import type { Recording, UpdateRecordingCommand } from '@breakrecords/contract';
import { aiUseFromLabel, aiUseLabel, formatDuration, metadataScore, type MetadataInput } from '@breakrecords/core/metadata';
import { formatPercent } from '@breakrecords/core/percent';
import { isIsrc, normalizeIsrc } from '@breakrecords/core/codes';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { getCatalog } from '@/data/api';
import { listReleases } from '@/data/api';
import { sql } from '../db';
import { liveSetIsrc, type CodeError } from './codes';
import type { RequestContext } from '../context';

type Catalog = Awaited<ReturnType<typeof getCatalog>>;

type RecRow = {
  slug: string; title: string; artist: string | null; isrc: string | null; duration_s: number | null; genre: string | null;
  ai_use: MetadataInput['aiUse']; agent_note: string | null; song: string | null; iswc: string | null; has_lyrics: boolean | null;
  writers_ok: boolean; upc: string | null; credits: { name: string; role: string }[];
};

const recordingRows = (tx: Tx, slug?: string) => tx<RecRow[]>`
  SELECT r.slug, r.title, a.name AS artist, r.isrc, r.duration_s, r.genre, r.ai_use::text AS ai_use, r.agent_note,
         w.title AS song, w.iswc, w.has_lyrics,
         coalesce((SELECT sum(share_bp) = 10000 AND bool_and(confirmed) FROM work_writers ww WHERE ww.work_id = w.id), false) AS writers_ok,
         (SELECT rl.upc FROM release_tracks rt JOIN releases rl ON rl.id = rt.release_id
            WHERE rt.recording_id = r.id AND rl.upc IS NOT NULL ORDER BY rl.release_date NULLS LAST LIMIT 1) AS upc,
         coalesce((SELECT json_agg(json_build_object('name', p.name, 'role', c.role) ORDER BY c.position, p.name)
            FROM recording_credits c JOIN parties p ON p.id = c.party_id WHERE c.recording_id = r.id), '[]') AS credits
  FROM recordings r
  JOIN parties a ON a.id = r.artist_id
  LEFT JOIN works w ON w.id = r.work_id
  WHERE ${slug ?? null}::text IS NULL OR r.slug = ${slug ?? null}
  ORDER BY r.created_at, r.slug`;

function toRecording(r: RecRow): Recording {
  const contributors = r.credits.filter((c) => c.name !== r.artist).length;
  const { score, note } = metadataScore({
    title: r.title, artist: r.artist, isrc: r.isrc, durationS: r.duration_s, genre: r.genre, aiUse: r.ai_use,
    hasSong: !!r.song, iswc: r.iswc, writersConfirmed: r.writers_ok, hasLyrics: !!r.has_lyrics, contributorCredits: contributors, upc: r.upc,
  }, r.agent_note);
  return {
    id: r.slug, title: r.title, artist: r.artist ?? '', isrc: r.isrc, score, ai: aiUseLabel(r.ai_use), duration: formatDuration(r.duration_s),
    upc: r.upc, song: r.song ?? 'No song linked', iswc: r.iswc, genre: r.genre, credits: r.credits, note,
  };
}

const KIND: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album' };
const ASSET: Record<string, string> = { cover_art: 'Image', press_photo: 'Image', master_audio: 'Audio', instrumental: 'Audio', stems: 'Audio', lyrics: 'Text', document: 'Document' };
const shortDate = (d: Date | null) => (d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not set');

/** The catalog for the signed-in tenant, in the contract's shape. Counts are real row counts. */
export function liveCatalog(ctx: RequestContext): Promise<Catalog> {
  return withTenant(sql, ctx, catalogIn);
}

async function catalogIn(tx: Tx): Promise<Catalog> {
  {
    const recordings = (await recordingRows(tx)).map(toRecording);

    const songs = await tx<{ slug: string; title: string; iswc: string | null; writers: { name: string; bp: number }[]; recordings: number; mlc: string | null }[]>`
      SELECT w.slug, w.title, w.iswc,
             coalesce((SELECT json_agg(json_build_object('name', p.name, 'bp', ww.share_bp) ORDER BY ww.share_bp DESC, p.name)
               FROM work_writers ww JOIN parties p ON p.id = ww.party_id WHERE ww.work_id = w.id), '[]') AS writers,
             (SELECT count(*)::int FROM recordings r WHERE r.work_id = w.id) AS recordings,
             (SELECT g.status::text FROM registrations g WHERE g.work_id = w.id AND g.org = 'mlc') AS mlc
      FROM works w ORDER BY w.created_at, w.slug`;

    const releases = await tx<{ slug: string; title: string; artist: string; kind: string; release_date: Date | null; upc: string | null; tracks: number; iso: string | null; list: { id: string; title: string; isrc: string | null }[] }[]>`
      SELECT rl.slug, rl.title, a.name AS artist, rl.kind::text AS kind, rl.release_date, rl.upc, to_char(rl.release_date, 'YYYY-MM-DD') AS iso,
             (SELECT count(*)::int FROM release_tracks t WHERE t.release_id = rl.id) AS tracks,
             coalesce((SELECT json_agg(json_build_object('id', r.slug, 'title', r.title, 'isrc', r.isrc) ORDER BY t.position)
               FROM release_tracks t JOIN recordings r ON r.id = t.recording_id WHERE t.release_id = rl.id), '[]') AS list
      FROM releases rl JOIN parties a ON a.id = rl.artist_id ORDER BY rl.release_date DESC NULLS FIRST, rl.slug`;
    // Until the releases module is live, only releases with a runbook link to one.
    const runbooks = new Set((await listReleases()).map((r) => r.id));

    const assets = await tx<{ name: string; kind: string; detail: string | null; release: string | null; ready: boolean }[]>`
      SELECT s.name, s.kind::text AS kind, s.detail, rl.title AS release, s.ready
      FROM assets s LEFT JOIN releases rl ON rl.id = s.release_id ORDER BY s.created_at, s.name`;

    const people = await tx<{ slug: string; name: string }[]>`SELECT slug, name FROM parties WHERE type <> 'company' ORDER BY name`;
    const unsplit = await tx<{ slug: string; title: string; artist: string }[]>`
      SELECT rl.slug, rl.title, a.name AS artist FROM releases rl JOIN parties a ON a.id = rl.artist_id
      WHERE NOT EXISTS (SELECT 1 FROM split_nodes n WHERE n.release_id = rl.id) ORDER BY rl.created_at DESC`;

    return {
      people: people.map((p) => ({ id: p.slug, name: p.name })),
      unsplit: unsplit.map((r) => ({ id: r.slug, title: r.title, artist: r.artist })),
      counts: { songs: songs.length, recordings: recordings.length, releases: releases.length, assets: assets.length },
      recordings,
      songs: songs.map((w) => ({
        id: w.slug, title: w.title, iswc: w.iswc, recordings: w.recordings,
        writers: w.writers.length ? w.writers.map((x) => `${x.name} ${formatPercent(x.bp)}`).join(', ') : 'No writers yet',
        mlc: (w.mlc ?? 'notStarted') as Catalog['songs'][number]['mlc'],
      })),
      releases: releases.map((r) => ({
        id: r.slug, title: r.title, artist: r.artist, kind: KIND[r.kind] ?? r.kind, date: shortDate(r.release_date), upc: r.upc ?? 'Not assigned', tracks: r.tracks,
        ...(runbooks.has(r.slug) ? { href: `/releases/${r.slug}` } : {}),
        edit: { kind: r.kind as 'single' | 'ep' | 'album', releaseDate: r.iso, tracks: r.list },
      })),
      assets: assets.map((a) => ({ name: a.name, kind: a.detail ? `${ASSET[a.kind]} · ${a.detail}` : ASSET[a.kind], release: a.release ?? 'Not assigned', ready: a.ready })),
    } as Catalog;
  }
}

/** Changes what the label owns on a recording: genre and the AI use declaration. Returns it rescored, or null if not found. */
export function liveUpdateRecording(ctx: RequestContext, slug: string, cmd: UpdateRecordingCommand): Promise<Recording | null | CodeError> {
  return withTenant(sql, ctx, async (tx) => {
    if (cmd.isrc !== undefined) {
      if (!(await tx`SELECT 1 FROM recordings WHERE slug = ${slug}`).length) return null;
      const bad = await liveSetIsrc(tx, slug, cmd.isrc);
      if (bad) return bad;
    }
    const ai = cmd.ai ? aiUseFromLabel(cmd.ai) : null;
    const res = await tx`UPDATE recordings SET
        genre = CASE WHEN ${cmd.genre !== undefined} THEN ${cmd.genre?.trim() || null} ELSE genre END,
        ai_use = coalesce(${ai}::ai_use, ai_use),
        updated_by = ${ctx.userId}, updated_at = now()
      WHERE slug = ${slug}`;
    if (!res.count) return null;
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-CAT-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'recording.updated', ${slug}, ${tx.json(cmd as never)})`;
    const [row] = await recordingRows(tx, slug);
    return row ? toRecording(row) : null;
  });
}

/** A slug for a new row: the name, lowercased, made unique in the tenant. */
export async function freeSlug(tx: Tx, table: 'parties' | 'releases' | 'recordings' | 'split_nodes' | 'works', name: string, prefix = ''): Promise<string> {
  const base = prefix + (name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled');
  const taken = new Set((await tx.unsafe<{ slug: string }[]>(`SELECT slug FROM ${table} WHERE slug = $1 OR slug LIKE $2`, [base, `${base}-%`])).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export type CatalogWrite<T> = { ok: true; value: T } | { ok: false; status: number; error: 'not_found' | 'duplicate' | 'invalid' | 'forbidden'; message: string };

/**
 * Adds a release and its recordings, in order. The artist is someone already in the workspace
 * or a new person or group by name. An ISRC is checked and must not already be in use.
 */
export function liveCreateRelease(ctx: RequestContext, c: { title: string; kind: 'single' | 'ep' | 'album'; artist: { partyId: string } | { name: string; group?: boolean }; releaseDate?: string; tracks: { title: string; isrc?: string }[] }): Promise<CatalogWrite<Catalog>> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners and team add music.' } as const;
    const isrcs = c.tracks.map((t) => (t.isrc ? normalizeIsrc(t.isrc) : null));
    const bad = isrcs.find((i) => i && !isIsrc(i));
    if (bad) return { ok: false, status: 400, error: 'invalid', message: `${bad} isn’t a valid ISRC (like US-ABC-26-00001).` } as const;
    const given = isrcs.filter(Boolean) as string[];
    if (new Set(given).size !== given.length) return { ok: false, status: 400, error: 'invalid', message: 'Two tracks have the same ISRC.' } as const;
    if (given.length) {
      const [dup] = await tx<{ isrc: string }[]>`SELECT isrc FROM recordings WHERE isrc = ANY(${given}::text[])`;
      if (dup) return { ok: false, status: 409, error: 'duplicate', message: `${dup.isrc} is already on another recording.` } as const;
    }
    let artistId: string;
    if ('partyId' in c.artist) {
      const [a] = await tx<{ id: string }[]>`SELECT id FROM parties WHERE slug = ${c.artist.partyId}`;
      if (!a) return { ok: false, status: 404, error: 'not_found', message: 'No such artist in this workspace.' } as const;
      artistId = a.id;
    } else {
      const slug = await freeSlug(tx, 'parties', c.artist.name);
      [{ id: artistId }] = await tx<{ id: string }[]>`INSERT INTO parties (tenant_id, slug, name, type) VALUES (${ctx.tenantId}, ${slug}, ${c.artist.name}, ${c.artist.group ? 'group' : 'person'}) RETURNING id`;
    }
    const relSlug = await freeSlug(tx, 'releases', c.title);
    const [rel] = await tx<{ id: string }[]>`INSERT INTO releases (tenant_id, slug, title, kind, artist_id, release_date)
      VALUES (${ctx.tenantId}, ${relSlug}, ${c.title}, ${c.kind}, ${artistId}, ${c.releaseDate ?? null}) RETURNING id`;
    for (const [i, t] of c.tracks.entries()) {
      const recSlug = await freeSlug(tx, 'recordings', t.title);
      const [rec] = await tx<{ id: string }[]>`INSERT INTO recordings (tenant_id, slug, title, artist_id, isrc, updated_by)
        VALUES (${ctx.tenantId}, ${recSlug}, ${t.title}, ${artistId}, ${isrcs[i]}, ${ctx.userId}) RETURNING id`;
      await tx`INSERT INTO release_tracks (tenant_id, release_id, recording_id, position) VALUES (${ctx.tenantId}, ${rel.id}, ${rec.id}, ${i + 1})`;
    }
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-CAT-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'release.created', ${relSlug}, ${tx.json({ title: c.title, kind: c.kind, tracks: c.tracks.length })})`;
    return { ok: true, value: await catalogIn(tx) } as const;
  });
}

/** Deletes recordings no longer on any release, if nothing else (income, credits, registrations) points at them. */
async function dropOrphans(tx: Tx, ids: string[]) {
  for (const id of ids) {
    if ((await tx`SELECT 1 FROM release_tracks WHERE recording_id = ${id}`).length) continue;
    await tx`SAVEPOINT drop_rec`;
    try { await tx`DELETE FROM recordings WHERE id = ${id}`; await tx`RELEASE SAVEPOINT drop_rec`; }
    catch { await tx`ROLLBACK TO SAVEPOINT drop_rec`; } // still referenced: it stays in the catalog
  }
}

/**
 * Changes a release: title, kind, date, and its tracks in order (kept by id and renamed or
 * re-coded, added, or taken off). A recording taken off every release is deleted unless income
 * or a registration points at it.
 */
export function liveEditRelease(ctx: RequestContext, slug: string, c: { title?: string; kind?: 'single' | 'ep' | 'album'; releaseDate?: string | null; tracks?: { id?: string; title: string; isrc?: string }[] }): Promise<CatalogWrite<Catalog>> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners and team change releases.' } as const;
    const [rel] = await tx<{ id: string; artist_id: string }[]>`SELECT id, artist_id FROM releases WHERE slug = ${slug}`;
    if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'No such release.' } as const;
    await tx`UPDATE releases SET title = coalesce(${c.title ?? null}, title), kind = coalesce(${c.kind ?? null}::release_kind, kind),
      release_date = CASE WHEN ${c.releaseDate !== undefined} THEN ${c.releaseDate ?? null}::date ELSE release_date END WHERE id = ${rel.id}`;
    if (c.title) await tx`UPDATE split_nodes SET label = ${c.title} || substring(label from ' \\(.*\\)$') WHERE release_id = ${rel.id}`;
    if (c.tracks) {
      const isrcs = c.tracks.map((t) => (t.isrc ? normalizeIsrc(t.isrc) : null));
      const bad = isrcs.find((i) => i && !isIsrc(i));
      if (bad) return { ok: false, status: 400, error: 'invalid', message: `${bad} isn’t a valid ISRC (like US-ABC-26-00001).` } as const;
      const before = await tx<{ id: string; slug: string }[]>`SELECT r.id, r.slug FROM release_tracks t JOIN recordings r ON r.id = t.recording_id WHERE t.release_id = ${rel.id}`;
      const keep: string[] = [];
      await tx`DELETE FROM release_tracks WHERE release_id = ${rel.id}`;
      for (const [i, t] of c.tracks.entries()) {
        const old = t.id ? before.find((b) => b.slug === t.id) : undefined;
        let recId: string;
        try {
          if (old) {
            await tx`UPDATE recordings SET title = ${t.title}, isrc = ${isrcs[i]}, updated_by = ${ctx.userId}, updated_at = now() WHERE id = ${old.id}`;
            recId = old.id;
          } else {
            [{ id: recId }] = await tx<{ id: string }[]>`INSERT INTO recordings (tenant_id, slug, title, artist_id, isrc, updated_by)
              VALUES (${ctx.tenantId}, ${await freeSlug(tx, 'recordings', t.title)}, ${t.title}, ${rel.artist_id}, ${isrcs[i]}, ${ctx.userId}) RETURNING id`;
          }
        } catch (e) {
          if ((e as { code?: string }).code === '23505') throw Object.assign(new Error('dup'), { userMessage: `${isrcs[i]} is already on another recording.` });
          throw e;
        }
        keep.push(recId);
        await tx`INSERT INTO release_tracks (tenant_id, release_id, recording_id, position) VALUES (${ctx.tenantId}, ${rel.id}, ${recId}, ${i + 1})`;
      }
      await dropOrphans(tx, before.map((b) => b.id).filter((id) => !keep.includes(id)));
    }
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-CAT-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'release.edited', ${slug}, ${tx.json(c as never)})`;
    return { ok: true, value: await catalogIn(tx) } as const;
  }).catch((e: { userMessage?: string }) => {
    if (e.userMessage) return { ok: false, status: 409, error: 'duplicate', message: e.userMessage } as const;
    throw e;
  });
}

/**
 * Removes a release that hasn't been used for money: no split sent or signed, no statements,
 * payouts, income or recoupment. Its draft split goes with it, and its recordings unless
 * something else points at them.
 */
export function liveRemoveRelease(ctx: RequestContext, slug: string): Promise<CatalogWrite<Catalog> | { ok: false; status: 409; error: 'in_use'; message: string }> {
  return withTenant(sql, ctx, async (tx) => {
    if (ctx.role === 'payee') return { ok: false, status: 403, error: 'forbidden', message: 'Only the workspace’s owners and team remove releases.' } as const;
    const [rel] = await tx<{ id: string; title: string }[]>`SELECT id, title FROM releases WHERE slug = ${slug}`;
    if (!rel) return { ok: false, status: 404, error: 'not_found', message: 'No such release.' } as const;
    const [used] = await tx<{ why: string }[]>`
      SELECT 'its split has been sent for signatures' AS why FROM split_nodes n JOIN split_nodes leaf ON leaf.parent_id = n.id OR leaf.id = n.id
        JOIN split_versions v ON v.node_id = leaf.id WHERE n.release_id = ${rel.id} AND v.status <> 'draft'
      UNION ALL SELECT 'it has statements' FROM payee_statements WHERE release_id = ${rel.id}
      UNION ALL SELECT 'payouts are paid from it' FROM payout_lines WHERE source_release_id = ${rel.id}
      UNION ALL SELECT 'it has a recoupment account' FROM recoupment_accounts WHERE release_id = ${rel.id}
      UNION ALL SELECT 'its recordings have earned income' FROM income_lines l JOIN release_tracks t ON t.recording_id = l.recording_id WHERE t.release_id = ${rel.id}
      LIMIT 1`;
    if (used) return { ok: false, status: 409, error: 'in_use', message: `${rel.title} stays: ${used.why}, and that history matters for payments.` } as const;
    const recs = (await tx<{ recording_id: string }[]>`SELECT recording_id FROM release_tracks WHERE release_id = ${rel.id}`).map((r) => r.recording_id);
    const parents = (await tx<{ parent_id: string }[]>`SELECT parent_id FROM split_nodes WHERE release_id = ${rel.id} AND parent_id IS NOT NULL`).map((r) => r.parent_id);
    await tx`DELETE FROM split_nodes WHERE release_id = ${rel.id}`; // its draft split and recording-income node go with it
    // An artist heading with nothing left under it goes too.
    for (const p of parents) await tx`DELETE FROM split_nodes n WHERE n.id = ${p} AND n.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM split_nodes c WHERE c.parent_id = n.id)`;
    await tx`DELETE FROM releases WHERE id = ${rel.id}`;
    await dropOrphans(tx, recs);
    await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
      VALUES (${ctx.tenantId}, ${'AUD-CAT-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'release.removed', ${slug}, ${tx.json({ title: rel.title } as never)})`;
    return { ok: true, value: await catalogIn(tx) } as const;
  });
}
