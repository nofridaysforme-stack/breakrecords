import { NextResponse } from 'next/server';
import { ImportStatementCommand } from '@breakrecords/contract';
import { listImports, runImport } from '@/server/imports';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';

async function readerCtx() {
  if (!authRequired() || !isLive('statements')) return null;
  return getContext();
}

/** Statements imported from files, newest first, and the sources to import from. */
export async function GET() {
  return (await teamOnly('Imports')) ?? NextResponse.json(await listImports(await readerCtx()));
}

/** Import a distributor's or society's export, one statement per month. */
export async function POST(req: Request) {
  const cmd = ImportStatementCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', cmd.error.issues[0]?.message ?? 'Send the file, its source and the column mapping.');
  const w = await teamWriter('statements', 'statements');
  if ('refused' in w) return w.refused;
  const out = await runImport(w.ctx, cmd.data);
  return out.ok ? NextResponse.json({ refs: out.refs }) : err(out.status, out.error, out.message);
}
