import { NextResponse } from 'next/server';
import { ImportPreviewCommand } from '@breakrecords/contract';
import { previewImport } from '@/server/imports';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Read a file without saving it: the columns, one statement per month, matches and rows left out. */
export async function POST(req: Request) {
  const cmd = ImportPreviewCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', cmd.error.issues[0]?.message ?? 'Send the file and its source.');
  const w = await teamWriter('statements', 'statements');
  if ('refused' in w) return w.refused;
  return NextResponse.json((await previewImport(w.ctx, cmd.data)).preview);
}
