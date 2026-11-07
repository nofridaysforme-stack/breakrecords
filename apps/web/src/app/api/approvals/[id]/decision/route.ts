import { DecideCommand } from '@breakrecords/contract';
import { errorResponse, handle } from '@/server/approvals';

type Ctx = { params: Promise<{ id: string }> };

/** Approve, or reject with a reason. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const cmd = DecideCommand.safeParse(raw);
  if (!cmd.success) {
    const missingReason = raw && typeof raw === 'object' && (raw as { action?: string }).action === 'reject';
    return missingReason ? errorResponse('reason_required', 'A rejection needs a reason.') : errorResponse('invalid', cmd.error.issues[0]?.message ?? 'Invalid decision');
  }
  return handle((b) => b.decide(id, cmd.data));
}

/** Undo, allowed until the action executes. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle((b) => b.undo([id]));
}
