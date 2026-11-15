import { redirect } from 'next/navigation';

// Releases live in Catalog › Releases now; in-progress runbooks are at the top of it.
export default function ReleasesPage() {
  redirect('/catalog/releases#in-progress');
}
