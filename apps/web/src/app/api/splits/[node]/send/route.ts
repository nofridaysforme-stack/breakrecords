import { SendSplitCommand } from '@breakrecords/contract';
import { splitError, splitWrite } from '@/server/splitsRoute';

/** Send the draft for signatures. Refused unless net profit is exactly 100%. */
export async function POST(req: Request, { params }: { params: Promise<{ node: string }> }) {
  if (!SendSplitCommand.safeParse(await req.json().catch(() => ({}))).success) return splitError('invalid', 'Send an empty object.');
  return splitWrite((await params).node, { kind: 'send' });
}
