'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { deriveShares } from '@breakrecords/core/dealSplit';
import { formatPercent } from '@breakrecords/core/percent';
import { Button } from '@/components/ui/Button';
import o from '@/components/ops/Ops.module.css';

type Person = { id: string; name: string };
type Release = { id: string; title: string; artist: string };
type Who = { pick: 'none' | 'new' | string; name: string };

const pct = (s: string) => Math.round(Number(s || '0') * 100);

/**
 * A release's first split: the workspace is the label, the release's artist the artist, and an
 * optional producer (points off the top) and featured artist (a share of the artist's part).
 * Saved as a draft you can still change; sending it asks everyone on it to sign.
 */
export function CreateSplit({ releases, people, labelName, initialRelease }: { releases: Release[]; people: Person[]; labelName: string; initialRelease?: string }) {
  const router = useRouter();
  const [releaseId, setReleaseId] = useState(initialRelease && releases.some((r) => r.id === initialRelease) ? initialRelease : releases[0]?.id ?? '');
  const [me, setMe] = useState(false);
  const [producer, setProducer] = useState<Who>({ pick: 'none', name: '' });
  const [feature, setFeature] = useState<Who>({ pick: 'none', name: '' });
  const [points, setPoints] = useState('3');
  const [artistShare, setArtistShare] = useState('50');
  const [featureShare, setFeatureShare] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rel = releases.find((r) => r.id === releaseId);

  const hasProducer = producer.pick !== 'none'; const hasFeature = feature.pick !== 'none';
  const terms = {
    producerBp: hasProducer ? pct(points) : 0, artistOfNetBp: pct(artistShare), labelOfNetBp: 10000 - pct(artistShare), featureOfArtistBp: hasFeature ? pct(featureShare) : 0,
  };
  const inRange = (bp: number, max: number) => Number.isInteger(bp) && bp >= 0 && bp <= max;
  const valid = !!rel && inRange(terms.producerBp, 1000) && inRange(terms.artistOfNetBp, 10000) && inRange(terms.featureOfArtistBp, 10000)
    && (!hasProducer || producer.pick !== 'new' || !!producer.name.trim()) && (!hasFeature || feature.pick !== 'new' || !!feature.name.trim());
  const shares = deriveShares(terms);
  const party = (w: Who) => (w.pick === 'new' ? { name: w.name.trim() } : { partyId: w.pick });

  async function submit() {
    setError(null); setBusy(true);
    try {
      const res = await fetch('/api/splits', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ releaseId, terms, ...(me ? { artistIsMe: true } : {}), ...(hasProducer ? { producer: party(producer) } : {}), ...(hasFeature ? { feature: party(feature) } : {}) }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) { setError(out?.message ?? 'That split wasn’t saved.'); return; }
      router.push(`/splits/${out.node}`);
    } catch { setError('Couldn’t reach the server. Nothing was saved.'); } finally { setBusy(false); }
  }

  if (!releases.length) {
    return <p className={o.text}>Every release already has a split. <Link href="/catalog/releases" className={o.linkInline}>Add a release</Link> to make another.</p>;
  }
  const picker = (label: string, w: Who, set: (w: Who) => void) => (
    <>
      <div className={o.field}><label htmlFor={`f-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</label>        <select id={`f-${label.toLowerCase().replace(/\s+/g, '-')}`} className={o.input} value={w.pick} onChange={(e) => set({ ...w, pick: e.target.value })}>
          <option value="none">No {label.toLowerCase()}</option>
          {people.filter((p) => p.name !== rel?.artist).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="new">Someone new</option>
        </select>
      </div>
      {w.pick === 'new' && <label className={o.field}>{label}’s name<input className={o.input} value={w.name} onChange={(e) => set({ ...w, name: e.target.value })} maxLength={120} /></label>}
    </>
  );

  return (
    <form className={o.form} onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void submit(); }} style={{ maxWidth: 560 }}>
      <div className={o.field}><label htmlFor="f-release">Release</label>        <select id="f-release" className={o.input} value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
          {releases.map((r) => <option key={r.id} value={r.id}>{r.title} · {r.artist}</option>)}
        </select>
      </div>
      <p className={o.text}>The artist is <strong>{rel?.artist}</strong>; {labelName} is the label.</p>
      <label className={o.field} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={me} onChange={(e) => setMe(e.target.checked)} />I am {rel?.artist}, so I sign as the artist too</label>
      <label className={o.field}>Artist’s share of net profit (%)<input className={o.input} inputMode="decimal" value={artistShare} onChange={(e) => setArtistShare(e.target.value.replace(/[^\d.]/g, ''))} maxLength={6} />
        <span className={o.hint}>{labelName} gets the rest: {formatPercent(terms.labelOfNetBp)}.</span>
      </label>
      {picker('Producer', producer, setProducer)}
      {hasProducer && <label className={o.field}>Producer points (% of all income, off the top)<input className={o.input} inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d.]/g, ''))} maxLength={5} /><span className={o.hint}>Usually 2 to 4 on an indie single. At most 10.</span></label>}
      {picker('Featured artist', feature, setFeature)}
      {hasFeature && <label className={o.field}>Featured artist’s cut of the artist share (%)<input className={o.input} inputMode="decimal" value={featureShare} onChange={(e) => setFeatureShare(e.target.value.replace(/[^\d.]/g, ''))} maxLength={6} /></label>}
      <div className={o.card} aria-live="polite">
        <p className={o.cardTitle}>From every $100 this release earns</p>
        <ul className={o.text} style={{ margin: 0, paddingLeft: 18 }}>
          {hasProducer && <li>Producer: ${(shares.producer / 100).toFixed(2)}</li>}
          <li>{labelName}: ${(shares.label / 100).toFixed(2)}</li>
          <li>{rel?.artist}: ${(shares.artist / 100).toFixed(2)}</li>
          {hasFeature && <li>Featured artist: ${(shares.feature / 100).toFixed(2)}</li>}
        </ul>
      </div>
      {error && <p className={o.toast} role="alert"><CircleAlert size={16} className={o.critical} aria-hidden="true" />Not saved. {error}</p>}
      <div className={o.formActions}>
        <Button type="submit" variant="primary" disabled={!valid || busy} disabledReason="Pick a release, name everyone on it, and keep shares between 0 and 100 (producer points at most 10).">Save as draft</Button>
      </div>
      <p className={o.hint}>A draft isn’t binding. You can still change it, then send it to everyone on it to sign.</p>
    </form>
  );
}
