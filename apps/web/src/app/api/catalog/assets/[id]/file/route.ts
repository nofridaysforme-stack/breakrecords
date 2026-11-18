import { NextResponse } from 'next/server';
import { documentStore } from '@/server/documents/storage';
import { payoutErr as err } from '@/server/teamRoute';
import { assetFor } from '../lookup';

/** Downloads an uploaded file: a short-lived storage link, or the file itself. Owners and team only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await assetFor((await params).id);
  if ('refused' in found) return found.refused;
  if (!found.asset?.ready) return err(404, 'not_found', 'No such file.');
  const files = documentStore(found.live);
  if (files.signed) return NextResponse.redirect(await files.signed(found.asset.key, 'GET', 300), 302);
  const body = await files.get(found.asset.key);
  if (!body) return err(404, 'not_found', 'The file isn’t in storage.');
  return new NextResponse(body as BodyInit, { headers: {
    'content-type': found.asset.contentType || 'application/octet-stream',
    'content-disposition': `attachment; filename="${found.asset.name.replace(/[^\w.\- ]+/g, '')}"`,
  } });
}
