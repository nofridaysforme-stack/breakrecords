import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { resolvePayee } from '@/components/portal/payee';
import s from '@/components/portal/Portal.module.css';

export const metadata: Metadata = { title: 'Tax forms' };

type Props = { searchParams: Promise<{ as?: string }> };

export default async function TaxPage({ searchParams }: Props) {
  const p = resolvePayee((await searchParams).as);
  return (
    <>
      <h1 className={s.h1}>Tax forms</h1>
      <section className={s.card} aria-labelledby="form" style={{ maxWidth: 560 }}>
        <h2 id="form" className={s.cardTitle}>{p.tax.form}</h2>
        <p className={s.taxOk}><Check size={16} strokeWidth={3} aria-hidden="true" />{p.tax.label}</p>
        <p className={s.note}>{p.tax.expires}. Northline can pay you in full while this form is valid. If it lapses, US rules require 24% to be withheld.</p>
      </section>
    </>
  );
}
