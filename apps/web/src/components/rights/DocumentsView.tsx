'use client';

import { useMemo, useState } from 'react';
import { CircleAlert, Download, FileText, Sparkles } from 'lucide-react';
import type { DocumentsResponse } from '@breakrecords/contract';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Status';
import o from '@/components/ops/Ops.module.css';
import s from './Documents.module.css';

type Subject = DocumentsResponse['subjects'][number];
type Slot = Subject['docs'][number];

const GROUPS: { subject: Subject['subject']; heading: string }[] = [
  { subject: 'work', heading: 'Songs' }, { subject: 'recording', heading: 'Recordings' }, { subject: 'release', heading: 'Releases' },
];

/** The status of a document in one pill: not prepared, gaps to fix, things to check, or ready. */
function DocStatus({ slot }: { slot: Slot }) {
  const d = slot.latest;
  if (!d) return <StatusPill status="notStarted" label="Not prepared" />;
  const fix = d.gaps.filter((g) => g.severity === 'blocker').length;
  if (fix) return <StatusPill status="blocked" label={`${fix} to fix`} />;
  if (d.gaps.length) return <StatusPill status="needsYou" label={`${d.gaps.length} to check`} />;
  return <StatusPill status="prepared" label="Ready to submit" />;
}

/** Rights → Documents: prepare, download and review the paperwork for every artist on the label. */
export function DocumentsView({ data }: { data: DocumentsResponse }) {
  const [view, setView] = useState(data);
  const [artist, setArtist] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const call = async (key: string, url: string, body: unknown, done: (v: DocumentsResponse) => string) => {
    setBusy(key); setToast(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setToast({ ok: false, text: json?.message ?? 'That didn’t go through. Nothing was changed.' }); return; }
      setView(json); setToast({ ok: true, text: done(json) });
    } catch { setToast({ ok: false, text: 'Couldn’t reach the server. Nothing was changed.' }); } finally { setBusy(null); }
  };

  const prepare = (sub: Subject, slot: Slot) => call(`${sub.id}:${slot.kind}`, '/api/rights/documents', { kind: slot.kind, subject: sub.subject, id: sub.id }, (v) => {
    const d = v.subjects.find((x) => x.subject === sub.subject && x.id === sub.id)?.docs.find((x) => x.kind === slot.kind)?.latest;
    setOpen(`${sub.subject}:${sub.id}:${slot.kind}`);
    return `${slot.label} for ${sub.title} prepared${d ? `, version ${d.version}. ${d.summary}.` : '.'}`;
  });
  const review = (sub: Subject, slot: Slot) => call(`${sub.id}:${slot.kind}:ai`, `/api/rights/documents/${slot.latest!.id}/review`, {}, () => `AI reviewed the ${slot.label.toLowerCase()} for ${sub.title}. Nothing was changed.`);
  const setAi = (on: boolean) => call('ai', '/api/rights/documents/ai', { on }, () => (on ? 'AI review is on for this label.' : 'AI review is off for this label.'));

  const shown = useMemo(() => view.subjects.filter((x) => artist === 'all' || x.artist === artist), [view, artist]);

  return (
    <>
      <div className={o.head}>
        <div>
          <PageTitle>Documents</PageTitle>
          <p className={o.sub}>Split sheets, registration packets, copyright worksheets and label copy for every artist on the label, prepared from your catalog. You review and submit them.</p>
        </div>
        <label className={s.filter}>
          <span className={s.filterLabel}>Artist</span>
          <select className={s.select} value={artist} onChange={(e) => setArtist(e.target.value)}>
            <option value="all">All artists</option>
            {view.artists.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      <section className={s.ai} aria-labelledby="ai-h">
        <Sparkles size={18} aria-hidden="true" className={s.aiIcon} />
        <div className={s.aiText}>
          <h2 id="ai-h" className={s.aiTitle}>AI review</h2>
          <p className={s.muted}>{view.ai.note}{view.ai.available && ' Names and shares are sent to Anthropic for the review; addresses and emails are not.'}</p>
        </div>
        {view.ai.available && view.ai.canChange && (
          <Button variant={view.ai.on ? 'ghost' : 'secondary'} onClick={() => setAi(!view.ai.on)} disabled={busy === 'ai'} className={s.nowrap}>
            {view.ai.on ? 'Turn off' : 'Turn on'}
          </Button>
        )}
      </section>

      {toast && (
        <p className={o.toast} role={toast.ok ? 'status' : 'alert'}>
          {!toast.ok && <CircleAlert size={16} className={o.critical} aria-hidden="true" />}{toast.text}
        </p>
      )}

      {!shown.length && <p className={s.muted}>Nothing in the catalog for this artist yet.</p>}

      {GROUPS.map((g) => {
        const subs = shown.filter((x) => x.subject === g.subject);
        if (!subs.length) return null;
        return (
          <section key={g.subject} className={s.group} aria-labelledby={`g-${g.subject}`}>
            <h2 id={`g-${g.subject}`} className={s.groupTitle}>{g.heading}</h2>
            <ul className={s.cards}>
              {subs.map((sub) => (
                <li key={sub.id} className={s.card}>
                  <div className={s.cardHead}>
                    <span className={s.title}>{sub.title}</span>
                    <span className={s.muted}>{sub.artist} · {sub.detail}</span>
                  </div>
                  <ul className={s.docs}>
                    {sub.docs.map((slot) => {
                      const key = `${sub.subject}:${sub.id}:${slot.kind}`;
                      const d = slot.latest;
                      const isOpen = open === key;
                      return (
                        <li key={slot.kind} className={s.doc}>
                          <div className={s.docRow}>
                            <span className={s.docName}><FileText size={16} aria-hidden="true" />{slot.label}</span>
                            <span className={s.status}><DocStatus slot={slot} /></span>
                            <span className={s.meta}>{d && `Version ${d.version} · ${d.preparedAt} · ${d.preparedBy}`}</span>
                            <span className={s.actions}>
                              {d && d.gaps.length > 0 && (
                                <Button variant="ghost" size="sm" aria-expanded={isOpen} aria-controls={`${key}-gaps`} onClick={() => setOpen(isOpen ? null : key)}>
                                  {isOpen ? 'Hide details' : 'What’s missing'}
                                </Button>
                              )}
                              {d && <a className={s.download} href={`/api/rights/documents/${d.id}/file`} aria-label={`Download ${slot.label} for ${sub.title} as PDF`}><Download size={14} aria-hidden="true" />PDF</a>}
                              {d?.hasCsv && <a className={s.download} href={`/api/rights/documents/${d.id}/file?format=csv`} aria-label={`Download ${slot.label} for ${sub.title} as a spreadsheet`}><Download size={14} aria-hidden="true" />CSV</a>}
                              {d && view.ai.on && (
                                <Button variant="ghost" size="sm" onClick={() => review(sub, slot)} disabled={busy === `${sub.id}:${slot.kind}:ai`}>
                                  {busy === `${sub.id}:${slot.kind}:ai` ? 'Reviewing' : 'AI review'}
                                </Button>
                              )}
                              <Button size="sm" onClick={() => prepare(sub, slot)} disabled={busy === `${sub.id}:${slot.kind}`} aria-label={`${d ? 'Prepare again' : 'Prepare'}: ${slot.label} for ${sub.title}`}>
                                {busy === `${sub.id}:${slot.kind}` ? 'Preparing' : d ? 'Prepare again' : 'Prepare'}
                              </Button>
                            </span>
                          </div>
                          {d && isOpen && (
                            <div id={`${key}-gaps`} className={s.details}>
                              <ul className={s.gaps}>
                                {d.gaps.map((gap, i) => (
                                  <li key={i} className={s.gap}>
                                    {gap.severity === 'blocker' ? <CircleAlert size={14} className={o.critical} aria-hidden="true" /> : <span className={s.gapIcon} aria-hidden="true" />}
                                    <span>{gap.severity === 'blocker' ? <strong>Fix:</strong> : <strong className={s.check}>Check:</strong>} {gap.field}. {gap.message}</span>
                                  </li>
                                ))}
                              </ul>
                              <p className={s.muted}>Fix these in the catalog, then prepare again. Earlier versions are kept.</p>
                            </div>
                          )}
                          {d?.review && (
                            <div className={s.review}>
                              <p className={s.reviewHead}><Sparkles size={14} aria-hidden="true" />AI suggestions, {d.review.at}. A person decides; nothing was changed.</p>
                              {d.review.findings.length ? (
                                <ul className={s.gaps}>{d.review.findings.map((f, i) => <li key={i}><strong>{f.severity === 'problem' ? 'Likely problem:' : 'Worth checking:'}</strong> {f.message}</li>)}</ul>
                              ) : <p className={s.muted}>No problems found beyond the gaps above.</p>}
                              <p>{d.review.nextSteps}</p>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
