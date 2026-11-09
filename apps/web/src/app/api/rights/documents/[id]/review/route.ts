import { NextResponse } from 'next/server';
import { payoutErr, teamWriter } from '@/server/teamRoute';
import { aiAvailable } from '@/server/documents/view';

type Params = { params: Promise<{ id: string }> };

/**
 * Asks AI to review a prepared document. Refused unless AI is available on the platform and
 * turned on for the label. The review is saved beside the document as a suggestion.
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const w = await teamWriter('documents', 'documents');
  if ('refused' in w) return w.refused;
  if (!aiAvailable()) return payoutErr(409, 'ai_off', 'AI review is switched off for the platform.');
  const live = w.ctx ? await import('@/server/live/documents') : null;
  const mock = w.ctx ? null : await import('@/server/mockDocuments');
  const on = live ? await live.liveAiOn(w.ctx!) : await mock!.mockAiOn();
  if (!on) return payoutErr(409, 'ai_off', 'AI review is off for this label. An owner can turn it on.');
  const doc = live ? await live.liveDocumentForReview(w.ctx!, id) : await mock!.mockDocumentForReview(id);
  if (!doc) return payoutErr(404, 'not_found', 'No such document.');
  const { reviewDocument, AiRefused } = await import('@/server/documents/ai');
  try {
    const review = await reviewDocument(doc);
    return NextResponse.json(live ? await live.liveSaveReview(w.ctx!, id, review) : await mock!.mockSaveReview(id, review));
  } catch (e) {
    if (e instanceof AiRefused) return payoutErr(422, 'ai_refused', e.message);
    console.error('AI review failed', e instanceof Error ? e.message : e);
    return payoutErr(502, 'ai_failed', 'The AI review didn’t finish. Nothing was changed; try again in a minute.');
  }
}
