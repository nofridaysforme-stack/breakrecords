import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { PageTitle } from '@/components/type/Type';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { Money } from '@/components/ui/Money';
import { ProgressBar } from '@/components/ui/Controls';
import { getBudgets } from '@/data/api';
import s from '@/components/money/Money.module.css';

export const metadata: Metadata = { title: 'Budgets' };

// Undrawn: one card per release from the 4e card pattern.
export default function BudgetsPage() {
  return (
    <Page>
      <MoneyTabs />
      <div><PageTitle>Budgets</PageTitle><p className={s.sub}>What each release planned to spend and what it has spent so far</p></div>
      {getBudgets().map((b) => {
        const spent = b.lines.reduce((a, l) => a + l.spent, 0);
        return (
          <section key={b.id} className={s.card} aria-labelledby={`bg-${b.id}`}>
            <div className={s.cardHead}><h2 id={`bg-${b.id}`} className={s.recoupTitle}>{b.title}</h2><span className={s.monoMeta}><Money cents={spent} /> of <Money cents={b.budget} /></span></div>
            <ProgressBar value={(spent / b.budget) * 100} label={`${Math.round((spent / b.budget) * 100)}% of the budget spent`} />
            <div className={s.tableWrap} style={{ border: 0, background: 'transparent' }} role="region" aria-label={`${b.title} budget lines`} tabIndex={0}>
              <table className={s.table}>
                <caption className="visually-hidden">{b.title} budget lines</caption>
                <thead><tr><th scope="col">Category</th><th scope="col" className={s.r}>Planned</th><th scope="col" className={s.r}>Spent</th><th scope="col" className={s.r}>Left</th></tr></thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.category}><th scope="row">{l.category}</th><td className={`${s.r} ${s.amount}`}><Money cents={l.planned} /></td><td className={`${s.r} ${s.amount}`}><Money cents={l.spent} /></td><td className={`${s.r} ${s.amount}`}><Money cents={l.planned - l.spent} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </Page>
  );
}
