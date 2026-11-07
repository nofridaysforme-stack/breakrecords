import type { Metadata } from 'next';
import { Page } from '@/components/shell/Page';
import { BigNumber, Body, CardTitle, Eyebrow, Hero, Meta, PageTitle, SectionHead } from '@/components/type/Type';
import s from './page.module.css';

export const metadata: Metadata = { title: 'Type and color' };

const ramp = [
  { spec: 'Eyebrow · Plex Mono 500 11 · upper', el: <Eyebrow>Label Head · weekly brief</Eyebrow> },
  { spec: 'Eyebrow large · Plex Mono 600 12', el: <Eyebrow large>Agent activity</Eyebrow> },
  { spec: 'Meta · Hanken 13', el: <Meta>Royalties Agent · due Nov 10</Meta> },
  { spec: 'Body · Hanken 14', el: <Body>Glasshouse is on track for March 6 and on budget.</Body> },
  { spec: 'Card title · Hanken 600 16', el: <CardTitle as="div">Payout batch for October</CardTitle> },
  { spec: 'Section · Archivo 700 20', el: <SectionHead as="div">Needs you</SectionHead> },
  { spec: 'Number · Plex Mono 600 24', el: <BigNumber>$10,000.00</BigNumber> },
  { spec: 'Page title · Archivo 800 36', el: <PageTitle as="div">Approvals</PageTitle> },
  { spec: 'Hero · Archivo 800 40', el: <Hero as="div">Good morning, Jana.</Hero> },
  { spec: 'Hero XL · Archivo 800 52', el: <Hero as="div" xl>Glasshouse</Hero> },
];

const colors = [
  'bg', 'bg-sidebar', 'surface', 'surface-raised', 'track', 'text', 'text-2', 'text-muted', 'text-faint',
  'accent', 'brand', 'good', 'warn', 'critical', 'info', 'party-1', 'party-2', 'party-3', 'party-4',
];

export default function TypePage() {
  return (
    <Page>
      <PageTitle>Type and color</PageTitle>
      <section aria-labelledby="ramp">
        <SectionHead id="ramp">Type ramp</SectionHead>
        {ramp.map((r) => (
          <div key={r.spec} className={s.row}>
            <span className={s.spec}>{r.spec}</span>
            {r.el}
          </div>
        ))}
      </section>
      <section aria-labelledby="color">
        <SectionHead id="color">Color tokens</SectionHead>
        <div className={s.swatches}>
          {colors.map((c) => (
            <div key={c} className={s.swatch}>
              <div className={s.chip} style={{ background: `var(--${c})` }} />
              <div className={s.swatchName}>--{c}</div>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}
