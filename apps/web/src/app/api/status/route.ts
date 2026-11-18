import { NextResponse } from 'next/server';
import { authRequired, getContext } from '@/server/context';
import { MODULE_LABEL, sampleModules } from '@/server/modules';
import { documentStore } from '@/server/documents/storage';

/**
 * What this deployment is set up with, for its owners and for the staging gate: which parts are
 * still on sample data (anything done there isn't saved), where files are stored, and whether the
 * daily agents run has its secret. Names only; never a value.
 */
export async function GET() {
  if (authRequired() && !(await getContext())) return NextResponse.json({ error: 'unauthorized', message: 'Sign in to continue.' }, { status: 401 });
  const sample = await sampleModules();
  let storage: string;
  try { storage = documentStore(true).kind; } catch { storage = 'none'; }
  return NextResponse.json({
    sample: sample.map((m) => ({ module: m, label: MODULE_LABEL[m] })),
    files: storage,
    dailyAgents: !!process.env.CRON_SECRET,
  });
}
