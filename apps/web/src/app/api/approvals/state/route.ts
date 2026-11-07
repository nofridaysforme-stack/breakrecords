import { handle } from '@/server/approvals';

/** Every decision and in-app proposal for this session (mock) or tenant (live). */
export async function GET() {
  return handle((b) => b.state());
}
