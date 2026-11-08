import { SignSplitCommand } from '@breakrecords/contract';
import { splitError, splitWrite } from '@/server/splitsRoute';

/** Sign as one party. The last signature puts the version in effect. */
export async function POST(req: Request, { params }: { params: Promise<{ node: string }> }) {
  const cmd = SignSplitCommand.safeParse(await req.json().catch(() => null));
  if (!cmd.success) return splitError('invalid', 'Say which party is signing: producer, label, artist or feature.');
  return splitWrite((await params).node, { kind: 'sign', role: cmd.data.role });
}
