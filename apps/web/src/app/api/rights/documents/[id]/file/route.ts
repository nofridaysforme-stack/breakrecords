import { payoutErr, teamWriter } from '@/server/teamRoute';

type Params = { params: Promise<{ id: string }> };

/** Downloads a prepared PDF (or its spreadsheet, ?format=csv). Only the label that owns it can. */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'pdf';
  const w = await teamWriter('documents', 'documents');
  if ('refused' in w) return w.refused;
  const file = w.ctx
    ? await (await import('@/server/live/documents')).liveDocumentFile(w.ctx, id, format)
    : await (await import('@/server/mockDocuments')).mockDocumentFile(id, format);
  if (!file) return payoutErr(404, 'not_found', 'No such document.');
  return new Response(file.body as BodyInit, {
    headers: {
      'content-type': format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${file.name.replace(/"/g, '')}"`,
      'cache-control': 'private, no-store',
    },
  });
}
