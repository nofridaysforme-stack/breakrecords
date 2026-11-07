import { z } from 'zod';
import { BulkApproveCommand, Id } from '@breakrecords/contract';
import { errorResponse, handle } from '@/server/approvals';

/** Bulk approve: low risk only, never signatures, all or nothing. */
export async function POST(req: Request) {
  const cmd = BulkApproveCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return errorResponse('invalid', cmd.error.issues[0]?.message ?? 'Invalid request');
  return handle((b) => b.bulkApprove(cmd.data.ids));
}

/** Undo several decisions at once (the inbox's bulk confirmation). */
export async function DELETE(req: Request) {
  const body = z.object({ ids: z.array(Id).min(1) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse('invalid', 'Send the ids to undo.');
  return handle((b) => b.undo(body.data.ids));
}
