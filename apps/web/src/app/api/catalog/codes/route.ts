import { NextResponse } from 'next/server';
import { SetCodePrefixesCommand } from '@breakrecords/contract';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';

/** The workspace's ISRC and GS1 prefixes, and the next code each would give. */
export async function GET() {
  const refused = await teamOnly('Code prefixes');
  if (refused) return refused;
  const ctx = authRequired() && isLive('catalog') ? await getContext() : null;
  return NextResponse.json(ctx ? await (await import('@/server/live/codes')).liveCodes(ctx) : await (await import('@/server/mockCodes')).mockCodes());
}

/** Owners set the prefixes. Audited. */
export async function PUT(req: Request) {
  const cmd = SetCodePrefixesCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return err(400, 'invalid', 'Send an ISRC prefix and a GS1 company prefix (either can be empty).');
  const w = await teamWriter('catalog', 'code prefixes');
  if ('refused' in w) return w.refused;
  const r = w.ctx
    ? await (await import('@/server/live/codes')).liveSetCodePrefixes(w.ctx, cmd.data)
    : await (await import('@/server/mockCodes')).mockSetCodePrefixes(cmd.data);
  return r.ok ? NextResponse.json(r.value) : err(r.status, r.error, r.message);
}
