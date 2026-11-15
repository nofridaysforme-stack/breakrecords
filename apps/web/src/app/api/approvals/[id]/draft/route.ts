import { NextResponse } from 'next/server';
import { EditDraftCommand } from '@breakrecords/contract';
import { getApproval } from '@/data/api';
import { checkDraft, liveSaveDraft, mockSaveDraft } from '@/server/approvalDraft';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Saves new answers on an undecided application card, so what's approved is what's shown. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await teamWriter('approvals', 'approvals');
  if ('refused' in who) return who.refused;
  const body = EditDraftCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Send the answers in order.');
  const id = (await params).id;
  const d = await getApproval(id);
  const ok = checkDraft(d, body.data.values);
  if (!ok.ok) return err(ok.status, ok.error, ok.message);
  if (who.ctx) {
    const out = await liveSaveDraft(who.ctx, d!, body.data.values);
    if (!out.ok) return err(out.status, out.error, out.message);
  } else {
    await mockSaveDraft(id, body.data.values);
  }
  return NextResponse.json(await getApproval(id));
}
