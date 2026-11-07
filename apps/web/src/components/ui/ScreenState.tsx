import type { ReactNode } from 'react';
import type { Scenario } from '@/data/types';
import { AgentChip } from './Status';
import { Button, ButtonLink } from './Button';
import { EmptyState, ErrorNotice, PartialNotice, Skeleton, WorkingNote } from './Blocks';
import { RiskFlag } from './Status';
import { PageTitle } from '@/components/type/Type';
import s from './Blocks.module.css';

export type StateCopy = {
  empty: { title: string; text: string; action: { label: string; href: string } };
  working: { agent: string; task: string; note: string };
  blocked: { title: string; text: ReactNode; action: { label: string; href: string } };
  error: { title: string; text: ReactNode; meta: string; retry: string };
  partial: { text: ReactNode; action: string };
};

/**
 * The five data states (flows.md > States) for any screen. Empty and working replace the
 * screen; blocked, error and partial sit above it, so what is known stays visible.
 */
export function ScreenState({ scenario, copy, children, heading }: { scenario: Scenario; copy: StateCopy; children: ReactNode; heading?: string }) {
  // Empty and working replace the screen, so they bring back its page title.
  const title = heading ? <PageTitle>{heading}</PageTitle> : null;
  switch (scenario) {
    case 'empty':
      return <>{title}<EmptyState title={copy.empty.title} action={<ButtonLink href={copy.empty.action.href}>{copy.empty.action.label}</ButtonLink>}>{copy.empty.text}</EmptyState></>;
    case 'working':
      return (
        <>{title}<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true">
          <div><AgentChip agent={copy.working.agent} state="working" task={copy.working.task} boxed /></div>
          <Skeleton height={96} /><Skeleton height={180} /><Skeleton height={120} faded />
          <WorkingNote>{copy.working.note}</WorkingNote>
        </div></>
      );
    case 'blocked':
      return (
        <>
          <section className={s.notice} aria-labelledby="blocked-title">
            <h2 id="blocked-title" className={s.noticeHead} style={{ color: 'var(--text)' }}><RiskFlag risk="blocked" strong /> {copy.blocked.title}</h2>
            <p className={s.noticeBody}>{copy.blocked.text}</p>
            <div className={s.noticeActions}><ButtonLink href={copy.blocked.action.href} variant="primary">{copy.blocked.action.label}</ButtonLink></div>
          </section>
          {children}
        </>
      );
    case 'error':
      return (
        <>
          <ErrorNotice heading={copy.error.title} meta={copy.error.meta} actions={<Button variant="primary">{copy.error.retry}</Button>}>{copy.error.text}</ErrorNotice>
          {children}
        </>
      );
    case 'partial':
      return <><PartialNotice action={<Button variant="primary">{copy.partial.action}</Button>}>{copy.partial.text}</PartialNotice>{children}</>;
    default:
      return <>{children}</>;
  }
}
