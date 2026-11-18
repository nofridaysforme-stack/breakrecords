import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { CatalogView } from '@/components/catalog/CatalogView';
import { getCatalog, getPeople } from '@/data/api';

export const metadata: Metadata = { title: 'Catalog: People' };

/** Catalog > People: everyone on the catalog, and what the rights forms still need about each. */
export default async function PeoplePage() {
  return <Page bare><CatalogView data={await getCatalog()} tab="people" people={(await getPeople()).people} /></Page>;
}
