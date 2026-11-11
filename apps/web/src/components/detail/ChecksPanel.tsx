'use client';

import Link from 'next/link';
import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import type { CheckResult } from '@breakrecords/contract';
import s from './Checks.module.css';

const LOOK = {
  pass: { Icon: CircleCheck, word: 'Passed', cls: s.pass },
  warn: { Icon: TriangleAlert, word: 'Warning', cls: s.warn },
  fail: { Icon: CircleAlert, word: 'Failed', cls: s.fail },
  unknown: { Icon: CircleHelp, word: 'Can’t check yet', cls: s.unknown },
} as const;

const look = (r: CheckResult) => (r.status === 'fail' ? (r.severity === 'block' ? LOOK.fail : LOOK.warn) : LOOK[r.status]);
const ORDER = (r: CheckResult) => (r.status === 'fail' ? (r.severity === 'block' ? 0 : 1) : r.status === 'unknown' ? 2 : 3);

/**
 * The card's checks (the precondition engine). Failed Block rules keep Approve off; failed Warn
 * rules need a reason; rules whose facts aren't recorded yet say so and never block.
 */
export function ChecksPanel({ results }: { results: CheckResult[] }) {
  if (!results.length) return null;
  const blocks = results.filter((r) => r.status === 'fail' && r.severity === 'block').length;
  const warns = results.filter((r) => r.status === 'fail' && r.severity === 'warn').length;
  const passed = results.filter((r) => r.status === 'pass').length;
  const summary = blocks
    ? `Can’t approve yet: ${blocks} ${blocks === 1 ? 'check' : 'checks'} failed.`
    : warns ? `${warns} ${warns === 1 ? 'warning' : 'warnings'} to accept with a reason.` : `All ${passed} checks passed.`;
  return (
    <section className={s.panel} aria-labelledby="checks-h">
      <div className={s.head}>
        <h2 id="checks-h" className={s.title}>Checks</h2>
        <p className={s.summary}>{summary}</p>
      </div>
      <ul className={s.list}>
        {[...results].sort((a, b) => ORDER(a) - ORDER(b)).map((r) => {
          const { Icon, word, cls } = look(r);
          return (
            <li key={r.id} className={s.item}>
              <span className={`${s.status} ${cls}`}><Icon size={14} aria-hidden="true" />{word}</span>
              <div>
                <p className={s.rule}><span className={s.id}>{r.id}</span> {r.title}</p>
                <p className={s.message}>{r.message}</p>
                {r.fix && <Link className={s.fix} href={r.fix.href}>{r.fix.label}</Link>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
