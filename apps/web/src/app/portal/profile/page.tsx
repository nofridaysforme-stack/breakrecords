import type { Metadata } from 'next';
import { ProfileView } from '@/components/portal/ProfileView';
import { resolvePayee } from '@/components/portal/payee';

export const metadata: Metadata = { title: 'Profile' };

type Props = { searchParams: Promise<{ as?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  return <ProfileView p={resolvePayee((await searchParams).as)} />;
}
