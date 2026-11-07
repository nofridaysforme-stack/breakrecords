'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PageTitle } from '@/components/type/Type';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { VerifiedStamp } from '@/components/ui/Blocks';
import { Term } from '@/components/ui/Controls';
import type { royalties as R } from '@/data/money';
import { Filter } from './Filter';
import s from './Money.module.css';

export function RoyaltiesView({ data }: { data: typeof R }) {
  const [artist, setArtist] = useState('All');
  const [matched, setMatched] = useState(data.stats.matched);
  const dialog = useRef<HTMLDialogElement>(null);
  const unmatched = data.stats.lines - matched;
  const pctMatched = (matched / data.stats.lines) * 100;
  const a = data.byArtist.find((x) => x.name === artist);
  const max = Math.max(...data.sources.map((x) => x.amount));
  const terms: Record<string, 'MLC' | 'PRO' | 'SoundExchange'> = { MLC: 'MLC', PRO: 'PRO', SoundExchange: 'SoundExchange' };

  return (
    <>
      <div className={s.head}>
        <div><PageTitle>Royalties</PageTitle><p className={s.sub}>{data.period} · {artist === 'All' ? 'all artists' : artist}</p></div>
        <div className={s.filters}>
          <Filter label="Period" value="Oct 2026" options={['Oct 2026']} onChange={() => undefined} />
          <Filter label="Artist" value={artist} options={['All', ...data.byArtist.map((x) => x.name)]} onChange={setArtist} />
        </div>
      </div>

      <dl className={s.stats}>
        <div className={s.stat}><dt className={s.statLabel}>Income this period</dt><dd className={s.statValue}><Money cents={a ? a.amount : data.stats.income} /></dd><dd className={s.statNote} style={{ margin: 0 }}>{a ? a.meta : data.stats.incomeNote}</dd></div>
        <div className={s.stat}><dt className={s.statLabel}>Paid to payees</dt><dd className={s.statValue}><Money cents={data.stats.paid} /></dd><dd className={s.statNote} style={{ margin: 0 }}>{data.stats.paidNote}</dd></div>
        <div className={s.stat}><dt className={s.statLabel}>Matched lines</dt><dd className={s.statValue}>{pctMatched.toFixed(1)}%</dd><dd className={s.statNote} style={{ margin: 0 }}>{matched.toLocaleString('en-US')} of {data.stats.lines.toLocaleString('en-US')}</dd></div>
        <div className={s.stat}><dt className={s.statLabel}>Unclaimed found</dt><dd className={s.statValue}><Money cents={data.stats.unclaimed} /></dd><dd className={s.statNote} style={{ margin: 0 }}>{data.stats.unclaimedNote}</dd></div>
      </dl>

      <div className={s.grid2}>
        <section className={s.card} aria-labelledby="by-source">
          <h2 id="by-source" className={s.cardTitle}>By source</h2>
          {artist !== 'All' && <p className={s.small}>Sources are shown for all artists.</p>}
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.sources.map((x) => (
              <li key={x.name} className={s.source}>
                <span>{terms[x.name] ? <Term term={terms[x.name]} /> : x.name}</span>
                <span className={s.track} aria-hidden="true"><span className={s.fill} style={{ display: 'block', width: `${(x.amount / max) * 100}%` }} /></span>
                <span className={s.amount}><Money cents={x.amount} /></span>
              </li>
            ))}
          </ul>
        </section>
        <section className={s.card} aria-labelledby="by-artist">
          <h2 id="by-artist" className={s.cardTitle}>By artist</h2>
          <ul>
            {data.byArtist.map((x) => (
              <li key={x.name} className={s.row} style={x.name === artist ? { background: 'var(--surface-raised)', paddingInline: 8, borderRadius: 'var(--r-control)' } : undefined}>
                <span><span className={s.rowName} style={{ display: 'block' }}>{x.name}</span><span className={s.rowMeta}>{x.meta}</span></span>
                <span className={s.amountStrong}><Money cents={x.amount} /></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className={s.grid2even}>
        <section className={s.card} aria-labelledby="unmatched">
          <div className={s.cardHead}><h2 id="unmatched" className={s.cardTitle}>Unmatched lines <span className={s.accent}>{unmatched}</span></h2><span className={s.monoMeta}>{matched.toLocaleString('en-US')} of {data.stats.lines.toLocaleString('en-US')} matched</span></div>
          <div className={s.matchTrack} role="progressbar" aria-valuenow={Math.round(pctMatched)} aria-valuemin={0} aria-valuemax={100} aria-label={`${pctMatched.toFixed(1)}% of statement lines matched`}><div className={s.matchFill} style={{ width: `${pctMatched}%` }} /></div>
          {unmatched > 3 ? (
            <>
              <p className={s.text}>{data.unmatched.count} lines worth <Money cents={data.unmatched.value} /> have an <Term term="ISRC" /> we don&apos;t recognize. {data.unmatched.note}</p>
              <div><Button variant="primary" onClick={() => dialog.current?.showModal()}>Resolve {unmatched} lines</Button></div>
            </>
          ) : (
            <p className={s.text} role="status">24 lines matched to Night Bus. {unmatched} lines are still unknown; Royalties Agent asked the distributor about them.</p>
          )}
        </section>
        <section className={s.card} aria-labelledby="zero">
          <h2 id="zero" className={s.cardTitle}>Tracks that earned $0.00</h2>
          <ul>
            {data.zeroTracks.map((z) => (
              <li key={z.name} className={s.row}><span>{z.name} <span className={s.rowMeta}>· {z.streams.toLocaleString('en-US')} streams</span></span><span className={s.tag}>Under 1,000 streams</span></li>
            ))}
          </ul>
          <p className={s.small}>Spotify pays nothing on tracks under 1,000 yearly streams. This is expected, not an error.</p>
          <VerifiedStamp what="Policy last verified" date={data.policyVerified.date} href={data.policyVerified.href} />
        </section>
      </div>

      <dialog ref={dialog} className={s.drawer} aria-labelledby="resolve" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className={s.drawerHead}><h2 id="resolve" className={s.cardTitle}>Resolve {unmatched} lines</h2><button type="button" className={s.iconBtn} aria-label="Close" onClick={() => dialog.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <p className={s.text}><strong style={{ color: 'var(--text)' }}>24 lines</strong> carry ISRC USNL1250008, one digit short of Night Bus (USNL12500008). I think it&apos;s a typo in the distributor&apos;s metadata. I haven&apos;t confirmed it with them.</p>
        <p className={s.text}><strong style={{ color: 'var(--text)' }}>3 lines</strong> don&apos;t look like anything in your catalog. I&apos;ll ask the distributor.</p>
        <div className={s.formActions}>
          <Button variant="primary" onClick={() => { setMatched(data.stats.lines - 3); dialog.current?.close(); }}>Match 24 lines to Night Bus</Button>
          <Button onClick={() => dialog.current?.close()}>Not now</Button>
        </div>
      </dialog>
    </>
  );
}
