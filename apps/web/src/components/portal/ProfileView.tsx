'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Payee } from '@/data/money';
import s from './Portal.module.css';

export function ProfileView({ p }: { p: Payee }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const valid = /^\d{9}$/.test(routing) && /^\d{4,17}$/.test(account);
  return (
    <>
      <h1 className={s.h1}>Profile</h1>
      <section className={s.card} aria-labelledby="bank" style={{ maxWidth: 560 }}>
        <h2 id="bank" className={s.cardTitle}>Bank details</h2>
        <p className={s.promptText}>{saved || p.bank ? `Payments go to ${p.bank ? p.bank.name.toLowerCase() : 'the account'} ending ${saved ?? p.bank!.last4}.` : 'No bank account on file yet. Add one to get paid.'}</p>
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (valid) { setSaved(account.slice(-4)); setRouting(''); setAccount(''); } }}>
          <label className={s.field}>Routing number<input className={s.input} inputMode="numeric" autoComplete="off" value={routing} onChange={(e) => setRouting(e.target.value.replace(/\D/g, ''))} maxLength={9} /></label>
          <label className={s.field}>Account number<input className={s.input} inputMode="numeric" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ''))} maxLength={17} /></label>
          <p className={s.note}>Changes apply from the next payout. Northline sees only the last 4 digits.</p>
          <div><Button type="submit" variant="primary" disabled={!valid} disabledReason="Enter a 9-digit routing number and an account number.">Save bank details</Button></div>
          {saved && <p className={s.ok} role="status">Saved. Payments now go to the account ending {saved}.</p>}
        </form>
      </section>
    </>
  );
}
