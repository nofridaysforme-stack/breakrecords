import type { Metadata } from 'next';
import { EarningsView } from '@/components/portal/EarningsView';
import { resolvePayee } from '@/components/portal/payee';
import { getStatement } from '@/data/api';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import { toScenario } from '@/data/types';

export const metadata: Metadata = { title: 'Earnings' };

type Props = { searchParams: Promise<{ as?: string; state?: string }> };

export default async function PortalHome({ searchParams }: Props) {
  const q = await searchParams;
  const p = resolvePayee(q.as);
  const scenario = toScenario(q.state);
  return (
    <>
      {scenario !== 'default' && <h1 className="visually-hidden">Earnings</h1>}
      <ScreenState scenario={scenario} copy={STATES.portal}><EarningsView p={p} statements={p.statementIds.map((id) => getStatement(id)!)} /></ScreenState>
    </>
  );
}
