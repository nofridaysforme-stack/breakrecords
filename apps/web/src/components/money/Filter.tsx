import { ChevronDown } from 'lucide-react';
import s from './Money.module.css';

export function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className={s.filter}>
      <span className={s.filterKey}>{label}</span>
      <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className={s.chev} size={12} aria-hidden="true" />
    </label>
  );
}
