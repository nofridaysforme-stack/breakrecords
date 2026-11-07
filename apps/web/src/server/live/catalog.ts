import 'server-only';
import type { Recording, UpdateRecordingCommand } from '@breakrecords/contract';
import { aiUseFromLabel, aiUseLabel, formatDuration, metadataScore, type MetadataInput } from '@breakrecords/core/metadata';
import { formatPercent } from '@breakrecords/core/percent';
import { withTenant, type Tx } from '@breakrecords/db/client';
import type { getCatalog } from '@/data/api';
import { listReleases } from '@/data/api';
import { sql } from '../db';
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
  return withTenant(sql, ctx, async (tx) => {
    const recordings = (await recordingRows(tx)).map(toRecording);

    const songs = await tx<{ slug: string; title: string; iswc: string | null; writers: { name: string; bp: number }[]; recordings: number; mlc: string | null }[]>`
      SELECT w.slug, w.title, w.iswc,
             coalesce((SELECT json_agg(json_build_object('name', p.name, 'bp', ww.share_bp) ORDER BY ww.share_bp DESC, p.name)
               FROM work_writers ww JOIN parties p ON p.id = ww.party_id WHERE ww.work_id = w.id), '[]') AS writers,
             (SELECT count(*)::int FROM recordings r WHERE r.work_id = w.id) AS recordings,
             (SELECT g.status::text FROM registrations g WHERE g.work_id = w.id AND g.org = 'mlc') AS mlc
      FROM works w ORDER BY w.created_at, w.slug`;

    const releases = await tx<{ slug: string; title: string; artist: string; kind: string; release_date: Date | null; upc: string | null; tracks: number }[]>`
      SELECT rl.slug, rl.title, a.name AS artist, rl.kind::text AS kind, rl.release_date, rl.upc,
             (SELECT count(*)::int FROM release_tracks t WHERE t.release_id = rl.id) AS tracks
      FROM releases rl JOIN parties a ON a.id = rl.artist_id ORDER BY rl.release_date DESC NULLS FIRST, rl.slug`;
    // Until the releases module is live, only releases with a runbook link to one.
    const runbooks = new Set((await listReleases()).map((r) => r.id));

    const assets = await tx<{ name: string; kind: string; detail: string | null; release: string | null; ready: boolean }[]>`
      SELECT s.name, s.kind::text AS kind, s.detail, rl.title AS release, s.ready
      FROM assets s LEFT JOIN releases rl ON rl.id = s.release_id ORDER BY s.created_at, s.name`;

    return {
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
      })),
      assets: assets.map((a) => ({ name: a.name, kind: a.detail ? `${ASSET[a.kind]} · ${a.detail}` : ASSET[a.kind], release: a.release ?? 'Not assigned', ready: a.ready })),
    } as Catalog;
  });
}

/** Changes what the label owns on a recording: genre and the AI use declaration. Returns it rescored, or null if not found. */
export function liveUpdateRecording(ctx: RequestContext, slug: string, cmd: UpdateRecordingCommand): Promise<Recording | null> {
  return withTenant(sql, ctx, async (tx) => {
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
