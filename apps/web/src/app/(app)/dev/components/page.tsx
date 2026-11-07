import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { Gallery } from './Gallery';

export const metadata: Metadata = { title: 'Components' };

export default function ComponentsPage() {
  return <Page><Gallery /></Page>;
}
