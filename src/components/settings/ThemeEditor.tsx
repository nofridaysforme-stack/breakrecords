'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, Circle, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatRatio, isHex } from '@/lib/contrast';
import { checkTheme, THEME_FIELDS, themeVars, type ThemeColors } from '@/lib/theme';
import type { getTheme } from '@/data/api';
import o from '@/components/ops/Ops.module.css';
import s from './Theme.module.css';

type Data = ReturnType<typeof getTheme>;
const KEY = 'br.theme.harbor.v1';

/** Writes the theme's variables onto an element, so everything inside re-skins at runtime. */
export function applyTheme(el: HTMLElement, colors: ThemeColors) {
  const vars = themeVars(colors);
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  return () => Object.keys(vars).forEach((k) => el.style.removeProperty(k));
}

/** 5i. Five colors drive the whole token set. Publishing is blocked while any text pair fails AA. */
export function ThemeEditor({ data }: { data: Data }) {
  const [colors, setColors] = useState<ThemeColors>(data.theme);
  const [draft, setDraft] = useState<Record<keyof ThemeColors, string>>(data.theme);
  const [published, setPublished] = useState<ThemeColors | null>(null);
  const [onApp, setOnApp] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => { try { const raw = sessionStorage.getItem(KEY); if (raw) { const t = JSON.parse(raw); setPublished(t); setColors(t); setDraft(t); } } catch { /* none */ } }, []);
  // "Try it on this app": the same variables on <html>, removed when you turn it off or leave.
  useEffect(() => (onApp ? applyTheme(document.documentElement, colors) : undefined), [onApp, colors]);
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo); }, [logo]);

  const checks = useMemo(() => checkTheme(colors), [colors]);
  const failing = checks.filter((c) => !c.pass);
  const valid = Object.values(draft).every(isHex);
  const dirty = !published || THEME_FIELDS.some((f) => published[f.key] !== colors[f.key]);
  const previewStyle = useMemo(() => themeVars(colors) as CSSProperties, [colors]);

  const set = (key: keyof ThemeColors, v: string) => {
    const val = v.startsWith('#') ? v : `#${v}`;
    setDraft((d) => ({ ...d, [key]: v }));
    if (isHex(val)) setColors((c) => ({ ...c, [key]: val.toLowerCase() }));
  };

  const publish = () => {
    if (failing.length || !valid) return;
    setPublished(colors);
    try { sessionStorage.setItem(KEY, JSON.stringify(colors)); } catch { /* ignore */ }
  };

  const reason = !valid ? 'Every color needs a 6-digit hex value.' : failing.length ? `${failing.length} text ${failing.length === 1 ? 'pair fails' : 'pairs fail'} WCAG AA. Fix ${failing.length === 1 ? 'it' : 'them'} to publish.` : 'No changes to publish.';

  return (
    <div className={s.layout}>
      <div className={s.editor}>
        <div><p className={o.crumb}><Link href="/settings/routing">Settings</Link> / White label</p><h1 className={s.title}>Theme for {data.tenant.name}</h1></div>

        <section className={s.group} aria-labelledby="logo-h">
          <h2 id="logo-h" className={o.eyebrow}>Logo</h2>
          <label className={s.drop}>
            {logo ? <img src={logo} alt={`${data.tenant.name} logo`} className={s.logoImg} /> : <span>drop logo · SVG or PNG</span>}
            <input type="file" accept="image/svg+xml,image/png" className="visually-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogo(URL.createObjectURL(f)); }} />
          </label>
        </section>

        <section className={s.group} aria-labelledby="col-h">
          <h2 id="col-h" className={o.eyebrow}>Colors</h2>
          <ul>
            {THEME_FIELDS.map((f) => {
              const bad = !isHex(draft[f.key].startsWith('#') ? draft[f.key] : `#${draft[f.key]}`);
              return (
                <li key={f.key} className={s.token}>
                  <input type="color" className={s.swatch} value={colors[f.key]} onChange={(e) => set(f.key, e.target.value)} aria-label={`${f.label} color picker`} />
                  <label htmlFor={`hex-${f.key}`} className={s.tokenName}>{f.label}</label>
                  <input id={`hex-${f.key}`} className={s.hex} value={draft[f.key]} spellCheck={false} maxLength={7} aria-invalid={bad} onChange={(e) => set(f.key, e.target.value.trim())} />
                </li>
              );
            })}
          </ul>
          {failing.length === 0 && valid ? (
            <p className={`${s.aa} ${o.good}`} role="status"><Check size={13} strokeWidth={2.5} aria-hidden="true" />All text pairs pass WCAG AA</p>
          ) : (
            <div role="status">
              <p className={`${s.aa} ${o.critical}`}><CircleAlert size={13} strokeWidth={2.5} aria-hidden="true" />{valid ? `${failing.length} text ${failing.length === 1 ? 'pair fails' : 'pairs fail'} WCAG AA. Publishing is blocked.` : 'Enter a 6-digit hex value for every color.'}</p>
              <ul className={s.fails}>{failing.map((c) => <li key={c.pair}>{c.pair}: {formatRatio(c.ratio)}, needs 4.5:1</li>)}</ul>
            </div>
          )}
          <details className={s.details}><summary className={o.linkInline}>See every pair checked</summary>
            <ul className={s.fails}>{checks.map((c) => <li key={c.pair}>{c.pass ? 'Pass' : 'Fail'} · {c.pair}: {formatRatio(c.ratio)}</li>)}</ul>
          </details>
        </section>

        <dl className={o.kv} id="dns">
          <dt>Domain</dt><dd className={o.kvMono}>{data.tenant.domain}</dd>
          <dt>Email sender</dt><dd className={o.kvMono}>{data.tenant.email}</dd>
          <dt>DNS</dt><dd className={`${o.warnText} ${s.dns}`}><Circle size={12} strokeWidth={2.5} aria-hidden="true" />{data.tenant.dns}</dd>
        </dl>

        <section className={s.group} aria-labelledby="sub-h">
          <h2 id="sub-h" className={o.eyebrow}>Sub-tenants</h2>
          <ul>{data.tenant.subTenants.map((t) => <li key={t.name} className={s.sub}><span>{t.name}</span><span className={o.text2}>{t.artists} artists</span></li>)}</ul>
        </section>
      </div>

      <section className={s.previewCol} aria-labelledby="pv-h">
        <div className={s.previewHead}>
          <h2 id="pv-h" className={o.eyebrow}>Preview</h2>
          <div className={o.actions}>
            <Button size="sm" onClick={() => setOnApp((v) => !v)} aria-pressed={onApp} disabled={!valid} disabledReason="Every color needs a 6-digit hex value.">{onApp ? 'Stop trying on this app' : 'Try it on this app'}</Button>
            <Button variant="primary" id="publish" onClick={publish} disabled={!!failing.length || !valid || !dirty} disabledReason={reason}>Publish theme</Button>
          </div>
        </div>
        {(failing.length > 0 || !valid) && <p className={`${o.small} ${o.critical}`}>{reason}</p>}
        {published && !dirty && <p className={o.toast} role="status"><Check size={16} className={o.good} aria-hidden="true" />Published for {data.tenant.name}. Its artists see it next time they load the app.</p>}
        <div className={s.preview} style={previewStyle} aria-label={`${data.tenant.name} app preview`} role="img">
          <div className={s.pSide}>
            {logo ? <img src={logo} alt="" className={s.pLogo} /> : <span className={s.pBrand}>{data.tenant.name}</span>}
            <span className={`${s.pNav} ${s.pNavOn}`}>Home</span><span className={s.pNav}>Approvals</span><span className={s.pNav}>Releases</span><span className={s.pNav}>Money</span>
          </div>
          <div className={s.pMain}>
            <div className={s.pBlock}>
              <span className={s.pEyebrow}>Label Head · Weekly brief</span>
              <span className={s.pHello}>Good morning.</span>
              <span className={s.pText}>Your release is on track and two items need you.</span>
            </div>
            <div className={s.pCard}>
              <span className={s.pCardTitle}>Payout batch for October</span>
              <span className={s.pMoney}>$1,240.18 to 6 payees</span>
              <span className={s.pBtns}><span className={s.pPrimary}>Approve</span><span className={s.pSecondary}>Review</span></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
