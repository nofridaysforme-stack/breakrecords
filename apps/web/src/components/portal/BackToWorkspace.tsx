'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import s from './Portal.module.css';

/** From a label that pays you back to your own workspace, where your tools are. */
export function BackToWorkspace({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const res = await fetch('/api/session/tenant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: id }) }).catch(() => null);
    if (res?.ok) window.location.assign('/'); else setBusy(false);
  };
  return (
    <button type="button" className={s.back} onClick={go} disabled={busy}>
      <ArrowLeft size={14} aria-hidden="true" /><span>Back to {name}</span>
    </button>
  );
}
