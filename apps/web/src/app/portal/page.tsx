import { getPortalPayee, getStatement, listStatements } from '@/data/api';
import type { Metadata } from 'next';
import { EarningsView } from '@/components/portal/EarningsView';
import { ScreenState } from '@/components/ui/ScreenState';
import { STATES } from '@/data/states';
import { toScenario } from '@/data/types';

export const metadata: Metadata = { title: 'Earnings' };

type Props = { searchParams: Promise<{ as?: string; state?: string }> };

export default async function PortalHome({ searchParams }: Props) {
  const q = await searchParams;
  const p = await getPortalPayee(q.as);
  const scenario = toScenario(q.state);
  const [first] = await listStatements(p.name);
  const latest = first ? await getStatement(first.id) : null;
  return (
    <>
      {scenario !== 'default' && <h1 className="visually-hidden">Earnings</h1>}
      <ScreenState scenario={scenario} copy={STATES.portal}><EarningsView p={p} statements={latest ? [latest] : []} /></ScreenState>
    </>
  );
}
