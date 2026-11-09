import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { AgentRail, HomeView } from '@/components/home/HomeView';
import { getHome } from '@/data/api';
import { toScenario } from '@/data/types';
import { authRequired, getContext } from '@/server/context';

export const metadata: Metadata = { title: 'Home' };

type Props = { searchParams: Promise<{ state?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const scenario = toScenario((await searchParams).state);
  const data = await getHome(scenario);
  const label = authRequired() ? (await getContext())?.tenantName : null;
  const rail = scenario === 'empty'
    ? null
    : <AgentRail feed={data.home.feed} />;
  return (
    <Page rail={rail} railLabel="Agent activity" railOnPhone={false}>
      <HomeView scenario={scenario} home={data.home} numbers={data.numbers} notes={data.numberNotes} approvals={data.approvals} labelShort={label?.split(' ')[0] ?? 'Northline'} />
    </Page>
  );
}
