import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { DepartmentsView } from '@/components/departments/DepartmentsView';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getDepartments } from '@/data/api';

export const metadata: Metadata = { title: 'Departments' };

type Props = { searchParams: Promise<{ state?: string; dept?: string }> };

export default async function DepartmentsPage({ searchParams }: Props) {
  const q = await searchParams;
  return <Page><ScreenState scenario={toScenario(q.state)} copy={OPS_STATES.departments} heading="Departments"><DepartmentsView data={await getDepartments()} initialId={q.dept} /></ScreenState></Page>;
}
