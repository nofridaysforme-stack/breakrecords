import { NextResponse } from 'next/server';
import { StartAssetUploadCommand } from '@breakrecords/contract';
import { getCatalog } from '@/data/api';
import { liveStartAsset, mockStartAsset } from '@/server/assets';
import { documentStore, StorageNotConfigured } from '@/server/documents/storage';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Through the app, a request can carry about 4 MB (Vercel's limit); larger files go straight to storage. */
const APP_UPLOAD_LIMIT = 4 * 1024 * 1024;

/** Starts an upload: makes the asset (not ready yet) and says where to send the file. */
export async function POST(req: Request) {
  const body = StartAssetUploadCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', body.error.issues[0]?.message ?? 'Choose a file and what it is.');
  const who = await teamWriter('catalog', 'the catalog');
  if ('refused' in who) return who.refused;
  let files;
  try { files = documentStore(!!who.ctx); } catch (e) { if (e instanceof StorageNotConfigured) return err(503, 'storage', 'File storage isn’t set up on this site yet, so files can’t be kept. Add the DOCUMENTS_S3_* settings in Vercel.'); throw e; }
  const c = body.data;
  if (!files.signed && process.env.VERCEL && c.size > APP_UPLOAD_LIMIT) return err(413, 'too_large', 'Files over 4 MB need file storage set up on this site.');
  let id: string; let key: string;
  if (who.ctx) {
    const out = await liveStartAsset(who.ctx, c);
    if (!out.ok) return err(out.status, out.error, out.message);
    ({ id, key } = out.value);
  } else {
    const release = c.releaseId ? (await getCatalog()).releases.find((r) => r.id === c.releaseId)?.title ?? null : null;
    ({ id, key } = await mockStartAsset(c, release));
  }
  const viaApp = `/api/catalog/assets/${id}/upload`;
  if (files.signed) {
    return NextResponse.json({ id, upload: { url: await files.signed(key, 'PUT', 3600), via: 'storage' }, fallback: c.size <= APP_UPLOAD_LIMIT ? viaApp : null });
  }
  return NextResponse.json({ id, upload: { url: viaApp, via: 'app' }, fallback: null });
}
