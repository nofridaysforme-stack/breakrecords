import { SaveSplitDraftCommand } from '@breakrecords/contract';
import { splitError, splitWrite } from '@/server/splitsRoute';

/** Edit the open draft. Refused once it's sent. */
export async function PUT(req: Request, { params }: { params: Promise<{ node: string }> }) {
  const cmd = SaveSplitDraftCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return splitError('invalid', cmd.error.issues[0]?.message ?? 'Send the draft terms.');
  return splitWrite((await params).node, { kind: 'draft', terms: cmd.data.terms });
}
