import { NextResponse } from 'next/server';
import { PrepareDocumentCommand } from '@breakrecords/contract';
import { getDocuments } from '@/data/api';
import { payoutErr, teamOnly, teamWriter } from '@/server/teamRoute';

export async function GET() {
  const refused = await teamOnly('Prepared documents');
  return refused ?? NextResponse.json(await getDocuments());
}

/** Prepares the next version of a document from the catalog as it is now. */
export async function POST(req: Request) {
  const parsed = PrepareDocumentCommand.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return payoutErr(400, 'invalid', 'Say which document (kind) for which song, recording or release (subject and id).');
  const w = await teamWriter('documents', 'documents');
  if ('refused' in w) return w.refused;
  const r = w.ctx
    ? await (await import('@/server/live/documents')).livePrepareDocument(w.ctx, parsed.data)
    : await (await import('@/server/mockDocuments')).mockPrepareDocument(parsed.data);
  return r.ok ? NextResponse.json({ ...r.value, prepared: r.id }) : payoutErr(r.status, r.error, r.message);
}
