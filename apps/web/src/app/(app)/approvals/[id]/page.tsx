import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { DetailView } from '@/components/detail/DetailView';
import { approvalIds, getApproval } from '@/data/api';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = getApproval((await params).id);
  return { title: d ? d.title : 'Approval not found' };
}

export default async function ApprovalDetailPage({ params }: Params) {
  const { id } = await params;
  const detail = getApproval(id);
  if (!detail) notFound();
  const ids = approvalIds();
  const nextId = ids[(ids.indexOf(id) + 1) % ids.length];
  const next = nextId && nextId !== id ? getApproval(nextId) : null;
  return (
    <Page bare>
      <DetailView detail={detail} next={next ? { id: next.id, title: next.title } : null} />
    </Page>
  );
}
