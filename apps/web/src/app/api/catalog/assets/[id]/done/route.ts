import { NextResponse } from 'next/server';
import { getCatalog } from '@/data/api';
import { liveFinishAsset, mockFinishAsset } from '@/server/assets';
import { documentStore } from '@/server/documents/storage';
import { payoutErr as err } from '@/server/teamRoute';
import { assetFor } from '../lookup';

/** Confirms an upload: the file must really be in storage. Then the asset is ready. Returns the catalog. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await assetFor(id);
  if ('refused' in found) return found.refused;
  if (!found.asset) return err(404, 'not_found', 'No such upload.');
  const size = await documentStore(found.live).size(found.asset.key);
  if (!size) return err(409, 'missing', 'The file didn’t arrive in storage. Try uploading it again.');
  const who = found.ctx as { ctx: Parameters<typeof liveFinishAsset>[0] | null };
  if (who.ctx) await liveFinishAsset(who.ctx, id, size); else await mockFinishAsset(id, size);
  return NextResponse.json(await getCatalog());
}
