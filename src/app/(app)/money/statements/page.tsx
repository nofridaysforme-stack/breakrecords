import Link from 'next/link';
import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { Money } from '@/components/ui/Money';
import { listStatements } from '@/data/api';
import s from '@/components/money/Money.module.css';

export const metadata: Metadata = { title: 'Statements' };

// Undrawn: the 4d table pattern listing every statement; each opens 4c.
export default function StatementsPage() {
  const list = listStatements();
  return (
    <Page>
      <MoneyTabs />
      <div><PageTitle>Statements</PageTitle><p className={s.sub}>Every payee gets one per period. Each line links back to its source.</p></div>
      <div className={s.tableWrap} role="region" aria-label="Statements" tabIndex={0}>
        <table className={s.table}>
          <caption className="visually-hidden">Statements</caption>
          <thead><tr><th scope="col">Payee</th><th scope="col">Release</th><th scope="col">Period</th><th scope="col">Statement</th><th scope="col" className={s.r}>Net</th><th scope="col">Pays</th></tr></thead>
          <tbody>
            {list.map((st) => (
              <tr key={st.id}>
                <th scope="row"><Link href={`/money/statements/${st.id}`} style={{ color: 'var(--accent)' }}>{st.payee}</Link></th>
                <td>{st.release}</td><td>{st.period}</td><td className={s.form}>{st.id}</td>
                <td className={`${s.r} ${s.amountStrong}`} style={{ fontSize: 'var(--fs-body)' }}><Money cents={st.net} /></td>
                <td className={s.noteCell}>{st.pays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
