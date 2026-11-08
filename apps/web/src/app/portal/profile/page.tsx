import type { Metadata } from 'next';
import { ProfileView } from '@/components/portal/ProfileView';
import { getPortalPayee } from '@/data/api';

export const metadata: Metadata = { title: 'Profile' };

type Props = { searchParams: Promise<{ as?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  return <ProfileView p={await getPortalPayee((await searchParams).as)} />;
}
