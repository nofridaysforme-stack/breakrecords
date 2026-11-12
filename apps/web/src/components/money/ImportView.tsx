'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, CircleAlert, Upload } from 'lucide-react';
import type { ImportPreviewResponse, ImportsResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import s from './Money.module.css';

const FIELDS = [
  { id: 'title', label: 'Track title', required: true }, { id: 'amount', label: 'Amount earned', required: true }, { id: 'period', label: 'Month', required: true },
  { id: 'isrc', label: 'ISRC' }, { id: 'artist', label: 'Artist' }, { id: 'store', label: 'Store' }, { id: 'territory', label: 'Country' }, { id: 'units', label: 'Units or streams' },
] as const;
type Field = (typeof FIELDS)[number]['id'];
type Mapping = Partial<Record<Field, string>>;

/**
 * Import a statement: a distributor's or society's export (CSV or tab-separated). The columns
 * are matched by name and shown to check; nothing is saved until Import. Each month becomes a
 * statement; lines whose ISRC is in your catalog are matched, the rest wait in Royalties.
 */
export function ImportView({ data }: { data: ImportsResponse }) {
  const router = useRouter();
  const [provider, setProvider] = useState(data.providers[0]?.id ?? 'other');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(path: string, body: object) {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { res, out: await res.json().catch(() => null) };
  }
  async function read(next: { name: string; text: string }, prov: string, map: Mapping | null) {
    setError(null); setDone(null); setBusy(true);
    try {
      const { res, out } = await post('/api/money/imports/preview', { provider: prov, fileName: next.name, text: next.text, ...(map ? { mapping: map } : {}) });
      if (!res.ok) { setError(out?.message ?? 'That file couldn’t be read.'); setPreview(null); return; }
      setPreview(out); setMapping(out.mapping);
    } catch { setError('Couldn’t reach the server. Nothing was read.'); } finally { setBusy(false); }
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 4_000_000) { setError('That file is over 4 MB. Export one quarter or one month at a time.'); return; }
    const next = { name: f.name, text: await f.text() };
    setFile(next); setMapping(null);
    void read(next, provider, null);
  }
  async function importIt() {
    if (!file || !mapping) return;
    setError(null); setBusy(true);
    try {
      const { res, out } = await post('/api/money/imports', { provider, fileName: file.name, text: file.text, mapping });
      if (!res.ok) { setError(out?.message ?? 'That file wasn’t imported.'); return; }
      setDone(out.refs); setPreview(null); setFile(null); setMapping(null);
      router.refresh();
    } catch { setError('Couldn’t reach the server. Nothing was imported.'); } finally { setBusy(false); }
  }

  const total = preview?.months.reduce((a, m) => a + m.total, 0) ?? 0;
  const lines = preview?.months.reduce((a, m) => a + m.lines, 0) ?? 0;
  const unmatched = preview?.months.reduce((a, m) => a + m.unmatched, 0) ?? 0;
  const canImport = !!preview && !preview.missing.length && preview.months.length > 0 && !preview.duplicate && !busy;

  return (
    <>
      <div>
        <PageTitle>Import a statement</PageTitle>
        <p className={s.sub}>A distributor’s or society’s export, as CSV or tab-separated text. Nothing is saved until you press Import.</p>
      </div>

      <section className={s.card} aria-labelledby="file">
        <h2 id="file" className={s.cardTitle}>The file</h2>
        <div className={s.importRow}>
          <div className={s.importField}><label htmlFor="imp-provider">From</label>
            <select id="imp-provider" className={s.policySelect} value={provider} onChange={(e) => { setProvider(e.target.value); if (file) void read(file, e.target.value, mapping); }}>
              {data.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div className={s.importField}><label htmlFor="imp-file">Statement file (CSV or TSV, up to 4 MB)</label>
            <input id="imp-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(e) => void pick(e.target.files?.[0])} /></div>
        </div>
        <p className={s.small}>Export it from your distributor’s earnings or sales report. Columns are matched by name; check them below before importing.</p>
      </section>

      {busy && <p className={s.small} role="status">Reading…</p>}
      {error && <p role="alert" className={s.text} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--critical)' }}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      {done && (
        <p role="status" className={s.text} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Check size={16} aria-hidden="true" />Imported {done.length} statement{done.length === 1 ? '' : 's'}: {done.join(', ')}. Unmatched lines are waiting in <Link href="/money/royalties" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Royalties</Link>.
        </p>
      )}

      {preview && file && (
        <>
          <section className={s.card} aria-labelledby="columns">
            <h2 id="columns" className={s.cardTitle}>Columns in {file.name}</h2>
            <div className={s.importGrid}>
              {FIELDS.map((f) => (
                <div key={f.id} className={s.importField}>
                  <label htmlFor={`map-${f.id}`}>{f.label}{'required' in f ? ' (needed)' : ''}</label>
                  <select id={`map-${f.id}`} className={s.policySelect} value={mapping?.[f.id] ?? ''}
                    onChange={(e) => { const next = { ...mapping, [f.id]: e.target.value || undefined }; setMapping(next); void read(file, provider, next); }}>
                    <option value="">Not in this file</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {preview.missing.length > 0 && <p className={s.text} role="note" style={{ color: 'var(--warn)' }}>Choose the column for {preview.missing.map((m) => FIELDS.find((f) => f.id === m)?.label.toLowerCase()).join(', ')} to import.</p>}
          </section>

          {preview.months.length > 0 && (
            <section className={s.card} aria-labelledby="what">
              <h2 id="what" className={s.cardTitle}>What this file imports</h2>
              <p className={s.text}>{lines.toLocaleString('en-US')} lines, <Money cents={total} /> in all, as {preview.months.length} statement{preview.months.length === 1 ? '' : 's'}, one per month. {unmatched ? `${unmatched.toLocaleString('en-US')} line${unmatched === 1 ? '' : 's'} don’t match an ISRC in your catalog; they wait in Royalties and aren’t paid until matched.` : 'Every line matches a recording in your catalog.'}</p>
              <div className={s.tableWrap} role="region" aria-label="Statements by month" tabIndex={0}>
                <table className={s.table}>
                  <thead><tr><th scope="col">Month</th><th scope="col" className={s.r}>Lines</th><th scope="col" className={s.r}>Total</th><th scope="col" className={s.r}>Matched</th><th scope="col" className={s.r}>Unmatched</th></tr></thead>
                  <tbody>{preview.months.map((m) => (
                    <tr key={m.period}><th scope="row">{m.label}</th><td className={s.r}>{m.lines}</td><td className={`${s.r} ${s.amountStrong}`}><Money cents={m.total} /></td><td className={s.r}>{m.matched}</td><td className={s.r}>{m.unmatched ? <>{m.unmatched} · <Money cents={m.unmatchedTotal} /></> : 0}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className={s.small}>Amounts are read exactly, fractions of a cent included; each month is rounded to the cent once, so its lines add up to its total.</p>
            </section>
          )}

          {preview.problems.length > 0 && (
            <section className={s.card} aria-labelledby="left-out">
              <h2 id="left-out" className={s.cardTitle}>Rows left out ({preview.problems.length}{preview.problems.length === 50 ? '+' : ''})</h2>
              <ul>{preview.problems.slice(0, 10).map((p) => <li key={p.row} className={s.small}>Row {p.row}: {p.problem}</li>)}</ul>
            </section>
          )}

          {preview.duplicate && <p className={s.text} role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--critical)' }}><CircleAlert size={16} aria-hidden="true" />This exact file was already imported. Importing it again would count its income twice.</p>}
          <div><Button variant="primary" onClick={() => void importIt()} disabled={!canImport} disabledReason={preview.duplicate ? 'Already imported.' : 'Choose the needed columns first.'}><Upload size={14} aria-hidden="true" />Import {preview.months.length || ''} statement{preview.months.length === 1 ? '' : 's'}</Button></div>
        </>
      )}

      <section className={s.card} aria-labelledby="imported">
        <h2 id="imported" className={s.cardTitle}>Imported statements</h2>
        {data.items.length === 0 ? <p className={s.small}>Nothing imported yet.</p> : (
          <div className={s.tableWrap} role="region" aria-label="Imported statements" tabIndex={0}>
            <table className={s.table}>
              <thead><tr><th scope="col">Statement</th><th scope="col">From</th><th scope="col">Month</th><th scope="col" className={s.r}>Lines</th><th scope="col" className={s.r}>Matched</th><th scope="col" className={s.r}>Total</th><th scope="col">Imported</th></tr></thead>
              <tbody>{data.items.map((i) => (
                <tr key={i.ref}><th scope="row" className={s.form}>{i.ref}</th><td>{i.provider}<span className={s.small} style={{ display: 'block' }}>{i.fileName}</span></td><td>{i.period}</td><td className={s.r}>{i.lines}</td><td className={s.r}>{i.matched}</td><td className={`${s.r} ${s.amountStrong}`}><Money cents={i.total} /></td><td>{i.imported}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
