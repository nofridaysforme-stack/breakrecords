import { NextResponse } from 'next/server';
import { documentStore } from '@/server/documents/storage';
import { payoutErr as err } from '@/server/teamRoute';
import { assetFor } from '../lookup';

/** Receives a file sent through the app (up to 4 MB on Vercel) and stores it. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await assetFor((await params).id);
  if ('refused' in found) return found.refused;
  if (!found.asset) return err(404, 'not_found', 'No such upload.');
  if (found.asset.ready) return err(409, 'done', 'That file is already uploaded.');
  const body = new Uint8Array(await req.arrayBuffer());
  if (!body.byteLength) return err(400, 'invalid', 'The file arrived empty.');
  await documentStore(found.live).put(found.asset.key, body, req.headers.get('content-type') || found.asset.contentType || 'application/octet-stream');
  return NextResponse.json({ ok: true, size: body.byteLength });
}
