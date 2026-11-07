import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { Money } from '@/components/ui/Money';
import { resolvePayee, withAs } from '@/components/portal/payee';
import { getStatement } from '@/data/api';
import s from '@/components/portal/Portal.module.css';

export const metadata: Metadata = { title: 'Statements' };

type Props = { searchParams: Promise<{ as?: string }> };

export default async function PortalStatements({ searchParams }: Props) {
  const p = resolvePayee((await searchParams).as);
  return (
    <>
      <h1 className={s.h1}>Statements</h1>
      <ul className={s.list} style={{ maxWidth: 640 }}>
        {p.statementIds.map((id) => getStatement(id)!).map((st) => (
          <li key={st.id}><Link href={withAs(`/portal/statements/${st.id}`, p.id)} className={s.listRow}><span>{st.period} · {st.release}</span><span className={s.listAmount}><Money cents={st.net} /><ChevronRight size={14} aria-hidden="true" /></span></Link></li>
        ))}
      </ul>
    </>
  );
}
